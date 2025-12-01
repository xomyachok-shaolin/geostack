'use client';

import { AVAILABLE_BASEMAPS, AVAILABLE_MODELS, initCesium } from '@/lib/cesium-config';
import { createImageryProvider } from '@/lib/imagery-providers';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useRef, useState } from 'react';
import Toolbar from './Toolbar';

export default function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const imageryLayerRef = useRef<Cesium.ImageryLayer | null>(null);

  const [currentModel, setCurrentModel] = useState(AVAILABLE_MODELS[0]?.url || '');
  const [currentBasemap, setCurrentBasemap] = useState('ion_satellite');
  const [isLoading, setIsLoading] = useState(true);

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
      infoBox: true,
      selectionIndicator: true,
      shadows: false,
      // @ts-ignore - отключаем базовую подложку
      baseLayer: false,
    });

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableRotate = true;
    controller.enableTranslate = true;
    controller.enableZoom = true;
    controller.enableTilt = true;
    controller.enableLook = true;

    viewerRef.current = viewer;
    setIsLoading(false);

    return () => {
      viewer.destroy();
    };
  }, []);

  // Загрузка подложки
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    const basemapConfig = AVAILABLE_BASEMAPS.find(b => b.id === currentBasemap);

    if (!basemapConfig) return;

    const loadBasemap = async () => {
      // Удаляем предыдущую подложку
      if (imageryLayerRef.current) {
        viewer.imageryLayers.remove(imageryLayerRef.current);
        imageryLayerRef.current = null;
      }

      try {
        const provider = await createImageryProvider(basemapConfig);
        if (provider) {
          imageryLayerRef.current = viewer.imageryLayers.addImageryProvider(provider);
        }
        console.log('Basemap changed:', currentBasemap);
      } catch (error) {
        console.error('Error loading basemap:', error);
      }
    };

    loadBasemap();
  }, [currentBasemap]);

  // Загрузка рельефа (всегда Cesium World Terrain)
  useEffect(() => {
    if (!viewerRef.current) return;

    const loadTerrain = async () => {
      try {
        const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
        if (viewerRef.current) {
          viewerRef.current.terrainProvider = terrain;
        }
        console.log('Cesium World Terrain loaded');
      } catch (error) {
        console.error('Error loading terrain:', error);
      }
    };

    loadTerrain();
  }, []);

  // Загрузка 3D модели
  useEffect(() => {
    if (!viewerRef.current || !currentModel) return;

    const loadTileset = async () => {
      setIsLoading(true);

      if (tilesetRef.current) {
        viewerRef.current!.scene.primitives.remove(tilesetRef.current);
      }

      try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(currentModel, {
          maximumScreenSpaceError: 16,
        });

        viewerRef.current!.scene.primitives.add(tileset);
        tilesetRef.current = tileset;

        // Получаем центр модели
        const boundingSphere = tileset.boundingSphere;
        const cartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
        
        console.log('Tileset loaded:', currentModel);
        console.log('Center (lon, lat, h):', 
          Cesium.Math.toDegrees(cartographic.longitude),
          Cesium.Math.toDegrees(cartographic.latitude),
          cartographic.height
        );

        // Перелёт к модели
        await viewerRef.current!.zoomTo(tileset, new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-45),
          tileset.boundingSphere.radius * 2.5
        ));
        
      } catch (error) {
        console.error('Error loading tileset:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTileset();
  }, [currentModel]);

  const handleResetView = () => {
    if (viewerRef.current && tilesetRef.current) {
      viewerRef.current.zoomTo(tilesetRef.current, new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-45),
        tilesetRef.current.boundingSphere.radius * 2.5
      ));
    }
  };

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
      {isLoading && <div className="loading">Загрузка...</div>}
    </>
  );
}
