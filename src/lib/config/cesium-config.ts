import * as Cesium from 'cesium';
import type { Model3D, CesiumBasemapConfig, CesiumOrthoLayer } from '../types';

/**
 * Инициализация Cesium с базовыми настройками
 */
export function initCesium(): void {
  // Установка базового URL для статических ресурсов Cesium
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';
  
  // Cesium Ion токен для доступа к базовым слоям и рельефу
  // НО: без VPN Ion может быть заблокирован (403)
  Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiNDZkN2UxYy1jZGEyLTQ4ZGYtYjQ1MS1hZmRiNzhmZDUyYjMiLCJpZCI6MzY2MjA3LCJpYXQiOjE3NjQ3NjA2MjZ9.EtOGdACo1NmGYx6tBkSJse65ROZ8H8MtttjSIeiUZKw';
  
  // Оптимизации для производительности
  // Ограничиваем параллельные запросы чтобы ортофото грузились быстрее
  Cesium.RequestScheduler.maximumRequests = 24;          // Общий лимит запросов
  Cesium.RequestScheduler.maximumRequestsPerServer = 12; // Лимит на сервер
  
  // Приоритизация - сначала загружаем видимые тайлы
  Cesium.RequestScheduler.requestsByServer = {};
}

/**
 * Создает провайдер рельефа в зависимости от доступности
 */
export async function createTerrainProvider(type: 'cesium' | 'maptiler' | 'none' = 'maptiler'): Promise<Cesium.TerrainProvider | undefined> {
  if (type === 'none') {
    return undefined;
  }
  
  if (type === 'maptiler') {
    // MapTiler Terrain - работает без VPN
    try {
      return await Cesium.CesiumTerrainProvider.fromUrl(
        'https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=MRRrl7HjI7IlJp9IxgEB',
        {
          requestVertexNormals: true,
        }
      );
    } catch (error) {
      console.warn('MapTiler terrain failed, using ellipsoid:', error);
      return undefined;
    }
  }
  
  // Cesium World Terrain (требует Ion, может быть заблокирован)
  try {
    return await Cesium.createWorldTerrainAsync({
      requestVertexNormals: true,
      requestWaterMask: false,
    });
  } catch (error) {
    console.warn('Cesium Ion terrain failed (возможно блокировка без VPN), используем плоскую землю:', error);
    return undefined;
  }
}

/**
 * Доступные 3D модели
 */
export const AVAILABLE_MODELS: Model3D[] = [
  {
    id: 'krasnoarmeiskoe',
    name: 'Красноармейское',
    url: '/api/models/krasnoarmeiskoe/tileset.json',
    center: {
      longitude: 47.15,
      latitude: 55.72,
      height: 200,
    },
  },
  {
    id: 'kanash',
    name: 'Канаш',
    url: '/api/models/kanash/tileset.json',
    center: {
      longitude: 47.49,
      latitude: 55.51,
      height: 200,
    },
  },
];

/**
 * Доступные подложки карты (Cesium)
 */
export const AVAILABLE_BASEMAPS: CesiumBasemapConfig[] = [
  {
    id: 'local_ortho',
    name: 'Локальные ортофото',
    type: 'local_ortho',
  },
  {
    id: 'arcgis',
    name: 'ArcGIS Спутник',
    type: 'arcgis',
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
];

/**
 * Конфигурация локальных ортофотопланов (Cesium)
 * Слои отображаются в порядке приоритета (выше priority = сверху)
 * Районные слои показываются только до zoom 14, дальше только детальные
 */
export const LOCAL_ORTHOPHOTOS: CesiumOrthoLayer[] = [
  // Районы (готовые тайлы) - ограничены maxZoom чтобы не перекрывать детальные
  {
    id: 'krasnoarmeiskiy-rayon',
    name: 'Красноармейский район',
    url: '/api/ortho/krasnoarmeiskiy-rayon/{z}/{x}/{y}.webp',
    rectangle: {
      west: 46.94577286,
      south: 55.66376807,
      east: 47.36972165,
      north: 55.86825217,
    },
    minZoom: 5,
    maxZoom: 14,  // Ограничиваем - дальше детальные слои
    priority: 50,
  },
  {
    id: 'kanashskiy-rayon',
    name: 'Канашский район',
    url: '/api/ortho/kanashskiy-rayon/{z}/{x}/{y}.webp',
    rectangle: {
      west: 47.19531000,
      south: 55.34957952,
      east: 47.65664078,
      north: 55.68905500,
    },
    minZoom: 5,
    maxZoom: 14,  // Ограничиваем - дальше детальные слои
    priority: 50,
  },
  // Детальные ортофото населённых пунктов (с альфа-каналом)
  {
    id: 'krasnoarmeiskoe',
    name: 'с. Красноармейское (детальное)',
    url: '/api/ortho/krasnoarmeiskoe/{z}/{x}/{y}.webp',
    rectangle: {
      west: 47.1472,
      south: 55.7552,
      east: 47.1888,
      north: 55.7873,
    },
    minZoom: 10,
    maxZoom: 21,
    priority: 100,
  },
  {
    id: 'kanash',
    name: 'г. Канаш (детальное)',
    url: '/api/ortho/kanash/{z}/{x}/{y}.webp',
    rectangle: {
      west: 47.4194,
      south: 55.4662,
      east: 47.5667,
      north: 55.5482,
    },
    minZoom: 10,
    maxZoom: 21,
    priority: 100,
  },
];


