/**
 * Клиентский сервис для получения данных о зданиях
 * Использует серверный API для обхода CORS и rate limiting
 * Источники: OSM Overpass, Nominatim, НСПД Росреестр
 */

import { UnifiedBuildingData, OrganizationInfo } from '../types';

const API_ENDPOINT = '/api/building-data';

// Debounce для предотвращения частых запросов при кликах
let debounceTimer: NodeJS.Timeout | null = null;
let currentAbortController: AbortController | null = null;
const DEBOUNCE_DELAY = 300; // ms

// Локальный кэш на клиенте
const clientCache = new Map<string, { data: BuildingDataResponse; timestamp: number }>();
const CLIENT_CACHE_TTL = 60 * 1000; // 1 минута

interface OSMElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OSMResponse {
  source: 'osm';
  success: boolean;
  buildings?: OSMElement[];
  addresses?: OSMElement[];
  pois?: OSMElement[];
  elements?: OSMElement[];
  count?: number;
  error?: string;
  cached?: boolean;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  village?: string;
  town?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface NominatimResponse {
  source: 'nominatim';
  success: boolean;
  displayName?: string;
  address?: NominatimAddress;
  extratags?: Record<string, string>;
  osmType?: string;
  osmId?: number;
  placeRank?: number;
  type?: string;
  class?: string;
  error?: string;
}

interface AllSourcesResponse {
  source: 'all';
  success: boolean;
  osm: OSMResponse;
  nominatim: NominatimResponse;
  nspd: NSPDResponse;
}

interface NSPDBuilding {
  cadastralNumber?: string;
  address?: string;
  name?: string;
  buildingType?: string;
  purpose?: string;
  area?: number;
  floors?: number;
  undergroundFloors?: number;
  yearBuilt?: number;
  yearCommissioning?: number;
  materials?: string;
  cadastralCost?: number;
  costIndex?: number;
  costDate?: string;
  costApplicationDate?: string;
  costRegistrationDate?: string;
  determinationCause?: string;
  ownershipType?: string;
  status?: string;
  previouslyPosted?: string;
  registrationDate?: string;
  quarterCadNumber?: string;
  culturalHeritage?: string;
  unitedCadNumbers?: string;
  intersectedCadNumbers?: unknown;
  permittedUseName?: string;
  categoryName?: string;
  lastUpdated?: string;
}

interface NSPDLandPlot {
  cadastralNumber?: string;
  address?: string;
  type?: string;
  subtype?: string;
  category?: string;
  area?: number;
  declaredArea?: unknown;
  specifiedArea?: number;
  permittedUse?: string;
  cadastralCost?: number;
  costIndex?: number;
  costDate?: string;
  costApplicationDate?: string;
  costRegistrationDate?: string;
  determinationCause?: string;
  ownershipType?: string;
  status?: string;
  previouslyPosted?: string;
  registrationDate?: string;
  quarterCadNumber?: string;
  categoryName?: string;
  lastUpdated?: string;
}

interface NSPDResponse {
  source: 'nspd';
  success: boolean;
  building?: NSPDBuilding | null;
  landPlot?: NSPDLandPlot | null;
  error?: string;
}

interface PKKData {
  cadastralNumber?: string;
  address?: string;
  area?: number;
  areaUnit?: string;
  cadastralCost?: number;
  costDate?: string;
  category?: string;
  utilization?: string;
  status?: string;
  name?: string;
  floors?: number;
  yearBuilt?: number;
}

interface PKKResponse {
  source: 'pkk';
  success: boolean;
  data?: PKKData;
  error?: string;
  note?: string;
  cached?: boolean;
}

export interface BuildingDataResponse {
  osm?: Partial<UnifiedBuildingData>;
  nominatim?: {
    fullAddress?: string;
    address?: NominatimAddress;
    placeType?: string;
  };
  nspd?: {
    building?: NSPDBuilding | null;
    landPlot?: NSPDLandPlot | null;
  };
  organizations?: OrganizationInfo[];
  errors?: string[];
  fromCache?: boolean;
}

/**
 * Получить данные о здании по координатам с debounce
 */
export function fetchBuildingData(
  lat: number,
  lon: number,
  callback: (data: BuildingDataResponse | null, loading: boolean) => void
): () => void {
  // Сразу показываем loading
  callback(null, true);

  // Отменяем предыдущий запрос если есть
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  if (currentAbortController) {
    currentAbortController.abort();
  }

  // Создаём новый AbortController
  const abortController = new AbortController();
  currentAbortController = abortController;

  debounceTimer = setTimeout(async () => {
    try {
      const data = await fetchBuildingDataImmediate(lat, lon, 30, abortController.signal);
      // Проверяем, не был ли запрос отменён
      if (!abortController.signal.aborted) {
        callback(data, false);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Запрос отменён, игнорируем
        return;
      }
      console.error('Error fetching building data:', error);
      callback({
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка'],
      }, false);
    }
  }, DEBOUNCE_DELAY);

  // Возвращаем функцию отмены
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    abortController.abort();
  };
}

/**
 * Получить данные немедленно (без debounce)
 * Использует source=all для получения данных из всех источников одним запросом
 */
export async function fetchBuildingDataImmediate(
  lat: number,
  lon: number,
  radius: number = 30,
  signal?: AbortSignal
): Promise<BuildingDataResponse> {
  const cacheKey = `${lat.toFixed(6)}:${lon.toFixed(6)}:${radius}`;
  
  // Проверяем клиентский кэш
  const cached = clientCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    return { ...cached.data, fromCache: true };
  }

  const result: BuildingDataResponse = {
    errors: [],
  };

  try {
    // Используем source=all для одного запроса ко всем источникам
    const response = await fetchFromAPI('all', lat, lon, radius, signal) as AllSourcesResponse;
    
    // Обрабатываем OSM
    if (response.osm?.success) {
      const osmData = response.osm;
      if (osmData.buildings && osmData.buildings.length > 0) {
        result.osm = parseOSMElement(osmData.buildings[0]);
      } else if (osmData.addresses && osmData.addresses.length > 0) {
        result.osm = parseOSMElement(osmData.addresses[0]);
      }
      
      if (osmData.pois && osmData.pois.length > 0) {
        result.organizations = osmData.pois.map(poi => parseOrganizationFromPOI(poi));
      }
    } else if (response.osm?.error) {
      result.errors?.push(`OSM: ${response.osm.error}`);
    }

    // Обрабатываем Nominatim
    if (response.nominatim?.success) {
      result.nominatim = {
        fullAddress: response.nominatim.displayName,
        address: response.nominatim.address,
        placeType: response.nominatim.type,
      };
      
      // Дополняем OSM данные из Nominatim если OSM не дал адрес
      if (result.osm && !result.osm.address && response.nominatim.address) {
        const addr = response.nominatim.address;
        result.osm.street = addr.road;
        result.osm.houseNumber = addr.house_number;
        result.osm.city = addr.city || addr.town || addr.village;
        if (addr.road) {
          result.osm.address = `${addr.road}${addr.house_number ? ', ' + addr.house_number : ''}`;
        }
      }
    } else if (response.nominatim?.error) {
      result.errors?.push(`Nominatim: ${response.nominatim.error}`);
    }

    // Обрабатываем НСПД
    if (response.nspd?.success) {
      result.nspd = {
        building: response.nspd.building,
        landPlot: response.nspd.landPlot,
      };
    } else if (response.nspd?.error) {
      result.errors?.push(`НСПД: ${response.nspd.error}`);
    }

  } catch (error) {
    result.errors?.push(error instanceof Error ? error.message : 'Ошибка запроса');
  }

  // Кэшируем результат
  if (result.osm || result.nominatim || result.nspd) {
    clientCache.set(cacheKey, { data: result, timestamp: Date.now() });
  }

  return result;
}

/**
 * Запрос к нашему API
 */
async function fetchFromAPI(
  source: 'osm' | 'pkk' | 'nominatim' | 'all',
  lat: number,
  lon: number,
  radius: number,
  signal?: AbortSignal
): Promise<OSMResponse | PKKResponse | NominatimResponse | AllSourcesResponse> {
  const params = new URLSearchParams({
    source,
    lat: lat.toString(),
    lon: lon.toString(),
    radius: radius.toString(),
  });

  const response = await fetch(`${API_ENDPOINT}?${params}`, { signal });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Парсинг OSM элемента в унифицированный формат
 */
function parseOSMElement(element: OSMElement): Partial<UnifiedBuildingData> {
  const tags = element.tags || {};
  const data: Partial<UnifiedBuildingData> = {};

  // Координаты
  if (element.center) {
    data.coordinates = {
      lat: element.center.lat,
      lon: element.center.lon,
    };
  }

  // Адрес
  const addressParts: string[] = [];
  if (tags['addr:street']) {
    data.street = tags['addr:street'];
    addressParts.push(tags['addr:street']);
  }
  if (tags['addr:housenumber']) {
    data.houseNumber = tags['addr:housenumber'];
    addressParts.push(tags['addr:housenumber']);
  }
  if (tags['addr:city']) {
    data.city = tags['addr:city'];
  }
  if (addressParts.length > 0) {
    data.address = addressParts.join(', ');
  }

  // Этажность
  if (tags['building:levels']) {
    const floors = parseInt(tags['building:levels'], 10);
    if (!isNaN(floors)) data.floors = floors;
  }

  // Год постройки
  const yearStr = tags['start_date'] || tags['building:year'];
  if (yearStr) {
    const year = parseInt(yearStr, 10);
    if (!isNaN(year) && year > 1000 && year <= new Date().getFullYear()) {
      data.yearBuilt = year;
    }
  }

  // Тип здания
  if (tags['building']) {
    data.buildingType = translateBuildingType(tags['building']);
  }

  // Материалы
  if (tags['building:material']) {
    data.wallMaterial = translateMaterial(tags['building:material']);
  }
  if (tags['roof:material']) {
    data.roofMaterial = translateMaterial(tags['roof:material']);
  }

  // Отопление
  if (tags['heating']) {
    data.heating = translateHeating(tags['heating']);
  }

  return data;
}

/**
 * Парсинг POI в информацию об организации
 */
function parseOrganizationFromPOI(element: OSMElement): OrganizationInfo {
  const tags = element.tags || {};
  const org: OrganizationInfo = { name: tags.name || 'Без названия' };
  
  if (tags.shop) org.type = translateShopType(tags.shop);
  else if (tags.amenity) org.type = translateAmenityType(tags.amenity);
  else if (tags.office) org.type = translateOfficeType(tags.office);
  
  if (tags.phone || tags['contact:phone']) org.phone = tags.phone || tags['contact:phone'];
  if (tags.website || tags['contact:website']) org.website = tags.website || tags['contact:website'];
  if (tags.opening_hours) org.workingHours = tags.opening_hours;
  
  return org;
}

/**
 * Извлечение организаций из OSM элементов (устаревшая, оставлена для совместимости)
 */
function extractOrganizations(elements: OSMElement[]): OrganizationInfo[] {
  return elements
    .filter(el => el.tags?.name && (el.tags?.shop || el.tags?.amenity || el.tags?.office))
    .map(el => parseOrganizationFromPOI(el));
}

// Функции перевода (сокращенные версии)
function translateBuildingType(type: string): string {
  const types: Record<string, string> = {
    'yes': 'Здание', 'residential': 'Жилой дом', 'apartments': 'Многоквартирный дом',
    'house': 'Частный дом', 'commercial': 'Коммерческое здание', 'industrial': 'Промышленное здание',
    'retail': 'Торговое здание', 'office': 'Офисное здание', 'warehouse': 'Склад',
    'school': 'Школа', 'hospital': 'Больница', 'church': 'Церковь',
    'government': 'Государственное учреждение', 'kindergarten': 'Детский сад',
  };
  return types[type.toLowerCase()] || type;
}

function translateMaterial(material: string): string {
  const materials: Record<string, string> = {
    'brick': 'Кирпич', 'concrete': 'Бетон', 'wood': 'Дерево', 'stone': 'Камень',
    'metal': 'Металл', 'panel': 'Панели', 'cement_block': 'Цементные блоки',
  };
  return materials[material.toLowerCase()] || material;
}

function translateHeating(heating: string): string {
  const types: Record<string, string> = {
    'central': 'Центральное', 'gas': 'Газовое', 'electric': 'Электрическое',
    'wood': 'Печное', 'no': 'Отсутствует',
  };
  return types[heating.toLowerCase()] || heating;
}

function translateShopType(type: string): string {
  const types: Record<string, string> = {
    'supermarket': 'Супермаркет', 'convenience': 'Продуктовый', 'pharmacy': 'Аптека',
    'bakery': 'Пекарня', 'hairdresser': 'Парикмахерская', 'clothes': 'Одежда',
  };
  return types[type] || 'Магазин';
}

function translateAmenityType(type: string): string {
  const types: Record<string, string> = {
    'restaurant': 'Ресторан', 'cafe': 'Кафе', 'bank': 'Банк', 'pharmacy': 'Аптека',
    'hospital': 'Больница', 'school': 'Школа', 'post_office': 'Почта',
  };
  return types[type] || type;
}

function translateOfficeType(type: string): string {
  const types: Record<string, string> = {
    'government': 'Госучреждение', 'insurance': 'Страховая', 'lawyer': 'Юридическая контора',
  };
  return types[type] || 'Офис';
}

/**
 * Очистка кэша (для тестирования)
 */
export function clearCache(): void {
  clientCache.clear();
}
