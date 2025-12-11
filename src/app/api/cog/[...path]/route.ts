import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Конфигурация COG файлов
const COG_FILES: Record<string, {
  path: string;
  bounds: [number, number, number, number]; // [west, south, east, north] в EPSG:4326
}> = {
  krasnoarmeiskoe: {
    path: 'data/ortho/krasnoarmeiskoe.cog.tif',
    bounds: [47.14895, 55.75524, 47.18704, 55.78732], // Примерные границы из gdalinfo
  },
};

// Размер тайла
const TILE_SIZE = 256;

/**
 * Конвертирует тайловые координаты в географические (EPSG:4326)
 */
function tileToLatLon(x: number, y: number, z: number): { lat: number; lon: number } {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return {
    lon: (x / Math.pow(2, z)) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  };
}

/**
 * Получает bounding box тайла в градусах
 */
function tileBounds(x: number, y: number, z: number): [number, number, number, number] {
  const nw = tileToLatLon(x, y, z);
  const se = tileToLatLon(x + 1, y + 1, z);
  return [nw.lon, se.lat, se.lon, nw.lat]; // [west, south, east, north]
}

/**
 * Проверяет пересечение двух bounding box
 */
function bboxIntersects(
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number]
): boolean {
  return !(
    bbox1[2] < bbox2[0] || // bbox1 слева от bbox2
    bbox1[0] > bbox2[2] || // bbox1 справа от bbox2
    bbox1[3] < bbox2[1] || // bbox1 ниже bbox2
    bbox1[1] > bbox2[3]    // bbox1 выше bbox2
  );
}

// Прозрачный PNG 1x1 (base64)
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==',
  'base64'
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  // Формат: /api/cog/{region}/{z}/{x}/{y}.png
  if (!pathSegments || pathSegments.length < 4) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const region = pathSegments[0];
  const z = parseInt(pathSegments[1], 10);
  const x = parseInt(pathSegments[2], 10);
  const yStr = pathSegments[3].replace('.png', '').replace('.jpg', '');
  const y = parseInt(yStr, 10);

  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 });
  }

  const cogConfig = COG_FILES[region];
  if (!cogConfig) {
    return NextResponse.json({ error: 'Unknown region' }, { status: 404 });
  }

  const cogPath = path.join(process.cwd(), cogConfig.path);
  if (!existsSync(cogPath)) {
    return NextResponse.json({ error: 'COG file not found' }, { status: 404 });
  }

  // Получаем bbox тайла
  const tileBbox = tileBounds(x, y, z);

  // Проверяем пересечение с данными
  if (!bboxIntersects(tileBbox, cogConfig.bounds)) {
    return new NextResponse(TRANSPARENT_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  try {
    // Используем gdal_translate для извлечения тайла
    // -projwin: указываем bbox в координатах исходного файла
    const [west, south, east, north] = tileBbox;
    
    const cmd = `gdal_translate -q -of PNG -outsize ${TILE_SIZE} ${TILE_SIZE} -projwin ${west} ${north} ${east} ${south} -r bilinear "${cogPath}" /vsistdout/ 2>/dev/null`;
    
    const { stdout } = await execAsync(cmd, {
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (!stdout || stdout.length === 0) {
      return new NextResponse(TRANSPARENT_PNG, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    return new NextResponse(stdout, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800', // Кэш на неделю
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error generating tile:', error);
    // Возвращаем прозрачный тайл при ошибке
    return new NextResponse(TRANSPARENT_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}
