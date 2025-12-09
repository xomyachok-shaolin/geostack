import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// TiTiler сервер для динамической раздачи TIFF
const TITILER_URL = process.env.TITILER_URL || 'http://localhost:8000';

// Метаданные ортофотоплана для каждого района/слоя
const ORTHO_METADATA: Record<string, {
  bounds: [number, number, number, number]; // [west, south, east, north]
  minZoom: number;
  maxZoom: number;
  folder: string; // папка с тайлами
  name: string;
  priority: number; // приоритет слоя (выше = сверху)
  useTitiler?: boolean; // использовать TiTiler для раздачи
  tiffFile?: string; // имя TIFF файла для TiTiler (по умолчанию source.tif)
}> = {
  // Детальные ортофото населённых пунктов (высший приоритет) - через TiTiler
  krasnoarmeiskoe: {
    bounds: [47.1472, 55.7552, 47.1888, 55.7873],
    minZoom: 10,
    maxZoom: 21,
    folder: 'krasnoarmeiskoe',
    name: 'с. Красноармейское (детальное)',
    priority: 100,
    useTitiler: true, // Раздача из TIFF через TiTiler
    tiffFile: 'source.tif',
  },
  kanash: {
    bounds: [47.4194, 55.4662, 47.5667, 55.5482],
    minZoom: 10,
    maxZoom: 21,
    folder: 'kanash',
    name: 'г. Канаш (детальное)',
    priority: 100,
    useTitiler: true, // Раздача из TIFF через TiTiler
    tiffFile: 'source.tif',
  },
  // Тайлы районов (средний приоритет)
  'krasnoarmeiskiy-rayon': {
    bounds: [46.94577286, 55.66376807, 47.36972165, 55.86825217],
    minZoom: 10,
    maxZoom: 19,
    folder: 'krasnoarmeiskiy-rayon',
    name: 'Красноармейский район',
    priority: 50,
  },
  'kanashskiy-rayon': {
    bounds: [47.19531000, 55.34957952, 47.65664078, 55.68905500],
    minZoom: 10,
    maxZoom: 19,
    folder: 'kanashskiy-rayon',
    name: 'Канашский район',
    priority: 50,
  },
};

const VALID_REGIONS = Object.keys(ORTHO_METADATA);

/**
 * Конвертирует Y координату из XYZ (Google/OSM) в TMS
 * TMS использует перевернутую Y ось
 */
function xyzToTms(y: number, z: number): number {
  return Math.pow(2, z) - 1 - y;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  
  // Ожидаемый формат: /api/ortho/{region}/{z}/{x}/{y}.png
  // или /api/ortho/{region}/metadata.json
  if (!pathSegments || pathSegments.length < 2) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const region = pathSegments[0];
  
  // Проверяем, что регион существует
  if (!VALID_REGIONS.includes(region)) {
    return NextResponse.json({ error: 'Unknown region' }, { status: 404 });
  }

  const regionMeta = ORTHO_METADATA[region];

  // Возвращаем метаданные
  if (pathSegments[1] === 'metadata.json' || pathSegments.join('/').endsWith('metadata.json')) {
    return NextResponse.json({
      name: regionMeta.name,
      bounds: regionMeta.bounds,
      minZoom: regionMeta.minZoom,
      maxZoom: regionMeta.maxZoom,
      format: 'png',
      scheme: 'tms',
      priority: regionMeta.priority,
    });
  }

  // Список всех доступных слоёв
  if (pathSegments[0] === 'layers' || pathSegments.join('/') === 'layers.json') {
    return NextResponse.json(
      Object.entries(ORTHO_METADATA).map(([id, meta]) => ({
        id,
        ...meta,
      }))
    );
  }

  // Парсим z, x, y
  if (pathSegments.length < 4) {
    return NextResponse.json({ error: 'Invalid tile path' }, { status: 400 });
  }

  const z = parseInt(pathSegments[1], 10);
  const x = parseInt(pathSegments[2], 10);
  // Убираем .png из y
  const yStr = pathSegments[3].replace('.png', '');
  const yXyz = parseInt(yStr, 10);

  if (isNaN(z) || isNaN(x) || isNaN(yXyz)) {
    return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 });
  }

  // Конвертируем Y из XYZ в TMS
  const yTms = xyzToTms(yXyz, z);

  // Если регион использует TiTiler — проксируем запрос
  if (regionMeta.useTitiler) {
    try {
      // Формируем путь к TIFF файлу внутри контейнера TiTiler
      const tiffFile = regionMeta.tiffFile || 'source.tif';
      const tiffPath = `/data/ortho/${regionMeta.folder}/${tiffFile}`;
      
      // TiTiler COG endpoint с параметром url
      const titilerUrl = `${TITILER_URL}/cog/tiles/WebMercatorQuad/${z}/${x}/${yXyz}.png?url=${encodeURIComponent(tiffPath)}`;
      
      const response = await fetch(titilerUrl, { 
        cache: 'no-store',
        signal: AbortSignal.timeout(10000), // 10 секунд таймаут
      });
      
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=604800',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        console.warn(`TiTiler returned ${response.status} for ${region}:`, await response.text().catch(() => 'no body'));
      }
    } catch (error) {
      // TiTiler недоступен — возвращаем прозрачный тайл
      console.warn('TiTiler unavailable for', region, error instanceof Error ? error.message : '');
    }
    
    // Прозрачный PNG если TiTiler недоступен
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    return new NextResponse(transparentPng, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60', // Короткий кэш если TiTiler упал
      },
    });
  }

  // Путь к файлу тайла (для регионов с готовыми PNG)
  const tilePath = path.join(
    process.cwd(),
    'data',
    'ortho',
    regionMeta.folder,
    z.toString(),
    x.toString(),
    `${yTms}.png`
  );

  // Проверяем существование файла
  if (!existsSync(tilePath)) {
    // Возвращаем прозрачный PNG 256x256 для отсутствующих тайлов
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    return new NextResponse(transparentPng, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  try {
    const fileBuffer = await readFile(tilePath);
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800', // Кэшируем на неделю
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error reading tile:', tilePath, error);
    return NextResponse.json({ error: 'Failed to read tile' }, { status: 500 });
  }
}
