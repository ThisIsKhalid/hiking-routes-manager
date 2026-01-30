import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Map the input JSON fields to our schema
    // The input has 'route_id', 'route_name', 'stages' which matches our schema mapping almost 1:1
    // but Prisma expects camelCase for fields if we mapped them.
    // However, our model has `routeId` mapped to `route_id`.
    // The input JSON keys ARE `route_id`.
    // We need to transform or just pass if the keys match the @map?
    // No, Prisma Client expects the property names defined in the model (e.g. `routeId`), NOT the database column names.
    // So we must verify the input and map it.

    const { route_id, route_name, stages } = body;

    const formattedStages = stages.map((stage: any) => ({
      stageNumber: stage.stage_number,
      stageName: stage.stage_name,
      distanceKm: stage.distance_km,
      distanceMiles: stage.distance_miles,
      gpx: stage.gpx,
      avgDailyDistances: stage.avg_daily_distance, // Json[]
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

    return NextResponse.json({ success: true, data: newRoute });
  } catch (error) {
    console.error('Error creating route:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create route' },
      { status: 500 }
    );
  }
}
