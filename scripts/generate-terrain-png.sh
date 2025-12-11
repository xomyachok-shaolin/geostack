#!/bin/bash
# Простая конвертация DEM в PNG heightmap тайлы (terrarium формат)
# Можно читать напрямую в Cesium с кастомным провайдером

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data/terrain"
OUTPUT_DIR="$PROJECT_DIR/public/terrain"

echo "🏔️  Генерация PNG heightmap тайлов"
echo "===================================="

# Функция для конвертации одного DEM
convert_dem_to_png() {
    local input_file=$1
    local output_name=$2
    
    echo ""
    echo "🔨 Обработка: $output_name"
    
    if [ ! -f "$input_file" ]; then
        echo "   ⚠️  Файл не найден"
        return
    fi
    
    local temp_wgs84="$OUTPUT_DIR/${output_name}_wgs84.tif"
    local output_tiles="$OUTPUT_DIR/$output_name"
    
    # 1. Репроецируем в WGS84
    echo "   1️⃣  Репроецирование в WGS84..."
    gdalwarp -t_srs EPSG:4326 -r bilinear \
        -co COMPRESS=LZW -co TILED=YES \
        "$input_file" "$temp_wgs84" 2>&1 | grep -v "^0"
    
    # 2. Генерируем PNG тайлы в формате -32768 до 32768
    echo "   2️⃣  Генерация PNG тайлов (zoom 8-15)..."
    gdal2tiles.py -z 8-15 -r near -a 0 \
        --processes=4 \
        "$temp_wgs84" "$output_tiles" 2>&1 | tail -5
    
    # 3. Создаем layer.json
    echo "   3️⃣  Создание метаданных..."
    create_metadata "$temp_wgs84" "$output_tiles"
    
    # Удаляем временный файл
    rm -f "$temp_wgs84"
    
    echo "   ✅ Готово! Тайлы в $output_tiles"
}

create_metadata() {
    local tif_file=$1
    local output_dir=$2
    
    # Получаем bounds
    local info=$(gdalinfo "$tif_file")
    local ul=$(echo "$info" | grep "Upper Left" | sed -n 's/.*(\s*\([^,]*\),\s*\([^)]*\)).*/\1 \2/p')
    local lr=$(echo "$info" | grep "Lower Right" | sed -n 's/.*(\s*\([^,]*\),\s*\([^)]*\)).*/\1 \2/p')
    
    local west=$(echo $ul | awk '{print $1}')
    local north=$(echo $ul | awk '{print $2}')
    local east=$(echo $lr | awk '{print $1}')
    local south=$(echo $lr | awk '{print $2}')
    
    cat > "$output_dir/metadata.json" << EOF
{
  "name": "$(basename $output_dir)",
  "format": "png-heightmap",
  "minzoom": 8,
  "maxzoom": 15,
  "bounds": {
    "west": $west,
    "south": $south,
    "east": $east,
    "north": $north
  },
  "projection": "EPSG:4326",
  "tileSize": 256
}
EOF
}

# Конвертируем оба файла
convert_dem_to_png "$DATA_DIR/dem_UTM_Kanash.tif" "kanash"
convert_dem_to_png "$DATA_DIR/dem_UTM_Krasnoarmeiskoe.tif" "krasnoarmeiskoe"

echo ""
echo "✅ Генерация завершена!"
echo "📁 Тайлы в: $OUTPUT_DIR"
echo ""
echo "⚠️  Примечание: PNG heightmap тайлы требуют кастомного провайдера в Cesium"
echo "   Для production рекомендуется использовать MapTiler или quantized-mesh формат"
