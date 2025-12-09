import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

/**
 * API Route для раздачи 3D моделей с логированием
 * Проксирует запросы к /public/models/* с логами
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const filePath = params.path.join('/');
  
  console.log(`📦 [3D-MODEL] Request: /models/${filePath}`);
  
  // Путь к файлу в public/models
  const fullPath = path.join(process.cwd(), 'public', 'models', filePath);
  
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
