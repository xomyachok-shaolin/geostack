# Troubleshooting Guide

## 3D Models Not Visible

Если модели загружаются (видно "TILESET LOADED" в консоли), но не отображаются:

### Исправления (последняя версия)
1. **ECEF->ENU трансформация**: Используем CONFIG центр (не вычисленный) для правильной привязки к MapLibre
2. **Добавлено логирование**: В консоли видно позицию, масштаб и количество детей группы
3. **Упрощена логика**: Убрана сложная логика изменения modelCenter после загрузки

### Debugging Steps
1. Check browser console for "TILESET LOADED" messages
2. Verify bounding sphere center and radius are logged
3. Compare computed model center vs config center
4. Check if models are loading (look for "Model loaded" messages)

### Model Configuration
Models are configured in `src/lib/config/map-config.ts`:
- Kanash: `[47.49, 55.51, 200m]`
- Krasnoarmeiskoe: `[47.15, 55.72, 200m]`

These are approximate centers - the actual center is computed from the tileset's bounding sphere.

## Terrain (Рельеф)

### Текущее решение
TiTiler **отключен** так как требует Docker. Вместо этого:

1. **Terrain по умолчанию ВЫКЛЮЧЕН** - для лучшей производительности
2. **Можно включить в UI** - использует внешний источник AWS Terrarium:
   ```
   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
   ```
3. **Работает без Docker** - не требует дополнительной настройки

### Если нужен локальный terrain (с Docker)
```bash
# Требуются права на Docker
docker run -d --name titiler-dev \
  -p 8000:8000 \
  -v $(pwd)/data/terrain:/data/terrain:ro \
  ghcr.io/developmentseed/titiler:latest
```

Затем обновите код для использования локального TiTiler.

### Local Terrain Data
Terrain DEM files are available in `data/terrain/processed/`:
- `local_dem.tif` - Combined DEM for the region
- `kanash_dem.tif` - Kanash area DEM
- `krasnoarmeiskoe_dem.tif` - Krasnoarmeiskoe area DEM

To serve these with TiTiler:
```bash
docker run -d --name titiler-dev \
  -p 8000:8000 \
  -v $(pwd)/data/terrain:/data/terrain:ro \
  ghcr.io/developmentseed/titiler:latest
```

## MapLibre Globe Warnings

### Issue
MapLibre Globe projection shows warnings:
- "calculateFogMatrix is not supported on globe projection"
- "terrain is not fully supported on vertical perspective projection"

### Solution
These warnings are now suppressed as they're expected limitations of globe projection. The features still work, just with reduced fidelity.

### Globe vs Mercator
If you need full terrain and fog support, consider switching to Mercator projection in `MapLibreViewer.tsx`:
```typescript
projection: { type: 'mercator' }, // instead of 'globe'
```

## Common Issues

### Models appear too small or too large
Adjust the scale in `create3DTilesLayer`:
```typescript
tilesRenderer.group.scale.setScalar(1.0); // Increase/decrease this value
```

### Models in wrong location
Check the computed center vs config center in console logs. If significantly different, update the config in `map-config.ts`.

### Orthophotos not loading
1. Check Next.js dev server is running
2. Verify files exist in `data/ortho/` directories
3. Check browser Network tab for 404 errors
4. Ensure API routes in `src/app/api/ortho/` are working

### Performance issues
1. Reduce `maxDepth` in TilesRenderer (currently 15)
2. Increase `errorTarget` (currently 6)
3. Reduce terrain exaggeration
4. Use lower zoom levels

## Команды разработки

```bash
# Запуск сервера разработки (без TiTiler)
pnpm dev

# Или явно
pnpm run dev:next

# Сборка для продакшена
pnpm build

# Запуск продакшен сервера
pnpm start

# Очистка кеша
pnpm clean
```

## Useful Debugging

### Check 3D Tiles Loading
Open browser console and filter for:
- "TILESET LOADED"
- "Model loaded"
- "Bounding sphere"

### Check MapLibre State
```javascript
// In browser console
map = window.maplibreMap; // if you expose it
map.getStyle();
map.getCenter();
map.getPitch();
```

### Check Three.js Scene
Add to render method:
```typescript
console.log('Scene children:', scene.children.length);
console.log('Tiles renderer group:', tilesRenderer.group.children.length);
```
