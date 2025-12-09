#!/usr/bin/env python3
"""
Генерация terrain-тайлов в формате Terrarium из локальных DEM файлов.
Terrarium формат: elevation = (R * 256 + G + B / 256) - 32768
"""

import os
import sys
import math
import numpy as np
from pathlib import Path

try:
    import rasterio
    from rasterio.warp import calculate_default_transform, reproject, Resampling
    from rasterio.crs import CRS
    from PIL import Image
except ImportError as e:
    print(f"Ошибка: {e}")
    print("Установите зависимости: pip install rasterio pillow")
    sys.exit(1)

# Конфигурация
PROJECT_DIR = Path(__file__).parent.parent
DEM_DIR = PROJECT_DIR / "data" / "terrain" / "processed"
OUTPUT_DIR = PROJECT_DIR / "public" / "terrain"

# Параметры тайлинга
TILE_SIZE = 256
MIN_ZOOM = 5
MAX_ZOOM = 15


def elevation_to_terrarium(elevation: np.ndarray) -> np.ndarray:
    """
    Конвертирует высоту в Terrarium RGB формат.
    Terrarium: elevation = (R * 256 + G + B / 256) - 32768
    """
    # Обработка NaN значений
    elevation = np.nan_to_num(elevation, nan=0.0)
    
    # Конвертация: encoded = elevation + 32768
    encoded = elevation + 32768.0
    encoded = np.clip(encoded, 0, 65535)
    
    # Разбивка на RGB каналы
    r = np.floor(encoded / 256).astype(np.uint8)
    g = np.floor(encoded % 256).astype(np.uint8)
    b = np.floor((encoded % 1) * 256).astype(np.uint8)
    
    # Создаём RGB массив
    rgb = np.stack([r, g, b], axis=-1)
    return rgb


def tile_bounds(x: int, y: int, z: int) -> tuple:
    """Возвращает границы тайла в WGS84 (west, south, east, north)"""
    n = 2 ** z
    west = x / n * 360 - 180
    east = (x + 1) / n * 360 - 180
    
    north_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    south_rad = math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n)))
    
    north = math.degrees(north_rad)
    south = math.degrees(south_rad)
    
    return (west, south, east, north)


def lat_to_tile_y(lat: float, zoom: int) -> int:
    """Конвертирует широту в Y-координату тайла"""
    lat_rad = math.radians(lat)
    n = 2 ** zoom
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    return y


def lon_to_tile_x(lon: float, zoom: int) -> int:
    """Конвертирует долготу в X-координату тайла"""
    n = 2 ** zoom
    x = int((lon + 180) / 360 * n)
    return x


def generate_tiles_for_dem(dem_path: Path, output_dir: Path):
    """Генерирует terrain-тайлы из DEM файла"""
    print(f"\n📦 Обработка: {dem_path.name}")
    
    with rasterio.open(dem_path) as src:
        # Получаем информацию о DEM
        print(f"   CRS: {src.crs}")
        print(f"   Bounds: {src.bounds}")
        print(f"   Size: {src.width}x{src.height}")
        
        # Если DEM не в WGS84, нужно репроецировать
        if src.crs != CRS.from_epsg(4326):
            print(f"   ⚠️ DEM в {src.crs}, нужна репроекция в WGS84...")
            
            # Вычисляем трансформацию для WGS84
            dst_crs = CRS.from_epsg(4326)
            transform, width, height = calculate_default_transform(
                src.crs, dst_crs, src.width, src.height, *src.bounds
            )
            
            # Репроецируем
            dem_data = np.zeros((height, width), dtype=np.float32)
            reproject(
                source=rasterio.band(src, 1),
                destination=dem_data,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=transform,
                dst_crs=dst_crs,
                resampling=Resampling.bilinear
            )
            
            # Обновляем bounds
            from rasterio.transform import array_bounds
            bounds = array_bounds(height, width, transform)
        else:
            dem_data = src.read(1)
            bounds = src.bounds
            transform = src.transform
            height, width = src.height, src.width
        
        west, south, east, north = bounds
        print(f"   WGS84 Bounds: {west:.4f}, {south:.4f}, {east:.4f}, {north:.4f}")
        
        # Генерируем тайлы для каждого уровня зума
        total_tiles = 0
        for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
            # Определяем диапазон тайлов
            x_min = lon_to_tile_x(west, zoom)
            x_max = lon_to_tile_x(east, zoom)
            y_min = lat_to_tile_y(north, zoom)  # north = меньший Y
            y_max = lat_to_tile_y(south, zoom)  # south = больший Y
            
            zoom_tiles = 0
            for x in range(x_min, x_max + 1):
                for y in range(y_min, y_max + 1):
                    # Получаем границы тайла
                    t_west, t_south, t_east, t_north = tile_bounds(x, y, zoom)
                    
                    # Проверяем пересечение с DEM
                    if t_east < west or t_west > east or t_north < south or t_south > north:
                        continue
                    
                    # Вычисляем область DEM для этого тайла
                    # Конвертируем координаты тайла в пиксели DEM
                    col_start = int((t_west - west) / (east - west) * width)
                    col_end = int((t_east - west) / (east - west) * width)
                    row_start = int((north - t_north) / (north - south) * height)
                    row_end = int((north - t_south) / (north - south) * height)
                    
                    # Границы
                    col_start = max(0, col_start)
                    col_end = min(width, col_end)
                    row_start = max(0, row_start)
                    row_end = min(height, row_end)
                    
                    if col_end <= col_start or row_end <= row_start:
                        continue
                    
                    # Извлекаем данные
                    tile_dem = dem_data[row_start:row_end, col_start:col_end]
                    
                    # Ресайзим до TILE_SIZE x TILE_SIZE
                    if tile_dem.size == 0:
                        continue
                    
                    # Используем PIL для ресайза
                    dem_img = Image.fromarray(tile_dem, mode='F')
                    dem_img = dem_img.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.BILINEAR)
                    tile_dem_resized = np.array(dem_img)
                    
                    # Конвертируем в Terrarium
                    rgb = elevation_to_terrarium(tile_dem_resized)
                    
                    # Сохраняем тайл
                    tile_dir = output_dir / str(zoom) / str(x)
                    tile_dir.mkdir(parents=True, exist_ok=True)
                    tile_path = tile_dir / f"{y}.png"
                    
                    img = Image.fromarray(rgb, mode='RGB')
                    img.save(tile_path, 'PNG')
                    zoom_tiles += 1
            
            if zoom_tiles > 0:
                print(f"   Zoom {zoom}: {zoom_tiles} тайлов")
                total_tiles += zoom_tiles
        
        print(f"   ✅ Всего: {total_tiles} тайлов")
        return total_tiles


def main():
    print("🏔️  Генератор Terrain-тайлов (Terrarium формат)")
    print("=" * 50)
    
    # Создаём выходную директорию
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"📁 Выходная директория: {OUTPUT_DIR}")
    
    # Находим DEM файлы
    dem_files = list(DEM_DIR.glob("*.tif"))
    if not dem_files:
        # Проверяем родительскую директорию
        dem_files = list((PROJECT_DIR / "data" / "terrain").glob("*.tif"))
    
    if not dem_files:
        print("❌ DEM файлы не найдены!")
        sys.exit(1)
    
    print(f"📂 Найдено DEM файлов: {len(dem_files)}")
    
    total = 0
    for dem_file in dem_files:
        try:
            total += generate_tiles_for_dem(dem_file, OUTPUT_DIR)
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\n✅ Готово! Всего сгенерировано {total} тайлов")
    print(f"📍 Тайлы доступны в: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
