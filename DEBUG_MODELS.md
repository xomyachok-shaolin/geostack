# ✅ ПРОБЛЕМА РЕШЕНА!

## Что было не так

**Проблема**: ECEF->ENU трансформация смещала модель за пределы видимости MapLibre Globe.

**Решение**: Используем вычисленный центр из bounding sphere tileset вместо конфигурационного, что даёт точное позиционирование.

## Изменения

1. Трансформация теперь использует вычисленный центр модели из ECEF координат
2. Обновлены координаты в конфигурации моделей (более точные)
3. Убрано избыточное логирование
4. Оптимизированы параметры LOD (errorTarget: 12)

---

# Отладка видимости 3D моделей (архив)

## Что проверить в консоли браузера

### 1. Модель загружается?
Должны быть сообщения:
```
Initializing TilesRenderer with URL: /models/kanash/tileset.json
=== TILESET LOADED ===
Bounding sphere center (ECEF): Vector3 {x: ..., y: ..., z: ...}
Bounding sphere radius: 606.99...
Computed model center (geo): {lon: 47.52..., lat: 55.50..., alt: 193.8...}
Config model center: {longitude: 47.49, latitude: 55.51, height: 200}
Model group position: ...
Model group scale: ...
Model group children: 1
```

### 2. Модель рендерится?
Каждую секунду должно быть (если камера смотрит на модель):
```
Render: {
  sceneChildren: 4,
  tilesGroupChildren: 1,
  cameraPos: Vector3 {...},
  transformApplied: true
}
```

### 3. Проверка параметров

В консоли выполните:
```javascript
// Получить сцену (если она экспортирована)
// Или добавьте в код временно:
console.log('Scene:', scene);
console.log('TilesRenderer group:', tilesRenderer.group);
console.log('Children:', tilesRenderer.group.children);
```

## Типичные проблемы

### Модель загрузилась, но не видна

**Причина 1: Неправильный центр**
- Проверьте что `Config model center` близко к `Computed model center`
- Разница должна быть < 0.1 градуса

**Решение**: Обновите координаты в `src/lib/config/map-config.ts`:
```typescript
{
  id: 'kanash',
  name: 'Канаш',
  url: '/models/kanash/tileset.json',
  center: {
    longitude: 47.525, // Используйте Computed lon
    latitude: 55.507,  // Используйте Computed lat
    height: 194,       // Используйте Computed alt
  },
}
```

**Причина 2: Модель слишком маленькая**
- `Model group scale` должен быть `{x: 1, y: 1, z: 1}`

**Решение**: Временно увеличьте масштаб:
```typescript
// В MapLibreViewer.tsx, после applyMatrix4
tilesRenderer.group.scale.setScalar(10.0); // Было 1.0
```

**Причина 3: Камера не смотрит на модель**
- Проверьте что вы летите к модели после загрузки
- Zoom должен быть 15-17
- Pitch должен быть 50-60

**Решение**: В UI нажмите кнопку перелёта к модели после загрузки

**Причина 4: ECEF->ENU трансформация неправильная**
- `Model group children` должно быть > 0
- Если 0 - модель не загрузилась в группу

**Решение**: Проверьте путь к tileset.json:
```bash
ls -la public/models/kanash/tileset.json
```

### Model group children = 0

Модель не добавилась в группу. Проверьте:

1. Файл tileset.json существует и доступен
2. Нет ошибок CORS (должны быть в консоли)
3. Формат tileset.json корректный

```bash
# Проверка структуры
cat public/models/kanash/tileset.json | jq .root
```

### transformApplied = false

Трансформация не применилась. Возможно:
- Bounding sphere не получен
- Ошибка в createECEFtoENUMatrix

Проверьте что в консоли есть:
```
Bounding sphere center (ECEF): ...
Bounding sphere radius: ...
```

Если их нет - проблема в tileset.json или загрузке.

## Временные хаки для отладки

### Добавить видимый куб в сцену

В `create3DTilesLayer`, после `scene.add(tilesRenderer.group)`:

```typescript
// Тестовый красный куб для проверки рендеринга
const geometry = new THREE.BoxGeometry(100, 100, 100);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(0, 0, 0);
tilesRenderer.group.add(cube);
console.log('Added test cube');
```

Если куб виден, но модель нет - проблема в модели.
Если куб не виден - проблема в трансформации/камере.

### Экспортировать объекты для отладки

В MapLibreViewer.tsx, в onAdd:

```typescript
// Для отладки в консоли браузера
(window as any).debugScene = scene;
(window as any).debugTilesRenderer = tilesRenderer;
(window as any).debugLodCamera = lodCamera;
```

Затем в консоли браузера:
```javascript
window.debugScene
window.debugTilesRenderer.group
window.debugLodCamera.position
```

## Следующие шаги если ничего не помогло

1. Проверьте что модель вообще валидная - откройте в другом 3D Tiles viewer
2. Попробуйте переключиться на Mercator проекцию вместо Globe
3. Попробуйте упростить ECEF->ENU трансформацию (убрать её временно)
4. Создайте issue с полными логами консоли
