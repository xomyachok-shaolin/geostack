import * as Cesium from 'cesium';

export function initCesium() {
  (window as any).CESIUM_BASE_URL = '/cesium/';
  // Cesium Ion токен для доступа к базовым слоям и рельефу
  // Бесплатный токен можно получить на https://cesium.com/ion/tokens
  Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiZGNhZjdkZC0xOTRmLTQ3N2YtODNlYi01ZWY3MzdkMDEyZDIiLCJpZCI6MTU1MjU3LCJpYXQiOjE2ODk4MzY5NjN9.ruoCeuKUThDO8ZKGcU-SufClp8A-bno50wtidTSafFI';
}

export const AVAILABLE_MODELS = [
  {
    id: 'krasnoarmeiskoe',
    name: 'Красноармейское',
    url: '/models/Krasnoarmeiskoe_textured.json',
    // Примерные координаты центра модели (ECEF -> WGS84)
    // X=2445000, Y=2638000, Z=5249000 -> примерно 55.7° N, 47.2° E
    center: {
      longitude: 47.15,
      latitude: 55.72,
      height: 200,
    },
  },
];

export const AVAILABLE_BASEMAPS = [
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
    id: 'arcgis_satellite',
    name: 'ArcGIS Спутник',
    type: 'arcgis',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    type: 'osm',
    url: 'https://tile.openstreetmap.org/',
  },
];

export const TERRAIN_OPTIONS = [
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
  {
    id: 'local',
    name: 'Локальный рельеф',
    type: 'quantized-mesh',
    url: '/terrain/',
  },
];
