#!/bin/bash
# Обработка ортофото Канаш: UTM38 → EPSG:4326 → VRT → COG
# Использование: ./scripts/process-kanash.sh

set -e

# Настройки
export PROJ_DATA="/home/minaevas/opt/anaconda3/lib/python3.13/site-packages/rasterio/proj_data"
SRC_DIR="/tmp/kanash_utm38/Канаш UTM38"
OUT_DIR="/home/minaevas/projects/geostack/data/ortho/kanash"
TMP_DIR="/tmp/kanash_wgs84"
THREADS=$(nproc)

echo "=== Обработка Канаш ==="
echo "Исходник: $SRC_DIR"
echo "Выход: $OUT_DIR"
echo "Потоков: $THREADS"

# 1. Создаём директории
mkdir -p "$OUT_DIR" "$TMP_DIR"

# 2. Считаем файлы
TOTAL=$(find "$SRC_DIR" -name "*.tif" | wc -l)
echo "Найдено TIF файлов: $TOTAL"

# 3. Репроецируем параллельно (UTM38N → WGS84)
echo ""
echo "=== Репроекция в EPSG:4326 ==="
find "$SRC_DIR" -name "*.tif" | parallel -j $THREADS --bar \
    'gdalwarp -t_srs EPSG:4326 -r bilinear -dstalpha -co COMPRESS=LZW -co BIGTIFF=YES {} '"$TMP_DIR"'/{/}'

# 4. Создаём VRT (виртуальный файл)
echo ""
echo "=== Создание VRT ==="
gdalbuildvrt -srcnodata "0 0 0" -vrtnodata "0 0 0" "$TMP_DIR/kanash.vrt" "$TMP_DIR"/*.tif
echo "VRT создан: $(ls -lh "$TMP_DIR/kanash.vrt")"

# 5. Конвертируем в COG с JPEG сжатием
echo ""
echo "=== Конвертация в COG ==="
gdal_translate \
    -of COG \
    -co COMPRESS=JPEG \
    -co QUALITY=85 \
    -co OVERVIEWS=AUTO \
    -co BIGTIFF=YES \
    -co NUM_THREADS=$THREADS \
    "$TMP_DIR/kanash.vrt" \
    "$OUT_DIR/source.tif"

echo ""
echo "=== Результат ==="
ls -lh "$OUT_DIR/source.tif"
gdalinfo "$OUT_DIR/source.tif" | head -20

# 6. Очистка временных файлов
echo ""
read -p "Удалить временные файлы в $TMP_DIR? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$TMP_DIR"
    echo "Временные файлы удалены"
fi

echo ""
echo "=== Готово! ==="
