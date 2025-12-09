'use client';

import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AVAILABLE_BASEMAPS, AVAILABLE_MODELS, initCesium } from '@/lib/config/cesium-config';
import type { FlyToOptions } from '@/lib/types';
import { CAMERA_DEFAULTS, RENDERING_DEFAULTS, TILESET_DEFAULTS, TIMING } from '@/lib/utils/constants';
import { createImageryProvider } from '@/lib/utils/imagery-providers';
import InfoPanel from './InfoPanel';
import Toolbar from './Toolbar';

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
  const imageryLayersRef = useRef<Cesium.ImageryLayer[]>([]);
  const selectedMarkerRef = useRef<Cesium.Entity | null>(null);

  // Загружаем сохранённые настройки из localStorage
  const [currentModel, setCurrentModel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('geostack_model');
      if (saved && AVAILABLE_MODELS.some(m => m.url === saved)) {
        return saved;
      }
    }
    return AVAILABLE_MODELS[0]?.url || '';
  });
  
  const [currentBasemap, setCurrentBasemap] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('geostack_basemap');
      if (saved && AVAILABLE_BASEMAPS.some(b => b.id === saved)) {
        return saved;
      }
    }
    return 'local_ortho'; // Локальные ортофото как дефолт
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Инициализация...');
  const [error, setError] = useState<string | null>(null);
  
  // Состояние для информации о выбранном здании
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [isInfoPanelVisible, setIsInfoPanelVisible] = useState(false);

  // Сохраняем настройки в localStorage при изменении
  useEffect(() => {
    if (currentModel) {
      localStorage.setItem('geostack_model', currentModel);
    }
  }, [currentModel]);

  useEffect(() => {
    if (currentBasemap) {
      localStorage.setItem('geostack_basemap', currentBasemap);
    }
  }, [currentBasemap]);

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

    // Ждём пока контейнер получит размеры
    const container = containerRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      // Контейнер ещё не имеет размеров, ждём
      const checkSize = setInterval(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          clearInterval(checkSize);
          // Перезапускаем эффект
          setIsLoading(true);
        }
      }, 50);
      return () => clearInterval(checkSize);
    }

    initCesium();

    // Создаём скрытый контейнер для кредитов
    const creditContainer = document.createElement('div');
    creditContainer.style.display = 'none';

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
      // Скрываем панель атрибуции
      creditContainer,
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
      // Удаляем предыдущие слои подложки
      if (imageryLayersRef.current.length > 0 && !viewer.isDestroyed()) {
        imageryLayersRef.current.forEach(layer => {
          viewer.imageryLayers.remove(layer);
        });
        imageryLayersRef.current = [];
      }

      try {
        const providers = await createImageryProvider(basemapConfig);
        
        // Проверяем, что компонент не размонтирован и viewer не уничтожен
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;
        
        if (providers) {
          // Если это массив провайдеров (multi_ortho)
          if (Array.isArray(providers)) {
            providers.forEach(provider => {
              const layer = viewerRef.current!.imageryLayers.addImageryProvider(provider);
              imageryLayersRef.current.push(layer);
            });
          } else {
            // Одиночный провайдер
            const layer = viewerRef.current.imageryLayers.addImageryProvider(providers);
            imageryLayersRef.current.push(layer);
          }
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

  // Загрузка Cesium World Terrain
  // ВРЕМЕННО ОТКЛЮЧЕНО для диагностики - модели используют абсолютные высоты
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Отключаем terrain для тестирования - используем эллипсоид
    // Это поможет понять, проблема в terrain или в самих моделях
    const USE_TERRAIN = false; // Переключите на true для включения рельефа
    
    if (!USE_TERRAIN) {
      console.log('🌍 Using Ellipsoid terrain (no elevation)');
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      viewer.scene.requestRender();
      return;
    }

    let cancelled = false;

    const loadTerrain = async () => {
      try {
        const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
        
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;
        
        viewerRef.current.terrainProvider = terrain;
        viewerRef.current.scene.requestRender();
        console.log('Cesium World Terrain loaded');
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading terrain:', err);
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
          // Дополнительные оптимизации для быстрой загрузки
          baseScreenSpaceError: TILESET_DEFAULTS.BASE_SCREEN_SPACE_ERROR,
          skipScreenSpaceErrorFactor: TILESET_DEFAULTS.SKIP_SCREEN_SPACE_ERROR_FACTOR,
          skipLevels: TILESET_DEFAULTS.SKIP_LEVELS,
          immediatelyLoadDesiredLevelOfDetail: TILESET_DEFAULTS.IMMEDIATE_LOAD,
          loadSiblings: false,  // Не загружать соседние тайлы - экономит запросы
          foveatedScreenSpaceError: true,  // Приоритет центру экрана
          foveatedConeSize: 0.3,  // Узкий конус для фокуса
          foveatedMinimumScreenSpaceErrorRelaxation: 0.0,
          progressiveResolutionHeightFraction: 0.5, // Показывать тайлы раньше
        };

        const tileset = await Cesium.Cesium3DTileset.fromUrl(currentModel, tilesetOptions);

        // Проверяем, что компонент не размонтирован
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) {
          tileset.destroy();
          return;
        }

        // Получаем bounding sphere и cartographic для использования далее
        const boundingSphere = tileset.boundingSphere;
        const cartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);

        // Отладка: информация о модели
        console.log('=== TILESET DEBUG INFO ===');
        console.log('Bounding sphere center (ECEF):', boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
        console.log('Bounding sphere radius:', boundingSphere.radius);
        console.log('Center height (ellipsoidal):', cartographic.height);
        
        // Проверяем текущий terrain и его высоту в точке модели
        const terrainProvider = viewerRef.current.terrainProvider;
        if (terrainProvider && !(terrainProvider instanceof Cesium.EllipsoidTerrainProvider)) {
          try {
            const positions = await Cesium.sampleTerrainMostDetailed(terrainProvider, [
              Cesium.Cartographic.clone(cartographic)
            ]);
            console.log('Terrain height at model center:', positions[0].height);
            console.log('Model height above terrain:', cartographic.height - positions[0].height);
          } catch (e) {
            console.log('Could not sample terrain:', e);
          }
        } else {
          console.log('No terrain provider or using ellipsoid');
        }

        viewerRef.current.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
        
        // Дополнительная отладка после добавления в сцену
        console.log('Tileset added to scene. Ready:', tileset.ready);
        console.log('Tileset show:', tileset.show);
        console.log('Tileset asset version:', tileset.asset?.version);
        console.log('=== END DEBUG INFO ===');

        // Подписываемся на события загрузки тайлов
        const removeLoadProgress = tileset.loadProgress.addEventListener((numberOfPendingRequests, numberOfTilesProcessing) => {
          if (numberOfPendingRequests > 0 || numberOfTilesProcessing > 0) {
            setLoadingMessage(`Загрузка тайлов: ${numberOfPendingRequests} в очереди, ${numberOfTilesProcessing} обрабатывается`);
          }
        });
        
        // Подписываемся на ошибки загрузки тайлов
        const removeTileFailed = tileset.tileFailed.addEventListener((error: { url?: string; message?: string }) => {
          console.error('❌ Tile failed to load:', error.url, error.message);
        });
        
        // Подписываемся на успешную загрузку тайлов
        const removeTileLoad = tileset.tileLoad.addEventListener((tile: Cesium.Cesium3DTile) => {
          console.log('✅ Tile loaded:', tile.contentReady ? 'content ready' : 'loading');
        });

        // Логируем информацию о модели (используем уже объявленные переменные)
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
