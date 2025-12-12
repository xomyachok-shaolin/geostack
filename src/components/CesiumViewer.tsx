'use client';

import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AVAILABLE_BASEMAPS, AVAILABLE_MODELS, initCesium } from '@/lib/config/cesium-config';
import type { FlyToOptions } from '@/lib/types';
import { CAMERA_DEFAULTS, RENDERING_DEFAULTS, TILESET_DEFAULTS, TIMING, LIMITS } from '@/lib/utils/constants';
import { createImageryProvider } from '@/lib/utils/imagery-providers';
import InfoPanel from './InfoPanel';
import Toolbar from './Toolbar';

// КРИТИЧНО: Исправляем старые URL в localStorage ДО инициализации компонента
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('geostack_model');
  if (saved && saved.startsWith('/models/') && !saved.startsWith('/api/')) {
    const correctedUrl = saved.replace('/models/', '/api/models/');
    console.log('🔧 Fixing old URL in localStorage:', saved, '->', correctedUrl);
    localStorage.setItem('geostack_model', correctedUrl);
  }
}

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
  const initialFlyDoneRef = useRef<boolean>(false);
  const currentModelRef = useRef<string>('');
  const tilesetErrorCacheRef = useRef<Record<string, number>>({});
  const tilesetBaseCacheRef = useRef<Record<string, number | null>>({});

  // Загружаем сохранённые настройки из localStorage
  const [currentModel, setCurrentModel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('geostack_model');
      
      // Проверяем что сохраненный URL валиден
      if (saved && AVAILABLE_MODELS.some(m => m.url === saved)) {
        return saved;
      }
      
      // Если ничего не подошло, очищаем и используем первую модель
      if (saved) {
        localStorage.removeItem('geostack_model');
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

  // Сохраняем настройки в localStorage при изменении (только один раз)
  const savedModelRef = useRef(currentModel);
  useEffect(() => {
    if (currentModel && currentModel !== savedModelRef.current) {
      savedModelRef.current = currentModel;
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
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      viewerRef.current.resize();
    }
  }, []);

  useResizeObserver(containerRef, handleResize);

  // Инициализация viewer
  useEffect(() => {
    if (!containerRef.current) return;

    initCesium();

    // Создаём скрытый контейнер для кредитов
    const creditContainer = document.createElement('div');
    creditContainer.style.display = 'none';

    const viewer = new Cesium.Viewer(containerRef.current, {
      // ВАЖНО: используем EllipsoidTerrainProvider чтобы НЕ грузить Cesium Ion
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
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
      // Дополнительные оптимизации
      orderIndependentTranslucency: false, // Отключаем для производительности
      contextOptions: {
        webgl: {
          alpha: false, // Непрозрачный фон быстрее
          powerPreference: 'high-performance',
        },
      },
    });

    // Рельеф уже установлен (EllipsoidTerrainProvider) - плоская земля без запросов к Ion
    console.log('ℹ️ Используется плоский эллипсоид (без рельефа)');

    // Настройка камеры с оптимизациями
    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableRotate = true;
    controller.enableTranslate = false;
    controller.enableZoom = true;
    controller.enableTilt = true;
    controller.enableLook = false;
    controller.minimumZoomDistance = CAMERA_DEFAULTS.MIN_ZOOM_DISTANCE;
    controller.maximumZoomDistance = CAMERA_DEFAULTS.MAX_ZOOM_DISTANCE;
    controller.inertiaZoom = 0.9; // Плавное зумирование
    controller.inertiaSpin = 0.9; // Плавное вращение
    
    // Настраиваем управление наклоном: средняя кнопка или Ctrl+ПКМ
    controller.tiltEventTypes = [
      Cesium.CameraEventType.MIDDLE_DRAG,
      Cesium.CameraEventType.PINCH,
      {
        eventType: Cesium.CameraEventType.RIGHT_DRAG,
        modifier: Cesium.KeyboardEventModifier.CTRL,
      },
    ];

    // Оптимизации сцены для максимальной производительности
    const scene = viewer.scene;
    scene.fog.enabled = false; // Отключаем туман для производительности
    scene.globe.enableLighting = false;
    scene.globe.depthTestAgainstTerrain = false; // Включим позже при загрузке terrain
    scene.globe.tileCacheSize = 1000; // Увеличиваем кэш тайлов
    scene.logarithmicDepthBuffer = true; // Улучшает точность глубины

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

    // Обработчик наведения с троттлингом для производительности
    let lastMouseMoveTime = 0;
    const MOUSE_MOVE_THROTTLE = 100; // мс
    
    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const now = Date.now();
      if (now - lastMouseMoveTime < MOUSE_MOVE_THROTTLE) return;
      lastMouseMoveTime = now;
      
      const pickedObject = scene.pick(movement.endPosition);
      const container = viewer.container as HTMLElement;
      
      if (Cesium.defined(pickedObject) && (pickedObject.content || pickedObject.primitive)) {
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

    const loadTerrain = async () => {
      try {
        const { createTerrainProvider } = await import('@/lib/config/cesium-config');
        const terrain = await createTerrainProvider('maptiler');
        
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        
        if (terrain) {
          viewerRef.current.terrainProvider = terrain;
          viewerRef.current.scene.requestRender();
          console.log('✅ Рельеф MapTiler загружен');
        }
      } catch (err) {
        console.warn('⚠️ Не удалось загрузить рельеф:', err);
      }
    };

    loadTerrain();
  }, []);

  // Загрузка/смена подложки
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const basemapConfig = AVAILABLE_BASEMAPS.find(b => b.id === currentBasemap);
    if (!basemapConfig) return;

    let cancelled = false;

    const loadImagery = async () => {
      try {
        // Удаляем предыдущие слои
        imageryLayersRef.current.forEach(layer => viewer.imageryLayers.remove(layer, true));
        imageryLayersRef.current = [];

        const provider = await createImageryProvider(basemapConfig);
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) return;

        const addLayer = (p: Cesium.ImageryProvider) => {
          const layer = viewer.imageryLayers.addImageryProvider(p);
          layer.alpha = basemapConfig.opacity ?? 1.0;
          imageryLayersRef.current.push(layer);
        };

        if (Array.isArray(provider)) {
          provider.forEach(p => addLayer(p));
        } else if (provider) {
          addLayer(provider);
        }

        viewer.scene.requestRender();
      } catch (err) {
        console.warn('⚠️ Не удалось загрузить подложку:', err);
      }
    };

    loadImagery();

    return () => {
      cancelled = true;
    };
  }, [currentBasemap]);

  // Загрузка 3D модели с оптимизациями
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !currentModel) return;

    let cancelled = false;

    const loadTileset = async () => {
      // Даём время ортофото начать загрузку (они важнее)
      await new Promise(resolve => setTimeout(resolve, 500));
      if (cancelled) return;

      // Читаем tileset.json один раз и извлекаем:
      // 1) типичную вертикальную ошибку (Error/geometricError)
      // 2) оценку базовой высоты модели (по boundingVolume детей)
      const getTilesetInfo = async (
        url: string
      ): Promise<{ verticalError: number; baseHeight: number | null }> => {
        const cachedErr = tilesetErrorCacheRef.current[url];
        const cachedBase = tilesetBaseCacheRef.current[url];
        if (cachedErr !== undefined && cachedBase !== undefined) {
          return { verticalError: cachedErr, baseHeight: cachedBase };
        }

        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();

          const children = json?.root?.children || [];

          // Ошибка
          const errors: number[] = children
            .map((c: any) => c?.Error ?? c?.geometricError)
            .filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[];
          let medianChildError = 0;
          if (errors.length) {
            errors.sort((a, b) => a - b);
            medianChildError = errors[Math.floor(errors.length / 2)];
          }

          const rootError = json?.Error ?? json?.root?.Error;
          const errCandidates = [medianChildError, rootError]
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
          const chosenError = errCandidates.length ? Math.min(...errCandidates) : 0;

          // База модели
          const baseFromBoundingVolume = (bv: any): number | null => {
            if (!bv) return null;
            if (Array.isArray(bv.box)) {
              const box = bv.box as number[];
              if (box.length !== 12) return null;
              const center = new Cesium.Cartesian3(box[0], box[1], box[2]);
              const axisX = new Cesium.Cartesian3(box[3], box[4], box[5]);
              const axisY = new Cesium.Cartesian3(box[6], box[7], box[8]);
              const axisZ = new Cesium.Cartesian3(box[9], box[10], box[11]);
              const corners: Cesium.Cartesian3[] = [];
              const signs = [-1, 1];
              for (const sx of signs) {
                for (const sy of signs) {
                  for (const sz of signs) {
                    corners.push(
                      Cesium.Cartesian3.add(
                        center,
                        new Cesium.Cartesian3(
                          sx * axisX.x + sy * axisY.x + sz * axisZ.x,
                          sx * axisX.y + sy * axisY.y + sz * axisZ.y,
                          sx * axisX.z + sy * axisY.z + sz * axisZ.z
                        ),
                        new Cesium.Cartesian3()
                      )
                    );
                  }
                }
              }
              const heights = corners.map(c => Cesium.Cartographic.fromCartesian(c).height);
              return Math.min(...heights);
            }
            if (Array.isArray(bv.sphere)) {
              const s = bv.sphere as number[];
              if (s.length !== 4) return null;
              const center = new Cesium.Cartesian3(s[0], s[1], s[2]);
              const carto = Cesium.Cartographic.fromCartesian(center);
              // Радиус сферы в 3D Tiles включает горизонтальный размер.
              // Для крупных сфер alt - r сильно занижает базу, поэтому ограничиваем "вертикальную" часть.
              const verticalRadius = Math.min(s[3], 15);
              return carto.height - verticalRadius;
            }
            return null;
          };

          const childBases = children
            .map((c: any) => baseFromBoundingVolume(c?.boundingVolume))
            .filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[];

          let baseHeight: number | null = null;
          if (childBases.length) {
            childBases.sort((a, b) => a - b);
            baseHeight = childBases[Math.floor(childBases.length / 2)];
          }

          tilesetErrorCacheRef.current[url] = chosenError;
          tilesetBaseCacheRef.current[url] = baseHeight;

          return { verticalError: chosenError, baseHeight };
        } catch (err) {
          console.warn('⚠️ Не удалось прочитать tileset.json для Error/baseHeight:', err);
          tilesetErrorCacheRef.current[url] = 0;
          tilesetBaseCacheRef.current[url] = null;
          return { verticalError: 0, baseHeight: null };
        }
      };

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
          // Ограничение параллельных запросов чтобы не блокировать ортофото
          maximumSimultaneousTileLoads: LIMITS.MAX_3D_MODEL_REQUESTS,
          // Низкий приоритет загрузки - ортофото важнее
          preloadWhenHidden: false,
          preloadFlightDestinations: false,
        };

        const tileset = await Cesium.Cesium3DTileset.fromUrl(currentModel, tilesetOptions);

        // Проверяем, что компонент не размонтирован
        if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed()) {
          tileset.destroy();
          return;
        }

        viewerRef.current.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
        viewerRef.current.scene.requestRender();

        // Подписываемся на ошибки загрузки тайлов
        tileset.tileFailed.addEventListener((error: { url?: string; message?: string }) => {
          console.error('Tile failed:', error.url);
        });

        // Глобальная коррекция высоты по локальному DEM (сдвигаем весь тайлсет)
        const demName = currentModel.toLowerCase().includes('krasno') ? 'Krasnoarmeiskoe' : 'Kanash';

        const getBaseHeightFromBoundingVolume = (tile: any): number | null => {
          const bv = tile.boundingVolume;
          if (bv?.box) {
            const box = bv.box;
            const center = new Cesium.Cartesian3(box[0], box[1], box[2]);
            const axisX = new Cesium.Cartesian3(box[3], box[4], box[5]);
            const axisY = new Cesium.Cartesian3(box[6], box[7], box[8]);
            const axisZ = new Cesium.Cartesian3(box[9], box[10], box[11]);
            const corners: Cesium.Cartesian3[] = [];
            const signs = [-1, 1];
            for (const sx of signs) {
              for (const sy of signs) {
                for (const sz of signs) {
                  const corner = Cesium.Cartesian3.add(
                    center,
                    new Cesium.Cartesian3(
                      sx * axisX.x + sy * axisY.x + sz * axisZ.x,
                      sx * axisX.y + sy * axisY.y + sz * axisZ.y,
                      sx * axisX.z + sy * axisY.z + sz * axisZ.z
                    ),
                    new Cesium.Cartesian3()
                  );
                  corners.push(corner);
                }
              }
            }
            const heights = corners.map(c => Cesium.Cartographic.fromCartesian(c).height);
            return Math.min(...heights);
          }
          if (bv?.sphere) {
            const [x, y, z, r] = bv.sphere;
            const center = new Cesium.Cartesian3(x, y, z);
            const carto = Cesium.Cartographic.fromCartesian(center);
            // Для крупных sphere (особенно root) радиус включает горизонтальный размер,
            // поэтому alt - r даёт бессмысленно низкую "базу". Если есть дети — оцениваем базу по ним.
            const children = tile.children;
            if (Array.isArray(children) && children.length) {
              const childBases = children
                .map((c: any) => getBaseHeightFromBoundingVolume(c))
                .filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[];
              if (childBases.length) {
                childBases.sort((a, b) => a - b);
                return childBases[Math.floor(childBases.length / 2)]; // медиана
              }
            }
            return carto.height - r;
          }
          return null;
        };

        try {
          const { verticalError: modelVerticalError, baseHeight: jsonBaseHeight } =
            await getTilesetInfo(currentModel);
          const root = tileset.root;
          const runtimeBase =
            getBaseHeightFromBoundingVolume(root) ??
            Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center).height;
          const baseHeight = jsonBaseHeight ?? runtimeBase;
          const centerCarto = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
          const demRes = await fetch(
            `/api/dem-height?lon=${Cesium.Math.toDegrees(centerCarto.longitude)}&lat=${Cesium.Math.toDegrees(centerCarto.latitude)}&name=${demName}`
          );
          if (demRes.ok) {
            const data = await demRes.json();
            const demHeight = Number(data?.height);
            if (Number.isFinite(demHeight)) {
              const rawDiff = demHeight - baseHeight;
              const heightDiff = rawDiff;

              const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
                tileset.boundingSphere.center,
                new Cesium.Cartesian3()
              );
              const translation = Cesium.Cartesian3.multiplyByScalar(
                normal,
                heightDiff,
                new Cesium.Cartesian3()
              );
              const transform = Cesium.Matrix4.fromTranslation(translation);
              tileset.modelMatrix = Cesium.Matrix4.multiply(
                transform,
                tileset.modelMatrix,
                new Cesium.Matrix4()
              );

              console.log(
                `📍 Tileset adjust ${heightDiff.toFixed(2)}м (DEM ${demName}, base=${baseHeight.toFixed(2)}м, dem=${demHeight.toFixed(2)}м, modelErr≈${modelVerticalError.toFixed(2)}м)`
              );
            }
          }
        } catch (rootErr) {
          console.warn('⚠️ Tileset DEM adjust failed:', rootErr);
        }

        // Логируем базовую информацию
        const boundingSphere = tileset.boundingSphere;
        const cartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
        const modelName = currentModel.split('/').pop();
        console.log(`✅ ${modelName} loaded at ${Cesium.Math.toDegrees(cartographic.longitude).toFixed(2)}°, ${Cesium.Math.toDegrees(cartographic.latitude).toFixed(2)}°`);

        // Перелёт к модели только если это первая загрузка или модель изменилась
        if (!initialFlyDoneRef.current || currentModelRef.current !== currentModel) {
          currentModelRef.current = currentModel;
          initialFlyDoneRef.current = true;
          flyToTileset(tileset);
        }
        
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModel]);

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
