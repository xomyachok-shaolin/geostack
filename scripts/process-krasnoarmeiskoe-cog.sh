#!/bin/bash
# Конвертация Красноармейское source.tif в COG с правильной альфой
# Использование: ./scripts/process-krasnoarmeiskoe-cog.sh

set -e

export PROJ_DATA="/home/minaevas/opt/anaconda3/lib/python3.13/site-packages/rasterio/proj_data"
SRC="/home/minaevas/projects/geostack/data/ortho/krasnoarmeiskoe/source.tif"
OUT="/home/minaevas/projects/geostack/data/ortho/krasnoarmeiskoe/source_cog.tif"
THREADS=$(nproc)

echo "=== Конвертация Красноармейское в COG ==="
echo "Исходник: $(ls -lh "$SRC" | awk '{print $5}')"

# Конвертируем в COG с сохранением альфа-канала
gdal_translate \
    -of COG \
    -co COMPRESS=JPEG \
    -co QUALITY=85 \
    -co OVERVIEWS=IGNORE_EXISTING \
    -co BIGTIFF=YES \
    -co NUM_THREADS=$THREADS \
    -b 1 -b 2 -b 3 -mask 4 \
    "$SRC" \
    "$OUT"

echo ""
echo "=== Результат ==="
ls -lh "$OUT"

# Проверяем структуру
gdalinfo "$OUT" | grep -E "Band|Mask|ColorInterp"

echo ""
echo "=== Готово! ==="
echo "Можно удалить старый source.tif и переименовать:"
echo "  mv $OUT ${SRC}"
