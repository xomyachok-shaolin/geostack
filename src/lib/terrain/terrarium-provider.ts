/**
 * Terrarium Terrain Provider для Cesium
 * Декодирует RGB-encoded heightmap из Mapzen Terrarium tiles
 * Формула: height = (R * 256 + G + B / 256) - 32768
 */

import * as Cesium from 'cesium';

export class TerrariumTerrainProvider implements Cesium.TerrainProvider {
  readonly errorEvent: Cesium.Event = new Cesium.Event();
  readonly credit: Cesium.Credit = new Cesium.Credit('Terrain: Mapzen Terrarium');
  readonly tilingScheme: Cesium.GeographicTilingScheme;
  readonly ready: boolean = true;
  readonly readyPromise: Promise<boolean>;
  readonly hasWaterMask: boolean = false;
  readonly hasVertexNormals: boolean = false;
  readonly availability?: Cesium.TileAvailability;

  constructor() {
    this.tilingScheme = new Cesium.GeographicTilingScheme();
    this.readyPromise = Promise.resolve(true);
  }

  getLevelMaximumGeometricError(level: number): number {
    return this.tilingScheme.rectangle.width / 256 / Math.pow(2, level);
  }

  getTileDataAvailable(x: number, y: number, level: number): boolean {
    return level <= 15;
  }

  loadTileDataAvailability(x: number, y: number, level: number): undefined {
    return undefined;
  }

  /**
   * Загружает и декодирует tile с высотами
   */
  requestTileGeometry(
    x: number,
    y: number,
    level: number,
    request?: any
  ): Promise<Cesium.TerrainData | undefined> | undefined {
    // Terrarium доступен только с zoom 0-15
    if (level > 15) {
      return Promise.resolve(undefined);
    }

    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${level}/${x}/${y}.png`;

    return fetch(url)
      .then(response => {
        if (!response.ok) {
          return undefined;
        }
        return response.blob();
      })
      .then(blob => {
        if (!blob) return undefined;
        return createImageBitmap(blob);
      })
      .then(imageBitmap => {
        if (!imageBitmap) return undefined;

        // Создаем canvas для чтения пикселей
        const canvas = document.createElement('canvas');
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          return undefined;
        }

        ctx.drawImage(imageBitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Декодируем высоты из RGB (переворачиваем Y так как изображения идут сверху вниз)
        const heightmapWidth = canvas.width;
        const heightmapHeight = canvas.height;
        const heights = new Int16Array(heightmapWidth * heightmapHeight);

        for (let y = 0; y < heightmapHeight; y++) {
          for (let x = 0; x < heightmapWidth; x++) {
            const i = (y * heightmapWidth + x) * 4;
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];

            // Формула Terrarium: height = (R * 256 + G + B / 256) - 32768
            const height = (r * 256.0 + g + b / 256.0) - 32768.0;
            // Переворачиваем Y координату
            const flippedY = heightmapHeight - 1 - y;
            heights[flippedY * heightmapWidth + x] = Math.round(height);
          }
        }

        // Создаем HeightmapTerrainData с правильными параметрами
        return new Cesium.HeightmapTerrainData({
          buffer: heights,
          width: heightmapWidth,
          height: heightmapHeight,
          childTileMask: 15, // Все 4 дочерних тайла доступны
          structure: {
            heightScale: 1.0,
            heightOffset: 0.0,
            elementsPerHeight: 1,
            stride: 1,
            elementMultiplier: 256.0, // Масштаб для Int16
            isBigEndian: false,
          },
        });
      })
      .catch(error => {
        console.warn(`Failed to load Terrarium tile ${level}/${x}/${y}:`, error);
        return undefined;
      });
  }
}
