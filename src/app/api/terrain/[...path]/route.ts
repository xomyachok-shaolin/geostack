import { NextRequest, NextResponse } from 'next/server';

const MAPTILER_KEY = 'MRRrl7HjI7IlJp9IxgEB';
const MAPTILER_BASE = 'https://api.maptiler.com/tiles/terrain-quantized-mesh-v2';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const pathSegments = params.path;
    const isLayerJson = pathSegments.length === 0 || 
                        (pathSegments.length === 1 && (pathSegments[0] === '' || pathSegments[0] === 'layer.json'));
    
    // Формируем URL к MapTiler
    let maptilerUrl: string;
    
    if (isLayerJson) {
      // Запрос layer.json
      maptilerUrl = `${MAPTILER_BASE}/layer.json?key=${MAPTILER_KEY}`;
    } else if (pathSegments.length === 3) {
      // Запрос тайла z/x/y.terrain
      const [z, x, yWithExt] = pathSegments;
      maptilerUrl = `${MAPTILER_BASE}/${z}/${x}/${yWithExt}?key=${MAPTILER_KEY}`;
    } else {
      // Другие запросы - просто проксируем
      const path = pathSegments.join('/');
      maptilerUrl = `${MAPTILER_BASE}/${path}?key=${MAPTILER_KEY}`;
    }

    const response = await fetch(maptilerUrl, {
      headers: {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });

    if (!response.ok) {
      console.error(`MapTiler terrain error: ${response.status} for ${maptilerUrl}`);
      return NextResponse.json(
        { error: `MapTiler returned ${response.status}` },
        { status: response.status }
      );
    }

    // Для layer.json нужно подменить URL тайлов на наш прокси
    if (isLayerJson) {
      const json = await response.json();
      
      // Используем относительный URL для тайлов - браузер сам добавит origin
      if (json.tiles && Array.isArray(json.tiles)) {
        json.tiles = ['/api/terrain/{z}/{x}/{y}.terrain'];
      }
      
      return NextResponse.json(json, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const data = await response.arrayBuffer();

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Terrain proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch terrain' },
      { status: 500 }
    );
  }
}
