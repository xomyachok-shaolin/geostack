// Константы для настройки Cesium и производительности

// Настройки 3D Tiles
export const TILESET_DEFAULTS = {
  /** Порог ошибки экранного пространства - меньше = выше качество, больше нагрузка */
  MAXIMUM_SCREEN_SPACE_ERROR: 24,
  /** Кэш для тайлов в байтах (2048 МБ) */
  CACHE_BYTES: 2048 * 1024 * 1024,
  /** Максимальное переполнение кэша в байтах (1024 МБ) */
  MAX_CACHE_OVERFLOW_BYTES: 1024 * 1024 * 1024,
  /** Использовать динамическую ошибку экранного пространства */
  DYNAMIC_SCREEN_SPACE_ERROR: true,
  /** Плотность для динамической ошибки */
  DYNAMIC_SCREEN_SPACE_ERROR_DENSITY: 0.00278,
  /** Фактор динамической ошибки */
  DYNAMIC_SCREEN_SPACE_ERROR_FACTOR: 4.0,
  /** Пропускать уровни детализации для быстрой загрузки */
  SKIP_LEVEL_OF_DETAIL: true,
  /** Предпочитать листовые тайлы */
  PREFER_LEAVES: true,
} as const;

// Настройки камеры
export const CAMERA_DEFAULTS = {
  /** Длительность анимации перелёта в секундах */
  FLY_TO_DURATION: 1.5,
  /** Угол наклона по умолчанию (градусы) - вид сверху */
  DEFAULT_PITCH: -90,
  /** Множитель радиуса для расстояния до модели */
  ZOOM_RADIUS_MULTIPLIER: 2.5,
  /** Минимальная высота камеры */
  MIN_ZOOM_DISTANCE: 10,
  /** Максимальная высота камеры */
  MAX_ZOOM_DISTANCE: 50000000,
} as const;

// Настройки рендеринга
export const RENDERING_DEFAULTS = {
  /** Включить FXAA сглаживание */
  FXAA_ENABLED: true,
  /** Резкость MSAA (если поддерживается) */
  MSAA_SAMPLES: 4,
  /** Качество освещения на основе изображений */
  IBL_INTENSITY: 1.0,
  /** Интенсивность солнечного света */
  SUN_INTENSITY: 2.0,
} as const;

// Задержки для дебаунса/троттлинга
export const TIMING = {
  /** Задержка дебаунса для изменения размера окна (мс) */
  RESIZE_DEBOUNCE: 200,
  /** Задержка перед скрытием индикатора загрузки (мс) */
  LOADING_HIDE_DELAY: 300,
  /** Интервал проверки состояния тайлсета (мс) */
  TILESET_CHECK_INTERVAL: 100,
} as const;

// Ограничения
export const LIMITS = {
  /** Максимальный уровень зума для подложек */
  MAX_IMAGERY_ZOOM: 20,
  /** Минимальный уровень зума для подложек */
  MIN_IMAGERY_ZOOM: 0,
  /** Максимальное количество одновременных запросов тайлов */
  MAX_TILE_REQUESTS: 64,
} as const;
