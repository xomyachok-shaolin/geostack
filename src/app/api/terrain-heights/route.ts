import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * API для получения высот из локальных DEM файлов
 * Использует gdallocationinfo для извлечения высот
 * GET /api/terrain-heights?name=kanash&points=[[lon,lat],...]
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name');
    const pointsStr = searchParams.get('points');

    if (!name || !pointsStr) {
      return NextResponse.json(
        { error: 'Missing parameters' },
        { status: 400 }
      );
    }

    // Парсим координаты
    const points = JSON.parse(pointsStr);

    // Путь к DEM файлу
    const demFile = path.join(
      process.cwd(),
      'data',
      'terrain',
      `dem_UTM_${name.charAt(0).toUpperCase() + name.slice(1)}.tif`
    );

    // Получаем высоты для всех точек
    const heights = await Promise.all(
      points.map(async ([lon, lat]: [number, number]) => {
        try {
          const { stdout } = await execAsync(
            `gdallocationinfo -wgs84 -valonly "${demFile}" ${lon} ${lat}`
          );
          const height = parseFloat(stdout.trim());
          return isNaN(height) ? 0 : height;
        } catch {
          return 0;
        }
      })
    );

    return NextResponse.json({ heights });
  } catch (error) {
    console.error('Terrain heights error:', error);
    return NextResponse.json(
      { error: 'Failed to get heights' },
      { status: 500 }
    );
  }
}
