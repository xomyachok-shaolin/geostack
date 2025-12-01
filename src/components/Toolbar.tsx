'use client';

import { useState } from 'react';

interface Model {
  id: string;
  name: string;
  url: string;
}

interface Basemap {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface ToolbarProps {
  models: Model[];
  currentModel: string;
  onModelChange: (url: string) => void;
  basemaps: Basemap[];
  currentBasemap: string;
  onBasemapChange: (id: string) => void;
  onResetView: () => void;
  isLoading: boolean;
}

export default function Toolbar({
  models,
  currentModel,
  onModelChange,
  basemaps,
  currentBasemap,
  onBasemapChange,
  onResetView,
  isLoading,
}: ToolbarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`toolbar ${collapsed ? 'collapsed' : ''}`}>
      <div className="toolbar-header" onClick={() => setCollapsed(!collapsed)}>
        <h3>🌍 GeoStack</h3>
        <span className="collapse-btn">{collapsed ? '▼' : '▲'}</span>
      </div>

      {!collapsed && (
        <div className="toolbar-content">
          <div className="control-group">
            <label>3D Модель:</label>
            <select
              value={currentModel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={isLoading}
            >
              {models.map((model) => (
                <option key={model.id} value={model.url}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Подложка:</label>
            <select
              value={currentBasemap}
              onChange={(e) => onBasemapChange(e.target.value)}
              disabled={isLoading}
            >
              {basemaps.map((basemap) => (
                <option key={basemap.id} value={basemap.id}>
                  {basemap.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <button onClick={onResetView} disabled={isLoading}>
              📍 К модели
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
