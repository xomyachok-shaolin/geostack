/**
 * Конфигурация MapLibre + Three.js
 */

import type { BasemapConfig, Model3D, OrthoLayer } from '../types';

/**
 * Доступные 3D модели (3D Tiles)
 */
export const AVAILABLE_MODELS: Model3D[] = [
  {
    id: 'krasnoarmeiskoe',
    name: 'Красноармейское',
    url: '/api/models/krasnoarmeiskoe/tileset.json',
    center: {
      longitude: 47.171,  // ~47° E
      latitude: 55.770,   // ~55° N
      height: 115,
    },
    heightOffset: 0,
  },
  {
    id: 'kanash',
    name: 'Канаш',
    url: '/api/models/kanash/tileset.json',
    center: {
      longitude: 47.525,  // ~47° E
      latitude: 55.507,   // ~55° N
      height: 194,
    },
    heightOffset: 0,
  },
];

/**
 * Доступные подложки карты
 */
export const AVAILABLE_BASEMAPS: BasemapConfig[] = [
  {
    id: 'local_ortho',
    name: 'Локальные ортофото',
    type: 'local_ortho',
  },
  {
    id: 'google_satellite',
    name: 'Google Спутник',
    type: 'google_satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  },
  {
    id: 'google_hybrid_ru',
    name: 'Спутник + Надписи (RU)',
    type: 'google_hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&hl=ru&x={x}&y={y}&z={z}',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    type: 'osm',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  },
];

/**
 * Конфигурация локальных ортофотопланов
 */
export const LOCAL_ORTHOPHOTOS: OrthoLayer[] = [
  // Районы (нижний слой, покрывают большую площадь)
  {
    id: 'krasnoarmeiskiy-rayon',
    name: 'Красноармейский район',
    url: '/api/ortho/krasnoarmeiskiy-rayon/{z}/{x}/{y}.png',
    bounds: [46.94577286, 55.66376807, 47.36972165, 55.86825217], // [west, south, east, north]
    minZoom: 10,
    maxZoom: 18,
  },
  {
    id: 'kanashskiy-rayon',
    name: 'Канашский район',
    url: '/api/ortho/kanashskiy-rayon/{z}/{x}/{y}.png',
    bounds: [47.19531000, 55.34957952, 47.65664078, 55.68905500],
    minZoom: 10,
    maxZoom: 18,
  },
  // Детальные ортофото (верхний слой)
  {
    id: 'krasnoarmeiskoe',
    name: 'с. Красноармейское (детальное)',
    url: '/api/ortho/krasnoarmeiskoe/{z}/{x}/{y}.png',
    bounds: [47.1472, 55.7552, 47.1888, 55.7873],
    minZoom: 14,
    maxZoom: 22,
  },
  {
    id: 'kanash',
    name: 'г. Канаш (детальное)',
    url: '/api/ortho/kanash/{z}/{x}/{y}.png',
    bounds: [47.4194, 55.4662, 47.5667, 55.5482],
    minZoom: 14,
    maxZoom: 22,
  },
];

/**
 * Конфигурация рельефа
 */
export const TERRAIN_CONFIG = {
  // URL для получения тайлов рельефа в формате Mapbox Terrain-DEM
  // Можно использовать Mapbox, MapTiler или свой terrain-rgb сервер
  source: 'mapbox-terrain', // или 'local' для локального
  url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp',
  exaggeration: 1.5, // Коэффициент преувеличения рельефа
  // Для локального рельефа (будет реализовано позже)
  localUrl: '/api/terrain/{z}/{x}/{y}.png',
};

/**
 * Дефолтные настройки камеры
 */
export const DEFAULT_VIEW = {
  // Центр между Красноармейским и Канашом
  center: [47.32, 55.62] as [number, number],
  zoom: 10,
  pitch: 60, // Наклон камеры для 3D эффекта
  bearing: 0,
};

/**
 * Настройки для 3D Tiles рендеринга
 */
export const TILES_3D_CONFIG = {
  // Максимальное количество одновременно загружаемых тайлов
  maxConcurrentRequests: 32,
  // Максимальное использование памяти (MB)
  maxMemoryUsage: 512,
  // Screen Space Error - порог детализации (меньше = детальнее)
  screenSpaceError: 16,
};
