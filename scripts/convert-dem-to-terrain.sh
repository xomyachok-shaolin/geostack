#!/bin/bash
# Конвертация DEM GeoTIFF в quantized-mesh тайлы для Cesium
# Использует Docker образ с cesium-terrain-builder

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data/terrain"
OUTPUT_DIR="$PROJECT_DIR/public/terrain"

echo "🏔️  Конвертация DEM в quantized-mesh тайлы"
echo "=========================================="

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Установите Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Создаем выходную директорию
mkdir -p "$OUTPUT_DIR"

# Функция для конвертации одного DEM файла
convert_dem() {
    local input_file=$1
    local output_name=$2
    
    echo ""
    echo "🔨 Обработка: $output_name"
    echo "   Входной файл: $(basename $input_file)"
    
    if [ ! -f "$input_file" ]; then
        echo "   ⚠️  Файл не найден, пропускаю"
        return
    fi
    
    # Создаем временную директорию для этого DEM
    local temp_dir="$OUTPUT_DIR/${output_name}_temp"
    mkdir -p "$temp_dir"
    
    echo "   1️⃣  Репроецирование в WGS84..."
    # Сначала репроецируем в WGS84 если нужно
    local wgs84_file="$temp_dir/dem_wgs84.tif"
    gdalwarp -t_srs EPSG:4326 -r bilinear -co COMPRESS=LZW \
        "$input_file" "$wgs84_file" 2>&1 | grep -v "^0"
    
    if [ ! -f "$wgs84_file" ]; then
        echo "   ❌ Ошибка репроецирования"
        return
    fi
    
    echo "   2️⃣  Генерация quantized-mesh тайлов (Docker)..."
    # Используем Docker образ geodata/cesium-terrain-builder
    docker run --rm \
        -v "$temp_dir:/data" \
        -v "$OUTPUT_DIR/$output_name:/output" \
        geodata/cesium-terrain-builder \
        ctb-tile -f Mesh -C -N -o /output /data/dem_wgs84.tif
    
    # Создаем layer.json
    echo "   3️⃣  Создание layer.json..."
    create_layer_json "$wgs84_file" "$OUTPUT_DIR/$output_name"
    
    # Удаляем временные файлы
    rm -rf "$temp_dir"
    
    echo "   ✅ Готово!"
}

# Функция для создания layer.json
create_layer_json() {
    local tif_file=$1
    local output_dir=$2
    
    # Получаем bounds через gdalinfo
    local bounds=$(gdalinfo "$tif_file" | grep -A 4 "Corner Coordinates" | grep -E "Upper Left|Lower Right")
    
    # Извлекаем координаты (упрощенно, для production нужен более точный парсинг)
    local west=-180
    local south=-90
    local east=180
    local north=90
    
    cat > "$output_dir/layer.json" << EOF
{
  "tilejson": "2.1.0",
  "version": "1.0.0",
  "format": "quantized-mesh-1.0",
  "tiles": ["{z}/{x}/{y}.terrain"],
  "minzoom": 0,
  "maxzoom": 14,
  "bounds": [$west, $south, $east, $north],
  "scheme": "tms",
  "attribution": "Local DEM data"
}
EOF
}

# Конвертируем оба DEM файла
convert_dem "$DATA_DIR/dem_UTM_Kanash.tif" "kanash"
convert_dem "$DATA_DIR/dem_UTM_Krasnoarmeiskoe.tif" "krasnoarmeiskoe"

echo ""
echo "✅ Конвертация завершена!"
echo "📁 Тайлы сохранены в: $OUTPUT_DIR"
echo ""
echo "Теперь можно использовать terrain в Cesium:"
echo "  - kanash: /api/terrain/kanash"
echo "  - krasnoarmeiskoe: /api/terrain/krasnoarmeiskoe"
