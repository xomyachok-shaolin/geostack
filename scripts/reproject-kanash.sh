#!/bin/bash
# Репроекция файлов Канаш из UTM38 в WGS84 с прогрессом
set -e

export PROJ_DATA="/home/minaevas/opt/anaconda3/lib/python3.13/site-packages/rasterio/proj_data"
SRC_DIR="/tmp/kanash_utm38/Канаш UTM38"
OUT_DIR="/tmp/kanash_wgs84"
PARALLEL_JOBS=4

mkdir -p "$OUT_DIR"

# Считаем файлы
mapfile -t files < <(find "$SRC_DIR" -name "*.tif")
total=${#files[@]}
echo "Найдено файлов: $total"
echo "Параллельных процессов: $PARALLEL_JOBS"
echo ""

# Счётчик
count=0

# Функция обработки одного файла
process_file() {
    local src="$1"
    local basename=$(basename "$src")
    local dst="$OUT_DIR/$basename"
    
    if [[ -f "$dst" ]]; then
        return 0
    fi
    
    gdalwarp -t_srs EPSG:4326 -r bilinear -dstalpha -co COMPRESS=LZW -co BIGTIFF=YES -q "$src" "$dst"
}

export -f process_file
export OUT_DIR PROJ_DATA

# Запускаем через xargs с правильным экранированием
printf '%s\0' "${files[@]}" | xargs -0 -P $PARALLEL_JOBS -I {} bash -c 'process_file "$@"' _ {}

echo ""
echo "Готово! Обработано файлов: $(find "$OUT_DIR" -name "*.tif" | wc -l)"
