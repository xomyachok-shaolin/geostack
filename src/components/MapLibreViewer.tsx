'use client';

import { TilesRenderer } from '3d-tiles-renderer';
import maplibregl, { CustomLayerInterface, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  AVAILABLE_BASEMAPS,
  AVAILABLE_MODELS,
  DEFAULT_VIEW,
  LOCAL_ORTHOPHOTOS,
} from '@/lib/config/map-config';
import InfoPanel from './InfoPanel';
import Toolbar from './Toolbar';

// WGS84 эллипсоид для ECEF конвертации
const WGS84_A = 6378137.0;
const WGS84_B = 6356752.314245;
const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);

/**
 * Конвертирует ECEF координаты в географические (LLA)
 */
function ecefToLLA(x: number, y: number, z: number): { lon: number; lat: number; alt: number } {
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);
  
  let lat = Math.atan2(z, p * (1 - WGS84_E2));
  for (let i = 0; i < 5; i++) {
    const sinLat = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    lat = Math.atan2(z + WGS84_E2 * N * sinLat, p);
  }
  
  const sinLat = Math.sin(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const alt = p / Math.cos(lat) - N;
  
  return {
    lon: lon * (180 / Math.PI),
    lat: lat * (180 / Math.PI),
    alt,
  };
}

/**
 * Конвертирует географические координаты в ECEF
 */
function llaToECEF(lon: number, lat: number, alt: number): [number, number, number] {
  const lonRad = lon * (Math.PI / 180);
  const latRad = lat * (Math.PI / 180);
  
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);
  
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  
  const x = (N + alt) * cosLat * cosLon;
  const y = (N + alt) * cosLat * sinLon;
  const z = (N * (1 - WGS84_E2) + alt) * sinLat;
  
  return [x, y, z];
}

/**
 * Создаёт матрицу трансформации ECEF -> ENU (East-North-Up)
 */
function createECEFtoLocalMatrix(refLon: number, refLat: number, refAlt: number): THREE.Matrix4 {
  const lonRad = refLon * (Math.PI / 180);
  const latRad = refLat * (Math.PI / 180);
  
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  
  const [refX, refY, refZ] = llaToECEF(refLon, refLat, refAlt);
  
  // ECEF -> ENU матрица
  const rotationMatrix = new THREE.Matrix4().set(
    -sinLon,           cosLon,            0,       0,
    -sinLat * cosLon,  -sinLat * sinLon,  cosLat,  0,
    cosLat * cosLon,   cosLat * sinLon,   sinLat,  0,
    0,                 0,                 0,       1
  );
  
  const translationMatrix = new THREE.Matrix4().makeTranslation(-refX, -refY, -refZ);
  
  return rotationMatrix.multiply(translationMatrix);
}

/**
 * Создаёт Custom Layer для 3D Tiles
 */
function create3DTilesLayer(
  layerId: string,
  tilesUrl: string,
  modelCenter: { longitude: number; latitude: number; height: number },
  modelHeightOffset: number,
  onLoad?: () => void,
  onError?: (error: Error) => void
): CustomLayerInterface {
  let map: Map;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let tilesRenderer: TilesRenderer | null = null;
  let camera: THREE.Camera;
  let world: THREE.Group;
  let renderCount = 0;
  
  return {
    id: layerId,
    type: 'custom' as const,
    renderingMode: '3d' as const,

    onAdd(mapInstance: Map, gl: WebGLRenderingContext) {
      console.log('🎯 onAdd called for layer:', layerId);
      map = mapInstance;
      const canvas = map.getCanvas();

      // Инициализация Three.js - используем PerspectiveCamera для правильного frustum culling
      camera = new THREE.PerspectiveCamera(
        60, // FOV
        canvas.width / canvas.height, // aspect
        1, // near - близко для детальных моделей
        1e9 // far - очень далеко для ECEF координат (миллионы метров)
      );
      
      scene = new THREE.Scene();
      world = new THREE.Group();
      scene.add(world);

      // Освещение
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(0, 70, 100).normalize();
      scene.add(directionalLight);

      renderer = new THREE.WebGLRenderer({
        canvas: canvas as HTMLCanvasElement,
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      // Создаём TilesRenderer
      const absoluteUrl = typeof window !== 'undefined'
        ? new URL(tilesUrl, window.location.origin).toString()
        : tilesUrl;
      
      // Получаем базовый URL (директория где лежит tileset.json)
      const baseUrl = absoluteUrl.substring(0, absoluteUrl.lastIndexOf('/') + 1);
      
      console.log('🚀 TilesRenderer URL:', absoluteUrl);
      console.log('🚀 Base URL:', baseUrl);
      
      tilesRenderer = new TilesRenderer(absoluteUrl);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tr = tilesRenderer as any;
      
      // КРИТИЧНО: Monkey-patch preprocessNode чтобы кодировать URI ДО обработки библиотекой
      // Проблема: new URL() падает если в URI есть [ или ]
      const originalPreprocessNode = tr.preprocessNode.bind(tilesRenderer);
      tr.preprocessNode = function(tile: any, tileSetDir: string, parentTile: any = null) {
        // Отладка - логируем все URI
        if (tile?.content?.uri) {
          console.log('🔍 preprocessNode URI:', tile.content.uri, 'basePath:', tileSetDir);
        }
        // Кодируем URI ДО вызова оригинального метода
        if (tile?.content?.uri) {
          const uri = tile.content.uri;
          // Проверяем есть ли спецсимволы которые ломают new URL() (включая закодированные)
          if (/[\[\]\s\(\)]|%5B|%5D|%20/.test(uri)) {
            // Декодируем -> кодируем чтобы нормализовать
            const encodedUri = uri.split('/').map((seg: string) => {
              if (seg === '.' || seg === '..') return seg;
              try {
                const decoded = decodeURIComponent(seg);
                return encodeURIComponent(decoded);
              } catch {
                return encodeURIComponent(seg);
              }
            }).join('/');
            console.log('🔗 Patched preprocessNode encoded URI:', uri, '->', encodedUri);
            tile.content.uri = encodedUri;
          }
        }
        // Вызываем оригинальный метод
        return originalPreprocessNode(tile, tileSetDir, parentTile);
      };
      
      // Также патчим requestTileContents чтобы отлавливать ошибки
      const originalRequestTileContents = tr.requestTileContents?.bind(tilesRenderer);
      if (originalRequestTileContents) {
        tr.requestTileContents = function(tile: any) {
          if (tile?.content?.uri) {
            console.log('📦 requestTileContents:', tile.content.uri, '__basePath:', tile.__basePath);
            // Проверяем что __basePath валидный
            if (!tile.__basePath) {
              console.error('❌ Missing __basePath for tile:', tile);
            }
            
            // Пробуем создать URL заранее чтобы отловить ошибку
            try {
              const testUrl = new URL(tile.content.uri, tile.__basePath + '/');
              console.log('✅ URL created successfully:', testUrl.toString());
            } catch (e) {
              console.error('❌ URL creation failed!');
              console.error('  URI:', tile.content.uri);
              console.error('  __basePath:', tile.__basePath);
              console.error('  Combined base:', tile.__basePath + '/');
              console.error('  Error:', e);
              
              // Пробуем исправить - если basePath невалидный
              if (tile.__basePath && !tile.__basePath.startsWith('http')) {
                // basePath должен быть абсолютным URL
                tile.__basePath = new URL(tile.__basePath, window.location.origin).toString();
                console.log('🔧 Fixed __basePath:', tile.__basePath);
              }
            }
          }
          return originalRequestTileContents(tile);
        };
      }
      
      // Настройки TilesRenderer - ПОЛНОСТЬЮ отключаем frustum culling и LOD
      tilesRenderer.errorTarget = Infinity; // Загружать ВСЕ тайлы независимо от размера
      tilesRenderer.maxDepth = 100;
      tilesRenderer.displayActiveTiles = true;
      
      // Отключаем frustum culling на уровне группы
      tilesRenderer.group.frustumCulled = false;
      tilesRenderer.group.matrixAutoUpdate = false;
      
      // ВАЖНО: Переопределяем calculateTileViewError чтобы ВСЕГДА считать тайлы видимыми
      // Используем tr объявленный выше
      
      // Ключевой метод - переопределяем проверку видимости тайла
      // Это заставит TilesRenderer загружать все тайлы независимо от frustum
      tr.calculateTileViewError = (tile: any, target: any) => {
        // Всегда считаем что тайл виден с максимальной ошибкой (высокий приоритет)
        target.inView = true;
        target.error = Infinity; // Большая ошибка = нужно загрузить
        target.distanceFromCamera = 0; // Минимальное расстояние = высокий приоритет
      };
      
      // GLTFLoader для моделей (gltf/glb) - B3DMLoader регистрируется автоматически в 3d-tiles-renderer
      const gltfLoader = new GLTFLoader(tilesRenderer.manager);
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      gltfLoader.setDRACOLoader(dracoLoader);
      tilesRenderer.manager.addHandler(/\.gltf$|\.glb$/i, gltfLoader);
      
      console.log('📦 TilesRenderer initialized (B3DM support built-in)');
      
      tilesRenderer.setCamera(camera);
      tilesRenderer.setResolutionFromRenderer(camera, renderer);

      // Обработка загрузки tileset
      tilesRenderer.addEventListener('load-tile-set', () => {
        console.log('✅ Tileset loaded!');
        
        if (tilesRenderer) {
          const sphere = new THREE.Sphere();
          if (tilesRenderer.getBoundingSphere(sphere)) {
            const center = ecefToLLA(sphere.center.x, sphere.center.y, sphere.center.z);
            console.log('📍 Model ECEF center:', sphere.center.x.toFixed(1), sphere.center.y.toFixed(1), sphere.center.z.toFixed(1));
            console.log('📍 Model LLA center:', center.lon.toFixed(4), center.lat.toFixed(4), 'alt:', center.alt.toFixed(1));
            console.log('📏 Bounding sphere radius:', sphere.radius.toFixed(1), 'm');
            
            // Обновляем центр модели для render()
            modelCenter.longitude = center.lon;
            modelCenter.latitude = center.lat;
            modelCenter.height = center.alt;
            
            // НЕ применяем трансформацию к tilesRenderer.group - это ломает frustum culling
            // Вместо этого будем применять трансформацию в render() через матрицы
            console.log('📍 Model center saved, will transform in render()');
            
            // Отладка: смотрим структуру tilesRenderer
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tr = tilesRenderer as any;
            console.log('🔍 TilesRenderer structure:', {
              group: tilesRenderer.group,
              groupChildren: tilesRenderer.group.children.length,
              root: tr.root,
            });
            
            // Выводим все методы TilesRenderer для отладки
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(tr))
              .filter(name => typeof tr[name] === 'function');
            console.log('🔧 TilesRenderer methods:', methods);
            
            // Также выводим свойства
            console.log('🔧 TilesRenderer properties:', {
              downloadQueue: tr.downloadQueue,
              parseQueue: tr.parseQueue,
              lruCache: tr.lruCache,
              queuedTiles: tr.queuedTiles,
            });
            
            // Проверяем root тайл для отладки
            if (tr.root) {
              console.log('🔄 Root tile loaded, children count:', tr.root.children?.length || 0);
              
              // Устанавливаем флаги видимости чтобы библиотека загрузила тайлы
              tr.root.__visible = true;
              tr.root.__active = true;
              tr.root.__used = true;
              tr.root.__inFrustum = true;
              
              // НЕ вызываем requestTileContents вручную - библиотека сделает это сама в update()
              // Просто устанавливаем флаги для дочерних тайлов
              if (tr.root.children && tr.root.children.length > 0) {
                console.log('📥 Root has children:', tr.root.children.length);
                const maxToMark = Math.min(50, tr.root.children.length);
                
                for (let i = 0; i < maxToMark; i++) {
                  const child = tr.root.children[i];
                  child.__visible = true;
                  child.__active = true;
                  child.__used = true;
                  child.__inFrustum = true;
                  child.__error = Infinity;
                  child.__distanceFromCamera = 0;
                }
                console.log('📊 Marked first', maxToMark, 'children as visible');
              }
            }
          }
          
          onLoad?.();
          map.triggerRepaint();
        }
      });

      tilesRenderer.addEventListener('load-error', (event) => {
        console.error('❌ Load error:', event);
        onError?.(new Error('Failed to load tiles'));
      });
      
      // Обработчик для старта загрузки контента (b3dm)
      tilesRenderer.addEventListener('start-load-content', (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = event as any;
        console.log('📥 Starting content load:', e.tile?.content?.uri);
      });
      
      // Дополнительные события для отладки
      tilesRenderer.addEventListener('tiles-load-start', () => {
        console.log('🔄 Tiles loading started');
      });
      
      tilesRenderer.addEventListener('tiles-load-end', () => {
        console.log('✅ All tiles loaded');
        
        // Детальная диагностика структуры TilesRenderer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tr = tilesRenderer as any;
        
        console.log('📊 TilesRenderer internal structure:', {
          groupChildren: tilesRenderer?.group.children.length,
          activeTiles: tr.activeTiles?.size,
          visibleTiles: tr.visibleTiles?.size,
          root: tr.root,
          rootChildren: tr.root?.children?.length,
        });
        
        // Рекурсивно считаем все объекты и ищем меши
        let totalObjects = 0;
        let meshes = 0;
        const meshPositions: string[] = [];
        
        tilesRenderer?.group.traverse((obj) => {
          totalObjects++;
          if (obj instanceof THREE.Mesh) {
            meshes++;
            if (meshPositions.length < 3) {
              meshPositions.push(`(${obj.position.x.toFixed(0)}, ${obj.position.y.toFixed(0)}, ${obj.position.z.toFixed(0)})`);
            }
          }
        });
        
        console.log('📊 Group contents:', { totalObjects, meshes, meshPositions });
        
        // Проверяем visibleTiles
        if (tr.visibleTiles) {
          console.log('📊 Visible tiles:', Array.from(tr.visibleTiles).slice(0, 3));
        }
        
        // Проверяем activeTiles - там должны быть загруженные тайлы
        if (tr.activeTiles && tr.activeTiles.size > 0) {
          const firstTile = Array.from(tr.activeTiles)[0] as any;
          console.log('📊 First active tile:', {
            uri: firstTile?.content?.uri,
            cached: firstTile?.cached,
            cachedScene: firstTile?.cached?.scene,
            cachedSceneChildren: firstTile?.cached?.scene?.children?.length,
          });
        }
      });

      // Логируем загрузку моделей и ПРИНУДИТЕЛЬНО добавляем в группу
      tilesRenderer.addEventListener('load-model', (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = event as any;
        const scene = e.scene as THREE.Group | undefined;
        const tile = e.tile;
        const uri = tile?.content?.uri || 'unknown';
        
        if (scene) {
          let meshCount = 0;
          let totalVertices = 0;
          
          scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              meshCount++;
              const geom = obj.geometry;
              if (geom instanceof THREE.BufferGeometry) {
                totalVertices += geom.attributes.position?.count || 0;
              }
              
              // Отключаем frustum culling для надёжности
              obj.frustumCulled = false;
              obj.visible = true;
              
              // Обрабатываем материалы
              const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
              
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial) {
                  mat.side = THREE.DoubleSide;
                  mat.metalness = 0;
                  mat.roughness = 1;
                  mat.needsUpdate = true;
                } else if (mat instanceof THREE.MeshBasicMaterial) {
                  mat.side = THREE.DoubleSide;
                  mat.needsUpdate = true;
                }
              });
            }
          });
          
          // ПРИНУДИТЕЛЬНО добавляем scene в группу если её там нет
          if (!scene.parent && tilesRenderer) {
            tilesRenderer.group.add(scene);
          }
          
          // Делаем тайл видимым принудительно
          if (tile) {
            tile.__visible = true;
          }
          
          console.log(`📦 Model loaded: ${uri}`, { meshCount, totalVertices });
        }
      });
      
      // Включаем события видимости для диагностики
      tilesRenderer.addEventListener('tile-visibility-change', (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = event as any;
        console.log('👁️ Tile visibility change:', {
          uri: e.tile?.content?.uri,
          visible: e.visible,
        });
      });

      world.add(tilesRenderer.group);
      
      // Отладочный куб в центре (0,0,0) - должен быть виден если рендеринг работает
      const debugCube = new THREE.Mesh(
        new THREE.BoxGeometry(50, 50, 50),
        new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: false })
      );
      debugCube.position.set(0, 0, 25);
      debugCube.frustumCulled = false;
      world.add(debugCube);
      console.log('🟢 Debug cube added at origin');
      
      map.triggerRepaint();
    },

    render(_gl: WebGLRenderingContext, args: maplibregl.CustomRenderMethodInput) {
      if (!tilesRenderer || !renderer || !scene || !map) return;
      
      renderCount++;

      // Получаем модельную матрицу от MapLibre - работает для Globe и Mercator проекций
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transform = (map as any).transform;
      const modelOrigin = [modelCenter.longitude, modelCenter.latitude] as [number, number];
      
      // Получаем текущую позицию камеры MapLibre
      const mapCenter = map.getCenter();
      const mapZoom = map.getZoom();
      
      // Вычисляем высоту камеры из zoom
      const earthRadius = 6378137;
      const cameraAltitude = earthRadius * Math.pow(2, 1 - mapZoom) * 2;
      
      // Позиция центра модели в ECEF
      const [modelX, modelY, modelZ] = llaToECEF(modelCenter.longitude, modelCenter.latitude, modelCenter.height);
      
      // Позиционируем камеру TilesRenderer прямо над моделью (не зависит от mapCenter)
      // Это нужно для правильного frustum culling в TilesRenderer
      const perspCamera = camera as THREE.PerspectiveCamera;
      
      // Камера над моделью на высоте, зависящей от zoom
      const viewHeight = Math.max(100, cameraAltitude / 1000); // От 100м до altitude/1000
      const [camX, camY, camZ] = llaToECEF(modelCenter.longitude, modelCenter.latitude, modelCenter.height + viewHeight);
      
      perspCamera.position.set(camX, camY, camZ);
      perspCamera.lookAt(modelX, modelY, modelZ);
      perspCamera.fov = 90; // Широкий угол для захвата всей модели
      
      // Обновляем near/far для текущего расстояния
      const distanceToModel = viewHeight;
      perspCamera.near = 1;
      perspCamera.far = viewHeight * 100;
      perspCamera.updateProjectionMatrix();
      perspCamera.updateMatrixWorld(true);
      
      // ВАЖНО: Сбрасываем матрицу группы в identity ПЕРЕД update()
      // Иначе frustum culling будет использовать трансформированные координаты
      tilesRenderer.group.matrix.identity();
      tilesRenderer.group.matrixAutoUpdate = false;
      tilesRenderer.group.updateMatrixWorld(true);
      
      // TilesRenderer update в ECEF координатах (группа в identity)
      tilesRenderer.setCamera(camera);
      tilesRenderer.setResolutionFromRenderer(camera, renderer);
      tilesRenderer.update();
      
      // Отладка: проверяем статус TilesRenderer
      if (renderCount === 1 || renderCount === 10 || renderCount === 50) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tr = tilesRenderer as any;
        
        // Проверяем root tile
        const root = tr.root;
        console.log(`🔄 TilesRenderer status #${renderCount}:`, {
          rootExists: !!root,
          rootBoundingVolume: root?.boundingVolume,
          rootGeometricError: root?.geometricError,
          rootChildren: root?.children?.length,
          rootCached: !!root?.cached,
          rootVisible: root?.__visible,
          rootActive: root?.__active,
          rootUsed: root?.__used,
        });
        
        // Проверяем что происходит при траверсе
        if (root && renderCount === 50) {
          console.log('🔍 Root tile details:', {
            content: root.content,
            refine: root.refine,
            transform: root.transform,
          });
        }
      }
      
      // Отладка: сколько объектов после update
      if (renderCount === 1 || renderCount === 50 || renderCount === 200) {
        let meshCount = 0;
        tilesRenderer.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) meshCount++;
        });
        
        // Также проверим bounding sphere
        const sphere = new THREE.Sphere();
        const hasBounds = tilesRenderer.getBoundingSphere(sphere);
        
        console.log(`🔍 Render #${renderCount}:`, {
          groupChildren: tilesRenderer.group.children.length,
          meshes: meshCount,
          distance: distanceToModel.toFixed(0),
          cameraPos: `${camX.toFixed(0)}, ${camY.toFixed(0)}, ${camZ.toFixed(0)}`,
          modelPos: `${modelX.toFixed(0)}, ${modelY.toFixed(0)}, ${modelZ.toFixed(0)}`,
          hasBounds,
          sphereCenter: hasBounds ? `${sphere.center.x.toFixed(0)}, ${sphere.center.y.toFixed(0)}, ${sphere.center.z.toFixed(0)}` : 'N/A',
          sphereRadius: hasBounds ? sphere.radius.toFixed(0) : 'N/A',
        });
      }
      
      // Теперь для рендеринга используем матрицы от MapLibre
      const modelAltitude = modelCenter.height;
      const modelMatrix = transform.getMatrixForModel(modelOrigin, modelAltitude);

      // Главная матрица проекции от MapLibre
      const projMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as number[]);
      
      // Модельная матрица - преобразует из ENU в clip space
      const modelMat = new THREE.Matrix4().fromArray(modelMatrix as number[]);
      
      // ECEF->ENU трансформация для группы тайлов
      // Это переведёт модели из ECEF (миллионы метров) в локальные координаты (метры от центра модели)
      const ecefToEnuMatrix = createECEFtoLocalMatrix(modelCenter.longitude, modelCenter.latitude, modelCenter.height);
      
      // Применяем ECEF->ENU к группе (фиксированная трансформация)
      tilesRenderer.group.matrix.copy(ecefToEnuMatrix);
      tilesRenderer.group.matrixAutoUpdate = false;
      tilesRenderer.group.updateMatrixWorld(true);
      
      // Отладка: проверяем world position мешей после трансформации
      if (renderCount === 200 || renderCount === 500) {
        const worldPositions: string[] = [];
        tilesRenderer.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh && worldPositions.length < 3) {
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            worldPositions.push(`(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
          }
        });
        console.log('🌍 World positions after ECEF->ENU:', worldPositions);
      }
      
      // Правильный подход для интеграции с MapLibre:
      // projectionMatrix = MapLibre projMatrix (включает и view и projection)
      // viewMatrix камеры = identity (камера в origin)  
      // modelMatrix объектов = modelMat * ecefToEnu (трансформирует ECEF -> MapLibre world)
      
      // Комбинированная модельная матрица: modelMat * ecefToEnu
      const combinedModelMatrix = new THREE.Matrix4();
      combinedModelMatrix.copy(ecefToEnuMatrix); // ECEF -> ENU
      combinedModelMatrix.premultiply(modelMat); // ENU -> MapLibre world
      
      // Применяем модельную матрицу к world группе
      world.matrix.copy(combinedModelMatrix);
      world.matrixAutoUpdate = false;
      world.updateMatrixWorld(true);
      
      // Камера с MapLibre projection (projMatrix уже включает view*projection для globe)
      camera.projectionMatrix.copy(projMatrix);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      
      // View matrix = identity (камера в origin, смотрит по -Z)
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      camera.matrixAutoUpdate = false;
      camera.matrix.identity();
      camera.matrixWorldInverse.identity();
      camera.updateMatrixWorld(true);
      
      // Debug mode toggle - переключить на true для отладки
      const useDebugCamera = false;
      if (useDebugCamera) {
        // Отладочный режим: собственная камера над сценой (для проверки что модели загружены)
        world.matrix.copy(ecefToEnuMatrix); // Только ECEF->ENU
        world.updateMatrixWorld(true);
        
        const debugCam = camera as THREE.PerspectiveCamera;
        debugCam.position.set(0, -500, 300);
        debugCam.lookAt(0, 0, 0);
        debugCam.fov = 60;
        debugCam.near = 1;
        debugCam.far = 10000;
        debugCam.matrixAutoUpdate = true;
        debugCam.updateProjectionMatrix();
        debugCam.updateMatrixWorld(true);
      }

      // 🔴 ДИАГНОСТИКА прямо перед рендером
      if (renderCount === 100 || renderCount === 300) {
        let totalMeshes = 0;
        let visibleMeshes = 0;
        const meshDetails: string[] = [];
        
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            totalMeshes++;
            if (obj.visible) visibleMeshes++;
            if (meshDetails.length < 5) {
              const worldPos = new THREE.Vector3();
              obj.getWorldPosition(worldPos);
              meshDetails.push(`visible=${obj.visible}, pos=(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
            }
          }
        });
        
        console.log(`🔴 PRE-RENDER #${renderCount}:`, {
          totalMeshes,
          visibleMeshes,
          sceneVisible: scene.visible,
          worldVisible: world.visible,
          tilesGroupVisible: tilesRenderer.group.visible,
          meshDetails,
        });
      }
      
      // Рендерим
      renderer.resetState();
      renderer.render(scene, camera);
      
      // 🔴 Проверяем render info - сколько реально отрендерено
      if (renderCount === 100 || renderCount === 300) {
        const info = renderer.info;
        console.log(`🎨 RENDER INFO #${renderCount}:`, {
          calls: info.render.calls,
          triangles: info.render.triangles,
          points: info.render.points,
          lines: info.render.lines,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        });
      }
      
      // Отладка: проверяем что рендерится
      if (renderCount === 200) {
        console.log('🎨 Render debug:', {
          sceneChildren: scene.children.length,
          worldChildren: world.children.length,
          tilesGroupChildren: tilesRenderer.group.children.length,
          cameraPosition: `${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)}`,
          useDebugCamera,
        });
        
        // Проверяем clip-space координаты центра модели
        // Центр модели в ECEF -> через все матрицы -> должен быть в clip space [-1,1]
        const modelCenterECEF = new THREE.Vector4(modelX, modelY, modelZ, 1);
        const clipPos = modelCenterECEF.clone().applyMatrix4(ecefToEnuMatrix).applyMatrix4(modelMat).applyMatrix4(projMatrix);
        const ndc = new THREE.Vector3(clipPos.x / clipPos.w, clipPos.y / clipPos.w, clipPos.z / clipPos.w);
        
        console.log('📐 Clip space debug:', {
          modelCenterECEF: `(${modelX.toFixed(0)}, ${modelY.toFixed(0)}, ${modelZ.toFixed(0)})`,
          clipPos: `(${clipPos.x.toFixed(6)}, ${clipPos.y.toFixed(6)}, ${clipPos.z.toFixed(6)}, w=${clipPos.w.toFixed(6)})`,
          ndc: `(${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)}, ${ndc.z.toFixed(3)})`,
          inView: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z >= -1 && ndc.z <= 1,
        });
      }
      
      // Запрашиваем следующий кадр для анимации/обновления тайлов
      map.triggerRepaint();
    },

    onRemove() {
      tilesRenderer?.dispose();
      tilesRenderer = null;
    },
  };
}

/**
 * MapLibre Viewer с Globe проекцией и 3D Tiles
 */
export default function MapLibreViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const tilesLayerRef = useRef<CustomLayerInterface | null>(null);

  // Подавление известных предупреждений Globe
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      const msg = args[0]?.toString() || '';
      if (msg.includes('calculateFogMatrix') || msg.includes('terrain is not fully supported')) {
        return;
      }
      originalWarn.apply(console, args);
    };
    return () => { console.warn = originalWarn; };
  }, []);

  // Состояние
  const [currentModel, setCurrentModel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('geostack_model');
      if (saved && AVAILABLE_MODELS.some(m => m.url === saved)) return saved;
    }
    return AVAILABLE_MODELS[0]?.url || '';
  });

  const [currentBasemap, setCurrentBasemap] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('geostack_basemap');
      if (saved && AVAILABLE_BASEMAPS.some(b => b.id === saved)) return saved;
    }
    return 'local_ortho';
  });

  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Инициализация...');
  const [error, setError] = useState<string | null>(null);

  const [terrainEnabled, setTerrainEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('geostack_terrain') === 'true';
    }
    return false;
  });

  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [isInfoPanelVisible, setIsInfoPanelVisible] = useState(false);

  // Сохранение настроек
  useEffect(() => {
    if (currentModel) localStorage.setItem('geostack_model', currentModel);
  }, [currentModel]);

  useEffect(() => {
    if (currentBasemap) localStorage.setItem('geostack_basemap', currentBasemap);
  }, [currentBasemap]);

  useEffect(() => {
    localStorage.setItem('geostack_terrain', String(terrainEnabled));
  }, [terrainEnabled]);

  const currentModelInfo = useMemo(
    () => AVAILABLE_MODELS.find(m => m.url === currentModel),
    [currentModel]
  );

  const flyToModel = useCallback(() => {
    if (!mapRef.current || !currentModelInfo?.center) return;
    mapRef.current.flyTo({
      center: [currentModelInfo.center.longitude, currentModelInfo.center.latitude],
      zoom: 16,
      pitch: 60,
      bearing: 0,
      duration: 2000,
    });
  }, [currentModelInfo]);

  const handleTerrainToggle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newEnabled = !terrainEnabled;
    setTerrainEnabled(newEnabled);

    if (newEnabled) {
      if (!map.getSource('terrain')) {
        map.addSource('terrain', {
          type: 'raster-dem',
          tiles: [`${window.location.origin}/terrain/{z}/{x}/{y}.png`],
          tileSize: 256,
          minzoom: 5,
          maxzoom: 15,
          encoding: 'terrarium',
        });
      }
      map.setTerrain({ source: 'terrain', exaggeration: 1.0 });
    } else {
      map.setTerrain(null);
    }
  }, [terrainEnabled]);

  const handleBasemapChange = useCallback((basemapId: string) => {
    setCurrentBasemap(basemapId);
    const map = mapRef.current;
    if (!map) return;

    const basemap = AVAILABLE_BASEMAPS.find(b => b.id === basemapId);
    if (!basemap) return;

    // Удаляем существующие слои
    const style = map.getStyle();
    if (style?.layers) {
      style.layers.forEach(layer => {
        if (layer.id.startsWith('basemap-') || layer.id.startsWith('ortho-')) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        }
      });
    }
    if (style?.sources) {
      Object.keys(style.sources).forEach(sourceId => {
        if (sourceId.startsWith('basemap-') || sourceId.startsWith('ortho-')) {
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        }
      });
    }

    const beforeLayerId = tilesLayerRef.current?.id;

    if (basemap.type === 'local_ortho') {
      LOCAL_ORTHOPHOTOS.forEach((ortho) => {
        const sourceId = `ortho-${ortho.id}`;
        const layerId = `ortho-layer-${ortho.id}`;

        map.addSource(sourceId, {
          type: 'raster',
          tiles: [ortho.url],
          bounds: ortho.bounds,
          tileSize: 256,
          minzoom: ortho.minZoom || 0,
          maxzoom: ortho.maxZoom || 22,
        });

        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': 1 },
        }, beforeLayerId);
      });
    } else if (basemap.url) {
      const sourceId = `basemap-${basemap.id}`;

      map.addSource(sourceId, {
        type: 'raster',
        tiles: [basemap.url],
        tileSize: 256,
        maxzoom: 19,
      });

      map.addLayer({
        id: `basemap-layer-${basemap.id}`,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': 1 },
      }, beforeLayerId);
    }
  }, []);

  const handleModelChange = useCallback((modelUrl: string) => {
    setCurrentModel(modelUrl);
    const map = mapRef.current;
    if (!map) return;

    const model = AVAILABLE_MODELS.find(m => m.url === modelUrl);
    if (!model?.center) return;

    // Удаляем старый слой
    if (tilesLayerRef.current && map.getLayer(tilesLayerRef.current.id)) {
      map.removeLayer(tilesLayerRef.current.id);
      tilesLayerRef.current = null;
    }

    setIsLoading(true);
    setLoadingMessage(`Загрузка модели: ${model.name}...`);

    const newLayer = create3DTilesLayer(
      `3d-tiles-${model.id}`,
      model.url,
      { ...model.center },
      model.heightOffset ?? 0,
      () => {
        setIsLoading(false);
        map.flyTo({
          center: [model.center!.longitude, model.center!.latitude],
          zoom: 17,
          pitch: 60,
          duration: 2000,
        });
      },
      (err) => {
        console.error('Model error:', err);
        setError(`Ошибка загрузки: ${err.message}`);
        setIsLoading(false);
      }
    );

    tilesLayerRef.current = newLayer;
    map.addLayer(newLayer);
  }, []);

  // Инициализация карты
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setLoadingMessage('Инициализация MapLibre Globe...');

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#1a3a5c' },
          },
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sky: {
          'sky-color': '#199EF3',
          'sky-horizon-blend': 0.5,
          'horizon-color': '#ffffff',
          'horizon-fog-blend': 0.5,
          'fog-color': '#0000ff',
          'fog-ground-blend': 0.5,
        },
      },
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      pitch: DEFAULT_VIEW.pitch,
      bearing: DEFAULT_VIEW.bearing,
      maxPitch: 85,
    });

    mapRef.current = map;

    map.on('load', () => {
      console.log('🗺️ MapLibre loaded');
      
      // Terrain source
      map.addSource('terrain', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
      });

      if (terrainEnabled) {
        map.setTerrain({ source: 'terrain', exaggeration: 1.0 });
      }

      handleBasemapChange(currentBasemap);

      // Загружаем 3D модель
      const model = AVAILABLE_MODELS.find(m => m.url === currentModel);
      console.log('🏗️ Loading model:', model);
      if (model?.center) {
        setLoadingMessage(`Загрузка модели: ${model.name}...`);

        const tilesLayer = create3DTilesLayer(
          `3d-tiles-${model.id}`,
          model.url,
          { ...model.center },
          model.heightOffset ?? 0,
          () => {
            console.log('✅ Model loaded successfully');
            setIsLoading(false);
            setTimeout(() => {
              map.flyTo({
                center: [model.center!.longitude, model.center!.latitude],
                zoom: 15,
                pitch: 50,
                duration: 3000,
              });
            }, 500);
          },
          (err) => {
            console.error('❌ Model error:', err);
            setError(`Ошибка загрузки: ${err.message}`);
            setIsLoading(false);
          }
        );

        tilesLayerRef.current = tilesLayer;
        console.log('📍 Adding 3D tiles layer to map');
        map.addLayer(tilesLayer);
      } else {
        console.log('⚠️ No model center found');
        setIsLoading(false);
      }
    });

    map.on('click', (e) => {
      setSelectedCoordinates({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      setSelectedTileId(null);
      setIsInfoPanelVisible(true);
    });

    map.on('error', (e) => {
      if (!e.error?.message?.includes('404')) {
        setError(`Ошибка карты: ${e.error?.message || 'Неизвестная ошибка'}`);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloseInfoPanel = useCallback(() => {
    setIsInfoPanelVisible(false);
    setSelectedCoordinates(null);
    setSelectedTileId(null);
  }, []);

  return (
    <div className="viewer-wrapper">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>{loadingMessage}</p>
        </div>
      )}

      {error && (
        <div className="error-overlay">
          <p>❌ {error}</p>
          <button onClick={() => setError(null)}>Закрыть</button>
        </div>
      )}

      <Toolbar
        models={AVAILABLE_MODELS}
        currentModel={currentModel}
        onModelChange={handleModelChange}
        basemaps={AVAILABLE_BASEMAPS}
        currentBasemap={currentBasemap}
        onBasemapChange={handleBasemapChange}
        onResetView={flyToModel}
        isLoading={isLoading}
        terrainEnabled={terrainEnabled}
        onTerrainToggle={handleTerrainToggle}
      />

      {isInfoPanelVisible && selectedCoordinates && (
        <InfoPanel
          coordinates={selectedCoordinates}
          tileId={selectedTileId}
          onClose={handleCloseInfoPanel}
          isVisible={isInfoPanelVisible}
        />
      )}

      <div ref={containerRef} className="map-container" />

      <div className="info-banner">
        🌍 MapLibre Globe {terrainEnabled ? '• 3D Terrain' : ''} {currentModelInfo ? `• ${currentModelInfo.name}` : ''}
      </div>
    </div>
  );
}
