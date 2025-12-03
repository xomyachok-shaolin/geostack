import * as Cesium from 'cesium';
import type { Model3D, BasemapConfig, TerrainConfig } from '../types';

/**
 * Инициализация Cesium с базовыми настройками
 */
export function initCesium(): void {
  // Установка базового URL для статических ресурсов Cesium
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';
  
  // Cesium Ion токен для доступа к базовым слоям и рельефу
  // Бесплатный токен можно получить на https://cesium.com/ion/tokens
  Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiZGNhZjdkZC0xOTRmLTQ3N2YtODNlYi01ZWY3MzdkMDEyZDIiLCJpZCI6MTU1MjU3LCJpYXQiOjE2ODk4MzY5NjN9.ruoCeuKUThDO8ZKGcU-SufClp8A-bno50wtidTSafFI';
  
  // Оптимизации для производительности
  Cesium.RequestScheduler.maximumRequests = 18;
  Cesium.RequestScheduler.maximumRequestsPerServer = 6;
}

/**
 * Доступные 3D модели
 */
export const AVAILABLE_MODELS: Model3D[] = [
  {
    id: 'krasnoarmeiskoe',
    name: 'Красноармейское',
    url: '/models/krasnoarmeiskoe/tileset.json',
    center: {
      longitude: 47.15,
      latitude: 55.72,
      height: 200,
    },
  },
  {
    id: 'kanash',
    name: 'Канаш',
    url: '/models/kanash/tileset.json',
    center: {
      longitude: 47.49,
      latitude: 55.51,
      height: 200,
    },
  },
];

/**
 * Доступные подложки карты
 */
export const AVAILABLE_BASEMAPS: BasemapConfig[] = [
  {
    id: 'arcgis',
    name: 'ArcGIS Спутник',
    type: 'arcgis',
  },
  {
    id: 'ion_satellite',
    name: 'Cesium Ion Спутник',
    type: 'ion',
    assetId: 2, // Bing Maps Aerial
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
    url: 'https://tile.openstreetmap.org/',
  },
] as const;

/**
 * Доступные варианты рельефа
 */
export const TERRAIN_OPTIONS: TerrainConfig[] = [
  {
    id: 'none',
    name: 'Без рельефа',
    type: 'none',
  },

  {
    id: 'ion_world',
    name: 'Cesium World Terrain',
    type: 'ion',
    assetId: 1, // Cesium World Terrain
  },
] as const;

/**
 * Координаты покрытия локального рельефа
 */
export const LOCAL_TERRAIN_BOUNDS = {
  krasnoarmeiskoe: {
    west: 47.0,
    south: 55.6,
    east: 47.3,
    north: 55.85,
  },
  kanash: {
    west: 47.35,
    south: 55.4,
    east: 47.65,
    north: 55.6,
  },
} as const;
