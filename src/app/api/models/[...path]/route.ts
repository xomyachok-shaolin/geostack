import { existsSync, createReadStream, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// In-memory кэш для tileset.json (они маленькие и часто запрашиваются)
const tilesetCache = new Map<string, { data: string; mtime: number }>();

/**
 * Кодирует специальные символы в URI ([ ] и пробелы) для корректной работы с URL API
 */
function encodeUri(uri: string): string {
  if (!uri) return uri;
  return uri.split('/').map(part => {
    if (part === '.' || part === '..') return part;
    return encodeURIComponent(part);
  }).join('/');
}

/**
 * Рекурсивно обрабатывает tileset.json, кодируя URI в content
 */
function processTilesetJson(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const record = obj as Record<string, unknown>;
  
  // Кодируем URI в content
  if (record.content && typeof record.content === 'object') {
    const content = record.content as Record<string, unknown>;
    if (typeof content.uri === 'string') {
      content.uri = encodeUri(content.uri);
    }
  }
  
  // Рекурсивно обрабатываем children
  if (Array.isArray(record.children)) {
    record.children = record.children.map(child => processTilesetJson(child));
  }
  
  // Рекурсивно обрабатываем root
  if (record.root) {
    record.root = processTilesetJson(record.root);
  }
  
  return record;
}

/**
 * Создает ReadableStream из файла для стриминга больших файлов
 */
function createFileStream(filePath: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath);
  
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        controller.enqueue(new Uint8Array(Buffer.from(chunk)));
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    }
  });
}

/**
 * API Route для раздачи 3D моделей с оптимизированным стримингом
 * - Стриминг больших b3dm файлов вместо буферизации
 * - In-memory кэш для tileset.json
 * - Оптимизированные заголовки кэширования
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  // Декодируем URL-encoded символы (например, %5B -> [, %5D -> ])
  const filePath = params.path.map(segment => decodeURIComponent(segment)).join('/');
  
  // Путь к файлу в data/models
  const fullPath = path.join(process.cwd(), 'data', 'models', filePath);
  
  if (!existsSync(fullPath)) {
    console.log(`❌ [3D-MODEL] Not found: ${filePath}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  try {
    const stats = statSync(fullPath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Content-type по расширению
    const contentTypes: Record<string, string> = {
      '.json': 'application/json',
      '.b3dm': 'application/octet-stream',
      '.glb': 'model/gltf-binary',
      '.gltf': 'model/gltf+json',
      '.bin': 'application/octet-stream',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // Для tileset.json - используем кэш и кодируем URI
    if (ext === '.json' && filePath.includes('tileset')) {
      const cached = tilesetCache.get(fullPath);
      const mtime = stats.mtimeMs;
      
      // Проверяем кэш
      if (cached && cached.mtime === mtime) {
        return new NextResponse(cached.data, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            'Access-Control-Allow-Origin': '*',
            'X-Cache': 'HIT',
          },
        });
      }
      
      // Читаем и обрабатываем tileset
      const fileBuffer = await readFile(fullPath);
      const jsonData = JSON.parse(fileBuffer.toString('utf-8'));
      const processedData = processTilesetJson(jsonData);
      const processedJson = JSON.stringify(processedData);
      
      // Сохраняем в кэш
      tilesetCache.set(fullPath, { data: processedJson, mtime });
      
      console.log(`✅ [3D-MODEL] Serving tileset: ${filePath}`);
      
      return new NextResponse(processedJson, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'MISS',
        },
      });
    }
    
    // Для b3dm и других бинарных файлов - стриминг
    if (ext === '.b3dm' || ext === '.glb' || ext === '.bin') {
      const stream = createFileStream(fullPath);
      
      return new NextResponse(stream, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=604800, immutable', // 7 дней, immutable для b3dm
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
        },
      });
    }
    
    // Для остальных файлов (изображения и т.д.)
    const fileBuffer = await readFile(fullPath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error(`❌ [3D-MODEL] Error reading ${filePath}:`, error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
