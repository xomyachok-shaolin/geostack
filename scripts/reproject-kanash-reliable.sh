#!/bin/bash
# Надёжная репроекция Канаш UTM38 → WGS84
# Использование: ./scripts/reproject-kanash-reliable.sh

set -e

export PROJ_DATA="/home/minaevas/opt/anaconda3/lib/python3.13/site-packages/rasterio/proj_data"
SRC_DIR="/tmp/kanash_utm38/Канаш UTM38"
OUT_DIR="/tmp/kanash_wgs84"
PARALLEL_JOBS=8

mkdir -p "$OUT_DIR"

# Получаем список файлов
files=("$SRC_DIR"/*.tif)
total=${#files[@]}
count=0

echo "=== Репроекция Канаш UTM38 → WGS84 ==="
echo "Файлов: $total"
echo "Параллельных процессов: $PARALLEL_JOBS"
echo ""

# Обрабатываем пакетами
for ((i=0; i<total; i+=PARALLEL_JOBS)); do
    # Запускаем batch
    for ((j=i; j<i+PARALLEL_JOBS && j<total; j++)); do
        f="${files[j]}"
        basename=$(basename "$f")
        dst="$OUT_DIR/$basename"
        
        if [[ ! -f "$dst" ]]; then
            gdalwarp -t_srs EPSG:4326 -r bilinear -dstalpha -co COMPRESS=LZW -co BIGTIFF=YES -q "$f" "$dst" &
        fi
    done
    
    # Ждём завершения batch
    wait
    
    # Прогресс
    done_count=$(find "$OUT_DIR" -name "*.tif" | wc -l)
    pct=$((done_count * 100 / total))
    echo -ne "\rОбработано: $done_count / $total ($pct%)    "
done

echo ""
echo ""
echo "=== Готово! ==="
echo "Файлов: $(find "$OUT_DIR" -name "*.tif" | wc -l)"
du -sh "$OUT_DIR"
