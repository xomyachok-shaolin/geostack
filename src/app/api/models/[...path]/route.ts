import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

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
 * API Route для раздачи 3D моделей с логированием
 * Проксирует запросы к /data/models/* с логами
 * Для tileset.json автоматически кодирует URI
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  // Декодируем URL-encoded символы (например, %5B -> [, %5D -> ])
  const filePath = params.path.map(segment => decodeURIComponent(segment)).join('/');
  
  console.log(`📦 [3D-MODEL] Request: /models/${filePath}`);
  
  // Путь к файлу в data/models
  const fullPath = path.join(process.cwd(), 'data', 'models', filePath);
  
  if (!existsSync(fullPath)) {
    console.log(`❌ [3D-MODEL] Not found: ${fullPath}`);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  try {
    const fileBuffer = await readFile(fullPath);
    
    // Определяем content-type по расширению
    const ext = path.extname(filePath).toLowerCase();
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
    
    // Для tileset.json - кодируем URI чтобы избежать ошибок с URL API в браузере
    if (ext === '.json' && filePath.includes('tileset')) {
      const jsonData = JSON.parse(fileBuffer.toString('utf-8'));
      const processedData = processTilesetJson(jsonData);
      const processedJson = JSON.stringify(processedData);
      
      console.log(`✅ [3D-MODEL] Serving tileset with encoded URIs: ${filePath}`);
      
      return new NextResponse(processedJson, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    console.log(`✅ [3D-MODEL] Serving: ${filePath} (${fileBuffer.length} bytes, ${contentType})`);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error(`❌ [3D-MODEL] Error reading ${filePath}:`, error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
