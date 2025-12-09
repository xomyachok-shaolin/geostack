'use client';

import type { BasemapConfig, CesiumBasemapConfig, Model3D } from '@/lib/types';
import { memo, useCallback, useState, useTransition } from 'react';

// Общий тип для basemap (работает и с MapLibre и с Cesium)
type AnyBasemapConfig = BasemapConfig | CesiumBasemapConfig;

interface ToolbarProps {
  models: Model3D[];
  currentModel: string;
  onModelChange: (url: string) => void;
  basemaps: AnyBasemapConfig[];
  currentBasemap: string;
  onBasemapChange: (id: string) => void;
  onResetView: () => void;
  isLoading: boolean;
  // Terrain controls (optional for MapLibre)
  terrainEnabled?: boolean;
  onTerrainToggle?: () => void;
  // Globe projection toggle
  isGlobeProjection?: boolean;
  onToggleProjection?: () => void;
}

function Toolbar({
  models,
  currentModel,
  onModelChange,
  basemaps,
  currentBasemap,
  onBasemapChange,
  onResetView,
  isLoading,
  terrainEnabled,
  onTerrainToggle,
  isGlobeProjection,
  onToggleProjection,
}: ToolbarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleToggle = useCallback(() => {
    setCollapsed(prev => !prev);
  }, []);

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    startTransition(() => {
      onModelChange(e.target.value);
    });
  }, [onModelChange]);

  const handleBasemapChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    startTransition(() => {
      onBasemapChange(e.target.value);
    });
  }, [onBasemapChange]);

  const isDisabled = isLoading || isPending;

  return (
    <div className={`toolbar ${collapsed ? 'collapsed' : ''}`}>
      <div 
        className="toolbar-header" 
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleToggle()}
        aria-expanded={!collapsed}
        aria-label="Переключить панель инструментов"
      >
        <h3>🌍 GeoStack</h3>
        <span className="collapse-btn" aria-hidden="true">
          {collapsed ? '▼' : '▲'}
        </span>
      </div>

      {!collapsed && (
        <div className="toolbar-content">
          <div className="control-group">
            <label htmlFor="model-select">3D Модель:</label>
            <select
              id="model-select"
              value={currentModel}
              onChange={handleModelChange}
              disabled={isDisabled}
              aria-busy={isPending}
            >
              {models.map((model) => (
                <option key={model.id} value={model.url}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="basemap-select">Подложка:</label>
            <select
              id="basemap-select"
              value={currentBasemap}
              onChange={handleBasemapChange}
              disabled={isDisabled}
              aria-busy={isPending}
            >
              {basemaps.map((basemap) => (
                <option key={basemap.id} value={basemap.id}>
                  {basemap.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <button 
              onClick={onResetView} 
              disabled={isDisabled}
              aria-label="Вернуться к модели"
            >
              📍 К модели
            </button>
          </div>

          {/* Terrain controls */}
          {onTerrainToggle && (
            <div className="control-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={terrainEnabled}
                  onChange={onTerrainToggle}
                  disabled={isDisabled}
                />
                <span>🏔️ 3D Рельеф</span>
              </label>
            </div>
          )}

          {/* Globe/Mercator projection toggle */}
          {onToggleProjection && (
            <div className="control-group">
              <button 
                onClick={onToggleProjection}
                disabled={isDisabled}
                className="projection-toggle"
                title={isGlobeProjection ? 'Переключить на Mercator' : 'Переключить на Globe'}
              >
                {isGlobeProjection ? '🌍 Globe' : '🗺️ Mercator'}
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default memo(Toolbar);
