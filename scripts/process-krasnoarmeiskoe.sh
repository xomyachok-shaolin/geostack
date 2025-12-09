#!/bin/bash
set -e

# Скрипт для нарезки тайлов из GeoTIFF файлов для Красноармейское
# Тайлы добавляются/заменяются в data/ortho/krasnoarmeiskoe/
# Требуется: gdal (gdalbuildvrt, gdalwarp, gdal2tiles.py)

INPUT_DIR="tmp/Красноармейское UTM38"
OUTPUT_DIR="data/ortho/krasnoarmeiskoe"
VRT_FILE="tmp/krasnoarmeiskoe.vrt"
REPROJECTED="tmp/krasnoarmeiskoe_3857.tif"

echo "==> Проверка зависимостей..."
if ! command -v gdalbuildvrt &> /dev/null; then
    echo "Ошибка: gdalbuildvrt не найден. Установите GDAL:"
    echo "  conda install gdal"
    exit 1
fi

# Удаляем старые временные файлы
rm -f "$VRT_FILE" "$REPROJECTED"

echo "==> Создание виртуального растра (VRT)..."
gdalbuildvrt "$VRT_FILE" "$INPUT_DIR"/*.tif

echo "==> Получение информации о файле..."
gdalinfo "$VRT_FILE" | grep -E "Size|Coordinate|PROJCS|EPSG|Upper Left|Lower Right" | head -15

echo "==> Конвертация в EPSG:4326 (WGS84) для TMS тайлов..."
gdalwarp -t_srs EPSG:4326 \
    -r bilinear \
    -co "COMPRESS=JPEG" \
    -co "JPEG_QUALITY=85" \
    -co "TILED=YES" \
    -dstalpha \
    "$VRT_FILE" "$REPROJECTED"

echo "==> Создание пирамид для ускорения..."
gdaladdo -r average "$REPROJECTED" 2 4 8 16

echo "==> Создание директории для тайлов..."
mkdir -p "$OUTPUT_DIR"

echo "==> Нарезка TMS тайлов (будут добавлены/заменены в $OUTPUT_DIR)..."
# --resume позволяет дополнить существующие тайлы
gdal2tiles.py \
    -z 10-21 \
    -w none \
    -r bilinear \
    --tmscompatible \
    --resume \
    --processes=4 \
    "$REPROJECTED" "$OUTPUT_DIR"

echo ""
echo "==> Готово! Тайлы сохранены в: $OUTPUT_DIR"
echo "==> Размер:"
du -sh "$OUTPUT_DIR"

echo ""
echo "==> Количество тайлов по уровням:"
for z in $(ls -d "$OUTPUT_DIR"/*/ 2>/dev/null | xargs -n1 basename | sort -n); do
    count=$(find "$OUTPUT_DIR/$z" -name "*.png" 2>/dev/null | wc -l)
    echo "  Zoom $z: $count тайлов"
done
