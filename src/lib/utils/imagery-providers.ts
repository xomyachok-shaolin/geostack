import * as Cesium from 'cesium';
import type { CesiumBasemapConfig, LoadResult } from '../types';
import { LIMITS } from './constants';
import { LOCAL_ORTHOPHOTOS } from '../config/cesium-config';



/**
 * Создаёт провайдер изображений на основе конфигурации подложки (Cesium)
 * Для multi_ortho возвращает массив провайдеров
 */
export async function createImageryProvider(
  config: CesiumBasemapConfig
): Promise<Cesium.ImageryProvider | Cesium.ImageryProvider[] | null> {
  switch (config.type) {
    case 'ion':
      return createIonImageryProvider(config.assetId!);

    case 'osm':
      return new Cesium.OpenStreetMapImageryProvider({
        url: config.url || 'https://tile.openstreetmap.org/',
      });

    case 'google_hybrid':
    case 'google_satellite':
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url!,
        minimumLevel: LIMITS.MIN_IMAGERY_ZOOM,
        maximumLevel: LIMITS.MAX_IMAGERY_ZOOM,
        credit: new Cesium.Credit('Google Maps'),
      });

    case 'arcgis':
      return createArcGisImageryProvider();

    case 'tms':
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url!,
        rectangle: config.rectangle
          ? Cesium.Rectangle.fromDegrees(
              config.rectangle.west,
              config.rectangle.south,
              config.rectangle.east,
              config.rectangle.north
            )
          : undefined,
        minimumLevel: config.minZoom ?? LIMITS.MIN_IMAGERY_ZOOM,
        maximumLevel: config.maxZoom ?? LIMITS.MAX_IMAGERY_ZOOM,
        tilingScheme: new Cesium.GeographicTilingScheme(),
      });

    case 'url':
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url!,
        rectangle: config.rectangle
          ? Cesium.Rectangle.fromDegrees(
              config.rectangle.west,
              config.rectangle.south,
              config.rectangle.east,
              config.rectangle.north
            )
          : undefined,
        minimumLevel: config.minZoom ?? LIMITS.MIN_IMAGERY_ZOOM,
        maximumLevel: config.maxZoom ?? LIMITS.MAX_IMAGERY_ZOOM,
      });

    case 'local_ortho':
      // Создаём провайдеры для всех локальных ортофотопланов
      // Сортируем по приоритету: сначала низкий (районы), потом высокий (детальные)
      // Так детальные слои будут сверху
      const sortedOrthos = [...LOCAL_ORTHOPHOTOS].sort((a, b) => 
        (a.priority ?? 0) - (b.priority ?? 0)
      );
      return sortedOrthos.map(ortho => {
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: ortho.url,
          rectangle: Cesium.Rectangle.fromDegrees(
            ortho.rectangle.west,
            ortho.rectangle.south,
            ortho.rectangle.east,
            ortho.rectangle.north
          ),
          minimumLevel: ortho.minZoom ?? 5,
          maximumLevel: ortho.maxZoom ?? 19,
          hasAlphaChannel: true, // Важно для прозрачности отсутствующих тайлов
          enablePickFeatures: false, // Отключаем для производительности
        });
        // Добавляем флаг для районных слоёв (нужен для colorToAlpha)
        (provider as any)._isDistrictLayer = (ortho.priority ?? 0) < 100;
        return provider;
      });

    case 'none':
      return null;

    default:
      console.warn('Unknown basemap type:', config.type);
      return null;
  }
}

/**
 * Создаёт провайдер изображений из Cesium Ion
 */
async function createIonImageryProvider(
  assetId: number
): Promise<Cesium.ImageryProvider> {
  try {
    const provider = await Cesium.IonImageryProvider.fromAssetId(assetId);
    console.log('Ion imagery loaded successfully, assetId:', assetId);
    return provider;
  } catch (error) {
    console.error('Error loading Ion imagery (assetId:', assetId, '):', error);
    console.warn(
      '⚠️ Cesium Ion требует действующий токен. Получите бесплатный токен на https://cesium.com/ion/tokens'
    );
    // Fallback на ArcGIS
    console.log('Falling back to ArcGIS satellite...');
    return createArcGisImageryProvider();
  }
}

/**
 * Создаёт провайдер изображений ArcGIS
 */
async function createArcGisImageryProvider(): Promise<Cesium.ArcGisMapServerImageryProvider> {
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
  );
}
