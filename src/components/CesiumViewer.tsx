'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { initCesium, AVAILABLE_MODELS, AVAILABLE_BASEMAPS } from '@/lib/cesium-config';
import { createImageryProvider } from '@/lib/imagery-providers';
import { TILESET_DEFAULTS, CAMERA_DEFAULTS, TIMING, RENDERING_DEFAULTS } from '@/lib/constants';
import type { FlyToOptions } from '@/lib/types';
import Toolbar from './Toolbar';
import InfoPanel from './InfoPanel';

// Хук для управления ресайзом с дебаунсом
function useResizeObserver(
  containerRef: React.RefObject<HTMLDivElement | null>,
  callback: () => void,
  delay: number = TIMING.RESIZE_DEBOUNCE
) {
  useEffect(() => {
    if (!containerRef.current) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(callback, delay);
    });

    observer.observe(containerRef.current);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [containerRef, callback, delay]);
}

export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const imageryLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const selectedMarkerRef = useRef<Cesium.Entity | null>(null);

  const [currentModel, setCurrentModel] = useState(AVAILABLE_MODELS[0]?.url || '');
  const [currentBasemap, setCurrentBasemap] = useState('arcgis'); // ArcGIS как дефолт - более надёжный
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Инициализация...');
  const [error, setError] = useState<string | null>(null);
  
  // Состояние для информации о выбранном здании
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [isInfoPanelVisible, setIsInfoPanelVisible] = useState(false);

  // Функция для перелёта к тайлсету
  const flyToTileset = useCallback((tileset: Cesium.Cesium3DTileset, options: FlyToOptions = {}) => {
    if (!viewerRef.current) return;

    const {
      duration = CAMERA_DEFAULTS.FLY_TO_DURATION,
      range = tileset.boundingSphere.radius * CAMERA_DEFAULTS.ZOOM_RADIUS_MULTIPLIER,
    } = options;

    // Получаем центр модели
    const center = tileset.boundingSphere.center;
    const cartographic = Cesium.Cartographic.fromCartesian(center);
    
    // Летим точно над центром модели
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        cartographic.height + range
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90), // Смотрим прямо вниз
        roll: 0,
      },
      duration,
    });
  }, []);

  // Функция для отображения маркера выбранного здания
  const showSelectionMarker = useCallback((lat: number, lon: number, height: number = 0) => {
    if (!viewerRef.current) return;

    // Удаляем предыдущий маркер
    if (selectedMarkerRef.current) {
      viewerRef.current.entities.remove(selectedMarkerRef.current);
    }

    // Создаём новый маркер - пульсирующий круг + вертикальная линия
    selectedMarkerRef.current = viewerRef.current.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      // Круг на земле
      ellipse: {
        semiMinorAxis: 15,
        semiMajorAxis: 15,
        height: height,
        material: Cesium.Color.CYAN.withAlpha(0.4),
        outline: true,
        outlineColor: Cesium.Color.CYAN,
        outlineWidth: 3,
      },
      // Вертикальная линия
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          lon, lat, height,
          lon, lat, height + 100
        ]),
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Cesium.Color.CYAN
        }),
      },
      // Точка сверху
      point: {
        pixelSize: 12,
        color: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY, // Всегда видно
      },
    });

    viewerRef.current.scene.requestRender();
  }, []);

  // Удаление маркера
  const removeSelectionMarker = useCallback(() => {
    if (viewerRef.current && selectedMarkerRef.current) {
      viewerRef.current.entities.remove(selectedMarkerRef.current);
      selectedMarkerRef.current = null;
      viewerRef.current.scene.requestRender();
    }
  }, []);

  // Обработка ресайза
  const handleResize = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.resize();
    }
  }, []);

  useResizeObserver(containerRef, handleResize);

  // Инициализация viewer
  useEffect(() => {
    if (!containerRef.current) return;

    initCesium();

    const viewer = new Cesium.Viewer(containerRef.current, {
      terrainProvider: undefined,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      // @ts-ignore - отключаем базовую подложку
      baseLayer: false,
      // Оптимизации производительности
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      targetFrameRate: 60,
      useBrowserRecommendedResolution: true,
      msaaSamples: RENDERING_DEFAULTS.MSAA_SAMPLES,
    });

    // Настройка камеры
    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableRotate = true;
    controller.enableTranslate = false; // Отключаем смещение камеры, чтобы глобус был по центру
    controller.enableZoom = true;
    controller.enableTilt = true; // Наклон камеры
    controller.enableLook = false;
    controller.minimumZoomDistance = CAMERA_DEFAULTS.MIN_ZOOM_DISTANCE;
    controller.maximumZoomDistance = CAMERA_DEFAULTS.MAX_ZOOM_DISTANCE;
    
    // Настраиваем управление наклоном: средняя кнопка или Ctrl+ПКМ
    controller.tiltEventTypes = [
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.PINCH,
      {
        eventType: Cesium.CameraEventType.RIGHT_DRAG,
        modifier: Cesium.KeyboardEventModifier.CTRL,
      },
    ];

    // Оптимизации сцены
    const scene = viewer.scene;
    scene.fog.enabled = true;
    scene.fog.density = 0.0001;
    scene.globe.enableLighting = false;
    scene.globe.depthTestAgainstTerrain = true;
    
    // Устанавливаем начальную позицию камеры
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(47.17, 55.77, 15000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90), // Смотрим прямо вниз
        roll: 0,
      },
    });
    
    // FXAA для сглаживания
    if (scene.postProcessStages?.fxaa) {
      scene.postProcessStages.fxaa.enabled = RENDERING_DEFAULTS.FXAA_ENABLED;
    }

    // Обработка событий для request render mode
    scene.requestRender();

    viewerRef.current = viewer;
    setIsLoading(false);

    // Обработчик клика по зданиям
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const pickedObject = scene.pick(movement.position);
      
      if (Cesium.defined(pickedObject)) {
        // Проверяем, что это 3D Tile
        const content = pickedObject.content;
        
        // Получаем URL тайла для идентификации
        let tileUrl = '';
        
        if (content) {
          tileUrl = content.url || content._url || '';
          
          if (!tileUrl && content.tile) {
            const contentUri = content.tile._contentResource?.url;
            if (contentUri) tileUrl = contentUri;
          }
        }
        
        console.log('Clicked tile URL:', tileUrl);
        
        // Получаем мировые координаты точки клика
        const cartesian = scene.pickPosition(movement.position);
        
        if (Cesium.defined(cartesian)) {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          const height = cartographic.height;
          
          console.log('Clicked coordinates:', lat, lon);
          
          // Показываем маркер выбранного здания
          showSelectionMarker(lat, lon, height);
          
          // Устанавливаем координаты для загрузки данных
          setSelectedCoordinates({ lat, lon });
          setSelectedTileId(tileUrl || null);
          setIsInfoPanelVisible(true);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Обработчик наведения для изменения курсора
    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const pickedObject = scene.pick(movement.endPosition);
      const container = viewer.container as HTMLElement;
      
      if (Cesium.defined(pickedObject) && (pickedObject.content || pickedObject.primitive)) {
        // Меняем курсор при наведении на здание
        container.style.cursor = 'pointer';
      } else {
        container.style.cursor = 'default';
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
      viewer.destroy();
    };
  }, [showSelectionMarker]);

  // Загрузка подложки
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const basemapConfig = AVAILABLE_BASEMAPS.find(b => b.id === currentBasemap);
    if (!basemapConfig) return;

    let cancelled = false;

    const loadBasemap = async () => {
      // Удаляем предыдущую подложку
      if (imageryLayerRef.current && !viewer.isDestroyed()) {
        viewer.imageryLayers.remove(imageryLayerRef.current);
        imageryLayerRef.current = null;
      }

      try {
        const provider = await createImageryProvider(basemapConfig);
        
        // Проверяем, что компонент не размонтирован и viewer не уничтожен
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;
        
        if (provider) {
          imageryLayerRef.current = viewerRef.current.imageryLayers.addImageryProvider(provider);
          viewerRef.current.scene.requestRender();
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading basemap:', err);
        setError(`Ошибка загрузки подложки: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      }
    };

    loadBasemap();

    return () => {
      cancelled = true;
    };
  }, [currentBasemap]);

  // Загрузка рельефа
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    let cancelled = false;

    const loadTerrain = async () => {
      try {
        const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
        
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;
        
        viewerRef.current.terrainProvider = terrain;
        viewerRef.current.scene.requestRender();
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading terrain:', err);
        // Рельеф не критичен, просто логируем
      }
    };

    loadTerrain();

    return () => {
      cancelled = true;
    };
  }, []);

  // Загрузка 3D модели с оптимизациями
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !currentModel) return;

    let cancelled = false;

    const loadTileset = async () => {
      setIsLoading(true);
      setLoadingMessage('Загрузка 3D модели...');
      setError(null);

      // Удаляем предыдущий тайлсет
      if (tilesetRef.current && viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.primitives.remove(tilesetRef.current);
        tilesetRef.current = null;
      }

      try {
        const tilesetOptions = {
          maximumScreenSpaceError: TILESET_DEFAULTS.MAXIMUM_SCREEN_SPACE_ERROR,
          cullWithChildrenBounds: true,
          dynamicScreenSpaceError: TILESET_DEFAULTS.DYNAMIC_SCREEN_SPACE_ERROR,
          dynamicScreenSpaceErrorDensity: TILESET_DEFAULTS.DYNAMIC_SCREEN_SPACE_ERROR_DENSITY,
          dynamicScreenSpaceErrorFactor: TILESET_DEFAULTS.DYNAMIC_SCREEN_SPACE_ERROR_FACTOR,
          skipLevelOfDetail: TILESET_DEFAULTS.SKIP_LEVEL_OF_DETAIL,
          preferLeaves: TILESET_DEFAULTS.PREFER_LEAVES,
          // Увеличиваем кэш для предотвращения предупреждений о памяти
          cacheBytes: TILESET_DEFAULTS.CACHE_BYTES,
          maximumCacheOverflowBytes: TILESET_DEFAULTS.MAX_CACHE_OVERFLOW_BYTES,
        };

        const tileset = await Cesium.Cesium3DTileset.fromUrl(currentModel, tilesetOptions);

        // Проверяем, что компонент не размонтирован
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) {
          tileset.destroy();
          return;
        }

        viewerRef.current.scene.primitives.add(tileset);
        tilesetRef.current = tileset;

        // Подписываемся на события загрузки тайлов
        const removeLoadProgress = tileset.loadProgress.addEventListener((numberOfPendingRequests, numberOfTilesProcessing) => {
          if (numberOfPendingRequests > 0 || numberOfTilesProcessing > 0) {
            setLoadingMessage(`Загрузка тайлов: ${numberOfPendingRequests} в очереди, ${numberOfTilesProcessing} обрабатывается`);
          }
        });

        // Логируем информацию о модели
        const boundingSphere = tileset.boundingSphere;
        const cartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
        
        console.log('Tileset loaded:', currentModel);
        console.log('Center (lon, lat, h):', 
          Cesium.Math.toDegrees(cartographic.longitude).toFixed(4),
          Cesium.Math.toDegrees(cartographic.latitude).toFixed(4),
          cartographic.height.toFixed(1)
        );
        console.log('Bounding sphere radius:', boundingSphere.radius.toFixed(1));

        // Перелёт к модели
        flyToTileset(tileset);

        // Убираем обработчик при размонтировании
        return () => {
          removeLoadProgress();
        };
        
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') {
          return; // Загрузка была отменена
        }
        console.error('Error loading tileset:', err);
        setError(`Ошибка загрузки модели: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      } finally {
        if (!cancelled) {
          // Небольшая задержка перед скрытием индикатора
          setTimeout(() => {
            setIsLoading(false);
            setLoadingMessage('');
          }, TIMING.LOADING_HIDE_DELAY);
        }
      }
    };

    loadTileset();

    return () => {
      cancelled = true;
    };
  }, [currentModel, flyToTileset]);

  // Сброс вида
  const handleResetView = useCallback(() => {
    if (viewerRef.current && tilesetRef.current) {
      flyToTileset(tilesetRef.current);
    }
  }, [flyToTileset]);

  // Очистка ошибки
  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  // Закрытие панели информации
  const handleCloseInfoPanel = useCallback(() => {
    setIsInfoPanelVisible(false);
    setSelectedCoordinates(null);
    setSelectedTileId(null);
    removeSelectionMarker();
  }, [removeSelectionMarker]);

  return (
    <>
      <div ref={containerRef} className="cesium-container" />
      <Toolbar
        models={AVAILABLE_MODELS}
        currentModel={currentModel}
        onModelChange={setCurrentModel}
        basemaps={AVAILABLE_BASEMAPS}
        currentBasemap={currentBasemap}
        onBasemapChange={setCurrentBasemap}
        onResetView={handleResetView}
        isLoading={isLoading}
      />
      {isLoading && (
        <div className="loading">
          <div className="loading-spinner" />
          <span>{loadingMessage || 'Загрузка...'}</span>
        </div>
      )}
      {error && (
        <div className="error-toast" onClick={handleDismissError}>
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button className="error-close">×</button>
        </div>
      )}
      <InfoPanel
        coordinates={selectedCoordinates}
        tileId={selectedTileId}
        isVisible={isInfoPanelVisible}
        onClose={handleCloseInfoPanel}
      />
    </>
  );
}
