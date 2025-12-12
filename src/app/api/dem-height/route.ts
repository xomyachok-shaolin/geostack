import { NextRequest, NextResponse } from 'next/server';

import { getDemHeight, type DemName } from '@/lib/utils/dem-provider';

export const runtime = 'nodejs';

function parseDemName(raw: string | null): DemName | null {
  if (!raw) return null;
  const norm = raw.toLowerCase();
  if (norm.includes('kanash')) return 'Kanash';
  if (norm.includes('krasno')) return 'Krasnoarmeiskoe';
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lonStr = searchParams.get('lon');
  const latStr = searchParams.get('lat');
  const nameStr = searchParams.get('name');

  const lon = lonStr ? Number(lonStr) : NaN;
  const lat = latStr ? Number(latStr) : NaN;
  const demName = parseDemName(nameStr);

  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !demName) {
    return NextResponse.json(
      { error: 'Invalid parameters. Expect lon, lat, name={Kanash|Krasnoarmeiskoe}' },
      { status: 400 }
    );
  }

  try {
    const height = await getDemHeight(demName, lon, lat);
    if (height === null) {
      return NextResponse.json(
        { height: null, source: demName, outside: true },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { height, source: demName },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    console.error('DEM height error:', err);
    return NextResponse.json({ error: 'DEM read error' }, { status: 500 });
  }
}

