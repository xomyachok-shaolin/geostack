import * as Cesium from 'cesium';
import type { BasemapConfig, TerrainConfig, LoadResult } from './types';
import { LIMITS } from './constants';

/**
 * Создаёт провайдер изображений на основе конфигурации подложки
 */
export async function createImageryProvider(
  config: BasemapConfig
): Promise<Cesium.ImageryProvider | null> {
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
        minimumLevel: config.minZoom ?? LIMITS.MIN_IMAGERY_ZOOM,
        maximumLevel: config.maxZoom ?? LIMITS.MAX_IMAGERY_ZOOM,
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

/**
 * Создаёт провайдер рельефа на основе конфигурации
 */
export async function createTerrainProvider(
  config: TerrainConfig
): Promise<LoadResult<Cesium.TerrainProvider | undefined>> {
  switch (config.type) {
    case 'ion':
      try {
        const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(config.assetId!);
        console.log('Ion terrain loaded successfully, assetId:', config.assetId);
        return { success: true, data: terrain };
      } catch (error) {
        console.error('Error loading Ion terrain:', error);
        console.warn('⚠️ Cesium World Terrain требует действующий Ion токен.');
        console.warn('Получите бесплатный токен: https://cesium.com/ion/tokens');
        console.warn('Затем замените токен в src/lib/cesium-config.ts');
        return { 
          success: false, 
          error: error instanceof Error ? error : new Error('Unknown error') 
        };
      }

    case 'quantized-mesh':
      try {
        const terrain = await Cesium.CesiumTerrainProvider.fromUrl(config.url!);
        return { success: true, data: terrain };
      } catch (error) {
        console.error('Error loading terrain:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error : new Error('Unknown error') 
        };
      }

    case 'none':
    default:
      return { success: true, data: undefined };
  }
}
