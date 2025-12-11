import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * API endpoint для получения высоты из локального DEM
 * GET /api/dem-height?lon=47.5&lat=55.5&name=kanash
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lon = searchParams.get('lon');
    const lat = searchParams.get('lat');
    const name = searchParams.get('name') || 'kanash';

    if (!lon || !lat) {
      return NextResponse.json(
        { error: 'Missing lon or lat parameters' },
        { status: 400 }
      );
    }

    // Путь к DEM файлу
    const demPath = path.join(
      process.cwd(),
      'data',
      'terrain',
      `dem_UTM_${name}.tif`
    );

    // Используем gdallocationinfo для получения высоты
    const { stdout } = await execAsync(
      `gdallocationinfo -wgs84 -valonly "${demPath}" ${lon} ${lat}`
    );

    const height = parseFloat(stdout.trim());

    if (isNaN(height)) {
      return NextResponse.json(
        { error: 'Invalid height value' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      lon: parseFloat(lon),
      lat: parseFloat(lat),
      height,
      source: name,
    });
  } catch (error) {
    console.error('DEM height query error:', error);
    return NextResponse.json(
      { error: 'Failed to get height from DEM' },
      { status: 500 }
    );
  }
}
