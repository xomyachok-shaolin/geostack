#!/usr/bin/env python3
"""
TiTiler сервер для раздачи тайлов на лету из TIFF/VRT.
Запуск: python scripts/tile-server.py
Будет доступен на http://localhost:8000
"""

import os
from pathlib import Path

# Фикс для PROJ в conda окружении
os.environ["PROJ_DATA"] = "/home/minaevas/opt/anaconda3/lib/python3.13/site-packages/rasterio/proj_data"

# Устанавливаем рабочую директорию
os.chdir(Path(__file__).parent.parent)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

app = FastAPI(
    title="GeoStack Tile Server",
    description="Динамическая раздача тайлов из TIFF файлов",
)

# CORS для доступа из браузера
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Маппинг регионов на TIFF/VRT файлы (работает напрямую без COG!)
RASTER_FILES = {
    "krasnoarmeiskoe": "data/ortho/krasnoarmeiskoe/source.tif",
    "kanash": "data/ortho/kanash/source.tif",
}

@app.get("/tiles/{region}/{z}/{x}/{y}.png")
async def get_tile(
    region: str,
    z: int,
    x: int,
    y: int,
):
    """Получение тайла из COG/TIFF с прозрачностью"""
    from rio_tiler.io import Reader
    from rio_tiler.errors import TileOutsideBounds
    from PIL import Image
    import numpy as np
    import io
    
    raster_path = RASTER_FILES.get(region)
    if not raster_path or not os.path.exists(raster_path):
        # Прозрачный PNG 1x1
        return Response(
            content=b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82',
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    
    try:
        with Reader(raster_path) as src:
            band_count = src.dataset.count
            
            if band_count >= 4:
                # Есть альфа-канал (4-й band) - читаем все 4
                img = src.tile(x, y, z, tilesize=256, indexes=(1, 2, 3, 4))
                rgba = np.transpose(img.data, (1, 2, 0))
                
                # Дополнительно: делаем прозрачными чёрные пиксели (nodata)
                black_mask = np.all(rgba[:, :, :3] == 0, axis=2)
                rgba[black_mask, 3] = 0
            else:
                # RGB без альфа-канала
                img = src.tile(x, y, z, tilesize=256)
                rgb = np.transpose(img.data, (1, 2, 0))  # (3, 256, 256) → (256, 256, 3)
                
                # Создаём альфа-канал: непрозрачный везде кроме чёрных пикселей
                alpha = np.full((256, 256), 255, dtype=np.uint8)
                
                # Делаем прозрачными чёрные пиксели (RGB=0,0,0 = nodata)
                black_mask = np.all(rgb == 0, axis=2)
                alpha[black_mask] = 0
                
                # Объединяем RGB + Alpha
                rgba = np.dstack([rgb, alpha])
            
            # Создаём PNG через PIL
            pil_img = Image.fromarray(rgba.astype(np.uint8), mode='RGBA')
            buffer = io.BytesIO()
            pil_img.save(buffer, format='PNG', optimize=True)
            content = buffer.getvalue()
            
            return Response(
                content=content,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"}
            )
    except TileOutsideBounds:
        # Тайл за пределами данных - прозрачный
        return Response(
            content=b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82',
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    except Exception as e:
        print(f"Error: {e}")
        return Response(
            content=b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82',
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"}
        )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {
        "service": "GeoStack Tile Server",
        "endpoints": {
            "tiles": "/tiles/{region}/{z}/{x}/{y}.png",
            "health": "/health",
        },
        "regions": list(RASTER_FILES.keys()),
    }


if __name__ == "__main__":
    import uvicorn
    print("Starting Tile Server on http://localhost:8000")
    print("Работает напрямую с TIFF (без COG!)")
    print("Endpoints:")
    print("  - /tiles/{region}/{z}/{x}/{y}.png")
    uvicorn.run(app, host="0.0.0.0", port=8000)
