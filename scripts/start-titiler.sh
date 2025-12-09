#!/bin/bash
# Скрипт для запуска TiTiler локально для разработки

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data/ortho"

echo "🚀 Запуск TiTiler для разработки..."
echo "   Папка данных: $DATA_DIR"

# Проверяем есть ли Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не найден. Установите Docker для запуска TiTiler."
    exit 1
fi

# Останавливаем старый контейнер если есть
docker stop titiler-dev 2>/dev/null || true
docker rm titiler-dev 2>/dev/null || true

# Запускаем TiTiler
docker run -d \
    --name titiler-dev \
    -p 8000:8000 \
    -v "$DATA_DIR:/data/ortho:ro" \
    -e TITILER_API_DISABLE_COG_LANDING=true \
    -e CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF,.tiff,.TIFF" \
    -e GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
    -e GDAL_HTTP_MERGE_CONSECUTIVE_RANGES=YES \
    -e VSI_CACHE=TRUE \
    -e VSI_CACHE_SIZE=536870912 \
    ghcr.io/developmentseed/titiler:latest

echo "✅ TiTiler запущен на http://localhost:8000"
echo ""
echo "📋 Доступные endpoints:"
echo "   - Health: http://localhost:8000/health"
echo "   - Docs: http://localhost:8000/docs"
echo ""
echo "🗺️  Пример запроса тайлов:"
echo "   http://localhost:8000/cog/tiles/14/9500/5500.png?url=/data/ortho/krasnoarmeiskoe.tif"
echo ""
echo "📊 Логи: docker logs -f titiler-dev"
echo "🛑 Остановка: docker stop titiler-dev"
