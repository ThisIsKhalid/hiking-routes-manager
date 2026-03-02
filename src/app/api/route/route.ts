import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

function normalizeAvgDailyDistance(
  items: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => {
    const record = item as Record<string, unknown>;
    const directLabel = typeof record.label === "string" ? record.label : null;
    const rangeValue =
      typeof record.range_value === "string" ? record.range_value : null;
    const dynamicKey = Object.keys(record).find((key) =>
      key.startsWith("avg_daily_distance_"),
    );
    const dynamicLabel =
      dynamicKey && typeof record[dynamicKey] === "string"
        ? (record[dynamicKey] as string)
        : null;

    return {
      label: directLabel || rangeValue || dynamicLabel || "",
      minimum_km: record.minimum_km,
      minimum_mile: record.minimum_mile,
      maximum_km: record.maximum_km,
      maximum_mile: record.maximum_mile,
      days: record.days,
    } as Record<string, unknown>;
  });
}

export async function GET() {
  try {
    const routes = await prisma.route.findMany();

    // We need to reverse-map the data to match the requested JSON format structure if we want exact symmetry?
    // The user requested: "download all routes in json format together as it is"
    // { routes: [ { single route }, ... ] }
    // Our DB stores fields in camelCase (routeId, routeName) but input was snake_case (route_id, route_name).
    // If we want "as it is", we should probably map back to snake_case for the download.

    const formattedRoutes = routes.map((route) => ({
      route_id: route.routeId,
      route_name: route.routeName,
      avg_daily_distance: normalizeAvgDailyDistance(route.avgDailyDistance),
      starting_point: route.startingPoint || [],
      stages: route.stages.map((stage) => ({
        stage_number: stage.stageNumber,
        stage_name: stage.stageName,
        distance_km: stage.distanceKm,
        distance_miles: stage.distanceMiles,
        gpx: stage.gpx,
        details: {
          total_distance: stage.details.totalDistance,
          total_time: stage.details.totalTime,
          accumulated_ascent: stage.details.accumulatedAscent,
          accumulated_descent: stage.details.accumulatedDescent,
          walking_surface: stage.details.walkingSurface,
          elevation_profile: stage.details.elevationProfile,
          challenges: stage.details.challenges,
          highlights: stage.details.highlights,
        },
        facilities: stage.facilities.map((f) => ({
          index: f.index,
          name: f.name,
          distance: f.distance,
          services: f.services,
        })),
        accommodations: stage.accommodations.map((a) => ({
          name: a.name,
          price_category: a.priceCategory,
          contact_url: a.contactUrl,
          contact_phone: a.contactPhone,
          lat: a.lat,
          long: a.long,
        })),
      })),
    }));

    return NextResponse.json({ routes: formattedRoutes });
  } catch (error) {
    console.error("Error fetching routes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch routes" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Input types for safer handling (avoid `any` usage)
    type FacilityIn = {
      index?: number;
      name?: string | null;
      distance?: string | null;
      services?: string[];
    };

    type AccommodationIn = {
      name?: string;
      price_category?: string;
      contact_url?: string | null;
      lat?: number | null;
      long?: number | null;
      contact_phone?: string | null;
    };

    type StageIn = {
      stage_number?: number;
      stage_name?: string;
      distance_km?: number;
      distance_miles?: number;
      gpx?: string;
      details?: {
        total_distance?: number;
        total_time?: string;
        accumulated_ascent?: number;
        accumulated_descent?: number;
        walking_surface?: string[];
        elevation_profile?: string;
        challenges?: string[];
        highlights?: string[];
      };
      facilities?: FacilityIn[];
      accommodations?: AccommodationIn[];
    };

    type IncomingRoute = {
      route_id?: string;
      route_name?: string;
      stages?: StageIn[];
      avg_daily_distance?: Array<Record<string, unknown>>;
      starting_point?: Array<Record<string, unknown>>;
    };

    // Types for created DB payload mapping (camelCase shapes returned by Prisma)
    type CreatedFacility = {
      index: number;
      name: string;
      distance: string;
      services: string[];
    };

    type CreatedAccommodation = {
      name: string;
      priceCategory: string;
      contactUrl?: string | null;
      contactPhone?: string | null;
      lat?: number | null;
      long?: number | null;
    };

    type CreatedDetails = {
      totalDistance: string;
      totalTime: string;
      accumulatedAscent: string;
      accumulatedDescent: string;
      walkingSurface: string[];
      elevationProfile: string;
      challenges: string[];
      highlights: string[];
    };

    type CreatedStage = {
      stageNumber: number;
      stageName: string;
      distanceKm: number;
      distanceMiles: number;
      gpx: string;
      details: CreatedDetails;
      facilities: CreatedFacility[];
      accommodations: CreatedAccommodation[];
    };
    // Accept either `{ routes: [ ... ] }` or a single route object in the body
    const incomingRoute: IncomingRoute = Array.isArray(body?.routes)
      ? (body.routes[0] as IncomingRoute)
      : (body as IncomingRoute);

    const { route_id, route_name, stages } = incomingRoute || {};

    const formattedStages = (stages || []).map((stage: StageIn) => ({
      stageNumber: stage.stage_number ?? 0,
      stageName: stage.stage_name ?? "",
      distanceKm: stage.distance_km ?? 0,
      distanceMiles: stage.distance_miles ?? 0,
      gpx: stage.gpx ?? "",
      details: {
        totalDistance: stage.details?.total_distance ?? "",
        totalTime: stage.details?.total_time ?? "",
        accumulatedAscent: stage.details?.accumulated_ascent ?? "",
        accumulatedDescent: stage.details?.accumulated_descent ?? "",
        walkingSurface: stage.details?.walking_surface || [],
        elevationProfile: stage.details?.elevation_profile ?? "",
        challenges: stage.details?.challenges || [],
        highlights: stage.details?.highlights || [],
      },
      facilities: (stage.facilities || []).map((f: FacilityIn) => ({
        index: f.index ?? 0,
        name: f.name ?? "",
        distance: f.distance ?? "",
        services: f.services || [],
      })),
      accommodations: (stage.accommodations || []).map(
        (a: AccommodationIn) => ({
          name: a.name ?? "",
          priceCategory: a.price_category ?? "",
          contactUrl: a.contact_url ?? null,
          contactPhone: a.contact_phone ?? null,
          lat: a.lat ?? null,
          long: a.long ?? null,
        }),
      ),
    }));

    const newRoute = await prisma.route.create({
      data: {
        routeId: route_id ?? "",
        routeName: route_name ?? "",
        avgDailyDistance: (incomingRoute.avg_daily_distance ||
          []) as unknown as Prisma.InputJsonValue[],
        startingPoint: (incomingRoute.starting_point ||
          []) as unknown as Prisma.InputJsonValue[],
        stages: formattedStages as unknown as Prisma.StageCreateInput[],
      },
    });

    // Map created route to single-route snake_case response matching requested `Route` type
    const responseRoute = {
      route_id: newRoute.routeId,
      route_name: newRoute.routeName,
      avg_daily_distance: normalizeAvgDailyDistance(newRoute.avgDailyDistance),
      starting_point: (newRoute.startingPoint || []) as Prisma.InputJsonValue[],
      stages: (newRoute.stages || []).map((s: CreatedStage) => ({
        stage_number: s.stageNumber,
        stage_name: s.stageName,
        distance_km: s.distanceKm,
        distance_miles: s.distanceMiles,
        gpx: s.gpx,
        details: {
          total_distance: s.details.totalDistance,
          total_time: s.details.totalTime,
          accumulated_ascent: s.details.accumulatedAscent,
          accumulated_descent: s.details.accumulatedDescent,
          walking_surface: s.details.walkingSurface,
          elevation_profile: s.details.elevationProfile,
          challenges: s.details.challenges,
          highlights: s.details.highlights,
        },
        facilities: (s.facilities || []).map((f: CreatedFacility) => ({
          index: f.index,
          name: f.name,
          distance: f.distance,
          services: f.services,
        })),
        accommodations: (s.accommodations || []).map(
          (a: CreatedAccommodation) => ({
            name: a.name,
            price_category: a.priceCategory,
            contact_url: a.contactUrl ?? null,
            contact_phone: a.contactPhone ?? null,
            lat: a.lat ?? null,
            long: a.long ?? null,
          }),
        ),
      })),
    };

    return NextResponse.json(responseRoute);
  } catch (error) {
    console.error("Error creating route:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create route" },
      { status: 500 },
    );
  }
}
