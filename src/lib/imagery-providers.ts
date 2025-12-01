import * as Cesium from 'cesium';

interface BasemapConfig {
  id: string;
  name: string;
  type: string;
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

export async function createImageryProvider(config: BasemapConfig): Promise<Cesium.ImageryProvider | null> {
  switch (config.type) {
    case 'ion':
      // Cesium Ion - встроенные подложки
      try {
        const provider = await Cesium.IonImageryProvider.fromAssetId(config.assetId!);
        console.log('Ion imagery loaded successfully, assetId:', config.assetId);
        return provider;
      } catch (error) {
        console.error('Error loading Ion imagery (assetId:', config.assetId, '):', error);
        console.warn('⚠️ Cesium Ion требует действующий токен. Получите бесплатный токен на https://cesium.com/ion/tokens');
        // Fallback на ArcGIS
        console.log('Falling back to ArcGIS satellite...');
        return await Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        );
      }

    case 'osm':
      return new Cesium.OpenStreetMapImageryProvider({
        url: config.url || 'https://tile.openstreetmap.org/',
      });

    case 'google_hybrid':
      // Google Hybrid (спутник + надписи) с русским языком
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url!,
        minimumLevel: 0,
        maximumLevel: 20,
      });

    case 'google_satellite':
      // Google Satellite (только спутник, без надписей)
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url!,
        minimumLevel: 0,
        maximumLevel: 20,
      });

    case 'arcgis':
      // ArcGIS World Imagery - надёжный источник спутниковых снимков
      return await Cesium.ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
      );

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
        minimumLevel: config.minZoom || 0,
        maximumLevel: config.maxZoom || 20,
        tilingScheme: new Cesium.GeographicTilingScheme(),
      });

    case 'url':
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url!,
        minimumLevel: config.minZoom || 0,
        maximumLevel: config.maxZoom || 20,
      });

    case 'none':
      return null;

    default:
      console.warn('Unknown basemap type:', config.type);
      return null;
  }
}

export async function createTerrainProvider(config: { type: string; url?: string; assetId?: number }): Promise<Cesium.TerrainProvider | undefined> {
  switch (config.type) {
    case 'ion':
      try {
        const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(config.assetId!);
        console.log('Ion terrain loaded successfully, assetId:', config.assetId);
        return terrain;
      } catch (error) {
        console.error('Error loading Ion terrain:', error);
        console.warn('⚠️ Cesium World Terrain требует действующий Ion токен.');
        console.warn('Получите бесплатный токен: https://cesium.com/ion/tokens');
        console.warn('Затем замените токен в src/lib/cesium-config.ts');
        return undefined;
      }

    case 'quantized-mesh':
      try {
        return await Cesium.CesiumTerrainProvider.fromUrl(config.url!);
      } catch (error) {
        console.error('Error loading terrain:', error);
        return undefined;
      }

    case 'none':
    default:
      return undefined;
  }
}
