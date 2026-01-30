import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const routes = await prisma.route.findMany();
    
    // We need to reverse-map the data to match the requested JSON format structure if we want exact symmetry?
    // The user requested: "download all routes in json format together as it is"
    // { routes: [ { single route }, ... ] }
    // Our DB stores fields in camelCase (routeId, routeName) but input was snake_case (route_id, route_name).
    // If we want "as it is", we should probably map back to snake_case for the download.
    
    const formattedRoutes = routes.map((route: any) => ({
      route_id: route.routeId,
      route_name: route.routeName,
      stages: route.stages.map((stage: any) => ({
        stage_number: stage.stageNumber,
        stage_name: stage.stageName,
        distance_km: stage.distanceKm,
        distance_miles: stage.distanceMiles,
        gpx: stage.gpx,
        avg_daily_distance: stage.avgDailyDistances,
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
        facilities: stage.facilities.map((f: any) => ({
          index: f.index,
          services: f.services,
        })),
        accommodations: stage.accommodations.map((a: any) => ({
          name: a.name,
          price_category: a.priceCategory,
          contact_url: a.contactUrl,
          contact_phone: a.contactPhone,
        })),
      }))
    }));

    return NextResponse.json({ routes: formattedRoutes });
  } catch (error) {
    console.error('Error fetching routes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch routes' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // The body might come from our form (snake_case) or direct JSON.
    // Our form now produces snake_case to match the original JSON structure expectation.

    const { route_id, route_name, stages } = body;

    const formattedStages = stages.map((stage: any) => ({
      stageNumber: stage.stage_number,
      stageName: stage.stage_name,
      distanceKm: stage.distance_km,
      distanceMiles: stage.distance_miles,
      gpx: stage.gpx,
      // The schema field is avgDailyDistances (plural) as per user edit
      // The input json field is avg_daily_distance (singular)
      avgDailyDistances: stage.avg_daily_distance, 
      details: {
        totalDistance: stage.details.total_distance,
        totalTime: stage.details.total_time,
        accumulatedAscent: stage.details.accumulated_ascent,
        accumulatedDescent: stage.details.accumulated_descent,
        walkingSurface: stage.details.walking_surface,
        elevationProfile: stage.details.elevation_profile,
        challenges: stage.details.challenges,
        highlights: stage.details.highlights,
      },
      facilities: stage.facilities.map((f: any) => ({
        index: f.index,
        services: f.services,
      })),
      accommodations: stage.accommodations.map((a: any) => ({
        name: a.name,
        priceCategory: a.price_category,
        contactUrl: a.contact_url || null,
        contactPhone: a.contact_phone || null,
      })),
    }));

    const newRoute = await prisma.route.create({
      data: {
        routeId: route_id,
        routeName: route_name,
        stages: formattedStages,
      },
    });

    // Return the created route, maybe mapped back if needed, but for now raw is fine for response
    return NextResponse.json({ success: true, data: newRoute });
  } catch (error) {
    console.error('Error creating route:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create route' },
      { status: 500 }
    );
  }
}
