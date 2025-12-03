import type * as Cesium from 'cesium';

// Типы для моделей
export interface Model3D {
  id: string;
  name: string;
  url: string;
  center?: {
    longitude: number;
    latitude: number;
    height: number;
  };
  // Смещение высоты модели (для выравнивания с terrain)
  heightOffset?: number;
}

// Типы для подложек
export interface BasemapConfig {
  id: string;
  name: string;
  type: 'ion' | 'osm' | 'google_satellite' | 'google_hybrid' | 'arcgis' | 'tms' | 'url' | 'none';
  url?: string;
  assetId?: number;
  rectangle?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  minZoom?: number;
  maxZoom?: number;
}

// Типы для рельефа
export interface TerrainConfig {
  id: string;
  name: string;
  type: 'ion' | 'none';
  url?: string;
  assetId?: number;
}

// Типы для камеры
export interface CameraPosition {
  longitude: number;
  latitude: number;
  height: number;
  heading?: number;
  pitch?: number;
  roll?: number;
}

// Опции для перелёта камеры
export interface FlyToOptions {
  duration?: number;
  heading?: number;
  pitch?: number;
  range?: number;
}

// Состояние вьювера
export interface ViewerState {
  isLoading: boolean;
  currentModel: string;
  currentBasemap: string;
  error: string | null;
}

// Результат загрузки
export type LoadResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: Error;
};

// Унифицированные данные о здании
export interface UnifiedBuildingData {
  // Координаты
  coordinates?: {
    lat: number;
    lon: number;
  };
  // Адрес
  address?: string;
  street?: string;
  houseNumber?: string;
  city?: string;
  // Характеристики здания
  buildingType?: string;
  floors?: number;
  yearBuilt?: number;
  wallMaterial?: string;
  roofMaterial?: string;
  heating?: string;
  // Кадастровые данные
  cadastralNumber?: string;
  area?: number;
  cadastralCost?: number;
}

// Информация об организации
export interface OrganizationInfo {
  name: string;
  type?: string;
  phone?: string;
  website?: string;
  workingHours?: string;
}
