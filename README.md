# 🌍 GeoStack

Интерактивный 3D веб-просмотрщик геопространственных данных на базе CesiumJS и Next.js.

![GeoStack](https://img.shields.io/badge/Next.js-14-black) ![CesiumJS](https://img.shields.io/badge/CesiumJS-1.115-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## ✨ Возможности

- **3D Тайлы** — просмотр 3D моделей зданий в формате 3D Tiles (b3dm)
- **Множество подложек** — Cesium Ion, Google Satellite, ArcGIS, OpenStreetMap
- **Cesium World Terrain** — глобальный рельеф местности
- **Русские надписи** — поддержка Google Hybrid с русским языком
- **Сворачиваемая панель** — минималистичный интерфейс

## 🚀 Быстрый старт

### Требования

- Node.js 18+
- pnpm (рекомендуется) или npm

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/xomyachok-shaolin/geostack.git
cd geostack

# Установить зависимости
pnpm install

# Скопировать статические файлы Cesium
pnpm run setup:cesium

# Запустить в режиме разработки
pnpm dev
```

Откройте http://localhost:3000 в браузере.

### Production сборка

```bash
pnpm run build
pnpm start
```

## 📁 Структура проекта

```
geostack/
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # React компоненты
│   │   ├── CesiumViewer.tsx  # Основной 3D просмотрщик
│   │   └── Toolbar.tsx       # Панель управления
│   └── lib/              # Утилиты и конфигурация
│       ├── cesium-config.ts      # Настройки Cesium
│       └── imagery-providers.ts  # Провайдеры подложек
├── public/
│   ├── cesium/          # Статические файлы CesiumJS
│   └── models/          # 3D модели (не в git)
├── models/              # Исходные 3D Tiles модели
└── ...
```

## 🗺️ Поддерживаемые подложки

| Подложка | Описание |
|----------|----------|
| Cesium Ion Спутник | Bing Maps Aerial через Cesium Ion |
| Google Спутник | Google Satellite без надписей |
| Спутник + Надписи (RU) | Google Hybrid с русскими надписями |
| ArcGIS Спутник | ESRI World Imagery |
| OpenStreetMap | Векторная карта OSM |

## ⚙️ Конфигурация

### Cesium Ion Token

Для работы Cesium Ion подложек и рельефа требуется токен:

1. Зарегистрируйтесь на [cesium.com](https://cesium.com/ion/signup)
2. Получите токен на [cesium.com/ion/tokens](https://cesium.com/ion/tokens)
3. Замените токен в `src/lib/cesium-config.ts`

### Добавление 3D моделей

Поместите tileset.json и b3dm файлы в папку `models/` и добавьте запись в `AVAILABLE_MODELS` в `src/lib/cesium-config.ts`:

```typescript
export const AVAILABLE_MODELS = [
  {
    id: 'my-model',
    name: 'Моя модель',
    url: '/models/my-model/tileset.json',
  },
];
```

## 🐳 Docker

```bash
# Сборка образа
docker build -t geostack .

# Запуск контейнера
docker run -p 3000:3000 geostack
```

## 📝 Скрипты

| Команда | Описание |
|---------|----------|
| `pnpm dev` | Запуск в режиме разработки |
| `pnpm build` | Production сборка |
| `pnpm start` | Запуск production сервера |
| `pnpm setup:cesium` | Копирование статических файлов Cesium |

## 🛠️ Технологии

- **[Next.js 14](https://nextjs.org/)** — React фреймворк
- **[CesiumJS](https://cesium.com/cesiumjs/)** — 3D геопространственная библиотека
- **[TypeScript](https://www.typescriptlang.org/)** — типизация
- **[pnpm](https://pnpm.io/)** — менеджер пакетов

## 📄 Лицензия

MIT License

## 👤 Автор

[xomyachok-shaolin](https://github.com/xomyachok-shaolin)
