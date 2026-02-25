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

function formatRoute(route: Prisma.RouteGetPayload<Prisma.RouteDefaultArgs>) {
  return {
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
  };
}

export async function GET(
  _request: Request,
  context: { params: { id: string } },
) {
  try {
    const targetRouteId = context.params.id;
    const route = await prisma.route.findFirst({
      where: { routeId: targetRouteId },
    });

    if (!route) {
      return NextResponse.json(
        { success: false, error: "Route not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(formatRoute(route));
  } catch (error) {
    console.error("Error fetching route:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch route" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const body = await request.json();

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

    const incomingRoute: IncomingRoute = Array.isArray(body?.routes)
      ? (body.routes[0] as IncomingRoute)
      : (body as IncomingRoute);

    const targetRouteId = context.params.id;
    const nextRouteId = incomingRoute.route_id ?? targetRouteId;

    const formattedStages = (incomingRoute.stages || []).map(
      (stage: StageIn) => ({
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
      }),
    );

    const updateResult = await prisma.route.updateMany({
      where: { routeId: targetRouteId },
      data: {
        routeId: nextRouteId,
        routeName: incomingRoute.route_name ?? "",
        avgDailyDistance: {
          set: (incomingRoute.avg_daily_distance ||
            []) as Prisma.InputJsonValue[],
        },
        startingPoint: {
          set: (incomingRoute.starting_point || []) as Prisma.InputJsonValue[],
        },
        stages: {
          set: formattedStages as unknown as Prisma.StageCreateInput[],
        },
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json(
        { success: false, error: "Route not found" },
        { status: 404 },
      );
    }

    const updated = await prisma.route.findFirst({
      where: { routeId: nextRouteId },
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Route not found after update" },
        { status: 404 },
      );
    }

    return NextResponse.json(formatRoute(updated));
  } catch (error) {
    console.error("Error updating route:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update route" },
      { status: 500 },
    );
  }
}
