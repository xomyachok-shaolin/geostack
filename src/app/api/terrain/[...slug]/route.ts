import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * API endpoint для раздачи quantized-mesh terrain тайлов
 * GET /api/terrain/:name/:z/:x/:y.terrain
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  try {
    const [name, z, x, yTerrain] = params.slug;
    const y = yTerrain.replace('.terrain', '');

    // Путь к тайлу
    const terrainPath = path.join(
      process.cwd(),
      'public',
      'terrain',
      name,
      z,
      x,
      `${y}.terrain`
    );

    // Читаем тайл
    const terrain = await fs.readFile(terrainPath);

    // Возвращаем с правильными заголовками
    return new NextResponse(terrain, {
      headers: {
        'Content-Type': 'application/vnd.quantized-mesh',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    // Тайл не найден - возвращаем 404
    return new NextResponse(null, { status: 404 });
  }
}
