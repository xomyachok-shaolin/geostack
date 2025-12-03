#!/bin/bash
# Скрипт деплоя GeoStack на сервер geokiosk@192.168.70.220
# Сборка образа локально, затем перенос на сервер
# Использование: cd docker && ./deploy.sh

set -e

# Переходим в корень проекта
cd "$(dirname "$0")/.."

# Конфигурация
SERVER="geokiosk@192.168.70.220"
REMOTE_DIR="/home/geokiosk/geostack"
IMAGE_NAME="geostack"
IMAGE_TAG="latest"
IMAGE_FILE="geostack-image.tar"

echo "🔨 Сборка Docker образа..."
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo "💾 Сохранение образа в файл..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} -o ${IMAGE_FILE}

echo "📦 Размер образа: $(du -h ${IMAGE_FILE} | cut -f1)"

echo "📤 Создание директории и копирование на сервер..."
ssh ${SERVER} "mkdir -p ${REMOTE_DIR}/data/models"
scp ${IMAGE_FILE} ${SERVER}:${REMOTE_DIR}/
scp docker/docker-compose.prod.yml ${SERVER}:${REMOTE_DIR}/docker-compose.yml

echo "📤 Копирование 3D моделей (может занять время)..."
scp -r data/models/* ${SERVER}:${REMOTE_DIR}/data/models/

echo "🚀 Разворачивание на сервере..."
ssh ${SERVER} << 'ENDSSH'
cd ~/geostack

echo "📥 Загрузка Docker образа..."
docker load -i geostack-image.tar

echo "🔄 Перезапуск контейнера..."
docker compose down 2>/dev/null || true
docker compose up -d

echo "🧹 Очистка..."
rm -f geostack-image.tar
docker image prune -f

echo ""
echo "✅ Статус контейнера:"
docker ps | grep geostack || echo "Контейнер не запущен!"

echo ""
echo "📋 Логи (последние 20 строк):"
sleep 3
docker logs --tail 20 geostack 2>&1 || true
ENDSSH

echo "🧹 Локальная очистка..."
rm -f ${IMAGE_FILE}

echo ""
echo "✅ Деплой завершён!"
echo "🌐 Приложение доступно на http://geokiosk.ru/"
echo "📡 Контейнер слушает на порту 5000"
