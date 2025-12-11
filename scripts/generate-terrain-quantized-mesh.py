#!/usr/bin/env python3
"""
Генерация quantized-mesh terrain тайлов из GeoTIFF для Cesium
Использует библиотеку quantized-mesh-encoder
"""

import os
import sys
import json
import numpy as np
from osgeo import gdal, osr
from pathlib import Path
import math
from typing import Tuple, Optional
import struct

# Установить: pip install GDAL numpy quantized-mesh-encoder
try:
    from quantized_mesh_encoder import encode
except ImportError:
    print("ERROR: Требуется установка quantized-mesh-encoder")
    print("pip install quantized-mesh-encoder")
    sys.exit(1)


class TerrainTileGenerator:
    """Генератор terrain тайлов в формате quantized-mesh"""
    
    def __init__(self, input_tif: str, output_dir: str, name: str):
        self.input_tif = input_tif
        self.output_dir = output_dir
        self.name = name
        self.dataset = None
        
    def generate(self, max_zoom: int = 14):
        """Генерирует тайлы от zoom 0 до max_zoom"""
        
        print(f"📊 Открываю DEM: {self.input_tif}")
        self.dataset = gdal.Open(self.input_tif)
        if not self.dataset:
            print(f"ERROR: Не удалось открыть {self.input_tif}")
            return False
            
        # Получаем bounds в WGS84
        bounds = self._get_bounds_wgs84()
        if not bounds:
            print("ERROR: Не удалось получить bounds")
            return False
            
        west, south, east, north = bounds
        print(f"📍 Bounds: W={west:.6f}, S={south:.6f}, E={east:.6f}, N={north:.6f}")
        
        # Создаем структуру директорий и layer.json
        output_path = Path(self.output_dir) / self.name
        output_path.mkdir(parents=True, exist_ok=True)
        
        self._create_layer_json(output_path, bounds)
        
        # Генерируем тайлы для каждого zoom уровня
        total_tiles = 0
        for zoom in range(0, max_zoom + 1):
            tiles = self._generate_zoom_level(zoom, bounds)
            total_tiles += tiles
            print(f"  Zoom {zoom}: {tiles} тайлов")
            
        print(f"\n✅ Сгенерировано {total_tiles} тайлов в {output_path}")
        return True
        
    def _get_bounds_wgs84(self) -> Optional[Tuple[float, float, float, float]]:
        """Получает bounds в WGS84 (EPSG:4326)"""
        try:
            # Получаем геотрансформ и проекцию
            gt = self.dataset.GetGeoTransform()
            proj = self.dataset.GetProjection()
            
            # Размеры растра
            width = self.dataset.RasterXSize
            height = self.dataset.RasterYSize
            
            # Углы в исходной проекции
            corners = [
                (gt[0], gt[3]),                           # top-left
                (gt[0] + width * gt[1], gt[3]),           # top-right
                (gt[0], gt[3] + height * gt[5]),          # bottom-left
                (gt[0] + width * gt[1], gt[3] + height * gt[5])  # bottom-right
            ]
            
            # Трансформация в WGS84
            src_srs = osr.SpatialReference()
            src_srs.ImportFromWkt(proj)
            
            dst_srs = osr.SpatialReference()
            dst_srs.ImportFromEPSG(4326)
            
            transform = osr.CoordinateTransformation(src_srs, dst_srs)
            
            lons, lats = [], []
            for x, y in corners:
                lon, lat, _ = transform.TransformPoint(x, y)
                lons.append(lon)
                lats.append(lat)
            
            # Возвращаем (west, south, east, north) в правильном порядке
            return (min(lons), min(lats), max(lons), max(lats))
            
        except Exception as e:
            print(f"ERROR: {e}")
            return None
            
    def _create_layer_json(self, output_path: Path, bounds: Tuple[float, float, float, float]):
        """Создает layer.json с метаданными тайлсета"""
        west, south, east, north = bounds
        
        layer_json = {
            "tilejson": "2.1.0",
            "version": "1.0.0",
            "format": "quantized-mesh-1.0",
            "name": self.name,
            "description": f"Terrain tiles for {self.name}",
            "bounds": [west, south, east, north],
            "minzoom": 0,
            "maxzoom": 14,
            "scheme": "tms",
            "tiles": ["{z}/{x}/{y}.terrain"],
            "projection": "EPSG:4326",
            "available": [
                [{"startX": 0, "startY": 0, "endX": 0, "endY": 0}]
            ]
        }
        
        with open(output_path / "layer.json", 'w') as f:
            json.dump(layer_json, f, indent=2)
            
    def _generate_zoom_level(self, zoom: int, bounds: Tuple[float, float, float, float]) -> int:
        """Генерирует тайлы для конкретного zoom уровня"""
        west, south, east, north = bounds
        
        # Определяем диапазон тайлов для данного zoom
        x_min, y_min = self._deg_to_tile(west, south, zoom)
        x_max, y_max = self._deg_to_tile(east, north, zoom)
        
        # TMS координаты (Y инвертирован)
        num_tiles = 2 ** zoom
        y_min_tms = num_tiles - 1 - y_max
        y_max_tms = num_tiles - 1 - y_min
        
        tile_count = 0
        for x in range(x_min, x_max + 1):
            for y_tms in range(y_min_tms, y_max_tms + 1):
                if self._generate_tile(zoom, x, y_tms):
                    tile_count += 1
                    
        return tile_count
        
    def _deg_to_tile(self, lon: float, lat: float, zoom: int) -> Tuple[int, int]:
        """Конвертирует градусы в тайловые координаты"""
        n = 2 ** zoom
        x = int((lon + 180) / 360 * n)
        y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
        return (x, y)
        
    def _tile_to_deg(self, x: int, y: int, zoom: int) -> Tuple[float, float, float, float]:
        """Конвертирует тайловые координаты в градусы (bounds)"""
        n = 2 ** zoom
        west = x / n * 360 - 180
        east = (x + 1) / n * 360 - 180
        north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
        south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
        return (west, south, east, north)
        
    def _generate_tile(self, zoom: int, x: int, y_tms: int) -> bool:
        """Генерирует один terrain тайл"""
        try:
            # Получаем bounds тайла
            west, south, east, north = self._tile_to_deg(x, y_tms, zoom)
            
            # Читаем высоты из DEM для этого bounds
            heights = self._read_heights(west, south, east, north)
            if heights is None or heights.size == 0:
                return False
                
            # Кодируем в quantized-mesh
            terrain_data = encode(heights.tolist())
            
            # Сохраняем тайл
            output_path = Path(self.output_dir) / self.name / str(zoom) / str(x)
            output_path.mkdir(parents=True, exist_ok=True)
            
            tile_file = output_path / f"{y_tms}.terrain"
            with open(tile_file, 'wb') as f:
                f.write(terrain_data)
                
            return True
            
        except Exception as e:
            # Тихо пропускаем тайлы вне DEM
            return False
            
    def _read_heights(self, west: float, south: float, east: float, north: float, 
                      size: int = 65) -> Optional[np.ndarray]:
        """Читает высоты из DEM для заданного bounds"""
        try:
            # Трансформируем bounds в координаты растра
            gt = self.dataset.GetGeoTransform()
            proj = self.dataset.GetProjection()
            
            # Создаем трансформацию WGS84 -> исходная проекция
            src_srs = osr.SpatialReference()
            src_srs.ImportFromEPSG(4326)
            
            dst_srs = osr.SpatialReference()
            dst_srs.ImportFromWkt(proj)
            
            transform = osr.CoordinateTransformation(src_srs, dst_srs)
            
            # Трансформируем углы
            x_min, y_max, _ = transform.TransformPoint(west, north)
            x_max, y_min, _ = transform.TransformPoint(east, south)
            
            # Конвертируем в пиксельные координаты
            inv_gt = gdal.InvGeoTransform(gt)
            px_min, py_max = gdal.ApplyGeoTransform(inv_gt, x_min, y_max)
            px_max, py_min = gdal.ApplyGeoTransform(inv_gt, x_max, y_min)
            
            px_min, px_max = int(px_min), int(px_max)
            py_min, py_max = int(py_min), int(py_max)
            
            # Проверяем что область внутри растра
            if (px_min < 0 or px_max > self.dataset.RasterXSize or
                py_min < 0 or py_max > self.dataset.RasterYSize):
                return None
                
            # Читаем данные
            band = self.dataset.GetRasterBand(1)
            data = band.ReadAsArray(px_min, py_min, px_max - px_min, py_max - py_min)
            
            if data is None:
                return None
                
            # Ресемплируем до size x size
            from scipy.ndimage import zoom
            zoom_y = size / data.shape[0]
            zoom_x = size / data.shape[1]
            resampled = zoom(data, (zoom_y, zoom_x), order=1)
            
            return resampled.astype(np.float32)
            
        except Exception as e:
            return None


def main():
    """Основная функция"""
    
    # Пути к файлам
    base_dir = Path(__file__).parent.parent
    terrain_dir = base_dir / "data" / "terrain"
    output_dir = base_dir / "public" / "terrain"
    
    # DEM файлы
    dems = [
        (terrain_dir / "dem_UTM_Kanash.tif", "kanash"),
        (terrain_dir / "dem_UTM_Krasnoarmeiskoe.tif", "krasnoarmeiskoe"),
    ]
    
    print("🏔️  Генерация quantized-mesh terrain тайлов")
    print("=" * 60)
    
    for dem_file, name in dems:
        if not dem_file.exists():
            print(f"⚠️  Пропускаю {name}: файл не найден")
            continue
            
        print(f"\n🔨 Обработка: {name}")
        generator = TerrainTileGenerator(str(dem_file), str(output_dir), name)
        generator.generate(max_zoom=14)
        
    print("\n✅ Генерация завершена!")
    print(f"📁 Тайлы сохранены в: {output_dir}")


if __name__ == "__main__":
    main()
