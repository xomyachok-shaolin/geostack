/**
 * База данных зданий с информацией об адресах и характеристиках
 * Село Красноармейское, Чувашская Республика
 */

export interface BuildingInfo {
  /** Идентификатор файла (без расширения) */
  id: string;
  /** Адрес здания */
  address: string;
  /** Улица */
  street?: string;
  /** Номер дома */
  houseNumber?: string;
  /** Описание/назначение */
  description?: string;
  /** Количество этажей */
  floors?: number;
  /** Год постройки */
  yearBuilt?: number;
  /** Тип здания */
  type?: 'residential' | 'commercial' | 'public' | 'industrial' | 'religious' | 'educational' | 'medical' | 'cultural' | 'administrative' | 'other';
  /** Материал стен */
  wallMaterial?: string;
  /** Площадь здания (м²) */
  area?: number;
  /** Кадастровый номер */
  cadastralNumber?: string;
  /** Владелец/организация */
  owner?: string;
  /** Контактный телефон */
  phone?: string;
  /** Часы работы */
  workingHours?: string;
  /** Историческая справка */
  history?: string;
  /** Ссылка на сайт */
  website?: string;
  /** Фотография (URL) */
  photoUrl?: string;
  /** Координаты (широта, долгота) */
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  /** Дополнительные данные */
  metadata?: Record<string, unknown>;
}

/**
 * Типы зданий с иконками и описаниями
 */
export const BUILDING_TYPES = {
  residential: { icon: '🏠', name: 'Жилой дом', color: '#4CAF50' },
  commercial: { icon: '🏪', name: 'Коммерческое', color: '#FF9800' },
  public: { icon: '🏛️', name: 'Общественное', color: '#2196F3' },
  industrial: { icon: '🏭', name: 'Промышленное', color: '#607D8B' },
  religious: { icon: '⛪', name: 'Религиозное', color: '#9C27B0' },
  educational: { icon: '🏫', name: 'Образовательное', color: '#00BCD4' },
  medical: { icon: '🏥', name: 'Медицинское', color: '#F44336' },
  cultural: { icon: '🎭', name: 'Культурное', color: '#E91E63' },
  administrative: { icon: '🏢', name: 'Административное', color: '#3F51B5' },
  other: { icon: '🏗️', name: 'Прочее', color: '#9E9E9E' },
} as const;

/**
 * База данных известных зданий села Красноармейское
 * Ключ - имя файла b3dm (uri из tileset.json)
 */
export const BUILDINGS_DATABASE: Record<string, BuildingInfo> = {
  '30 let Pobedi_7': {
    id: '30 let Pobedi_7',
    address: 'ул. 30 лет Победы, д. 7, с. Красноармейское',
    street: '30 лет Победы',
    houseNumber: '7',
    type: 'residential',
    description: 'Многоквартирный жилой дом',
    floors: 5,
    yearBuilt: 1985,
    wallMaterial: 'Кирпич',
    area: 2850,
    coordinates: {
      latitude: 55.7234,
      longitude: 47.1567,
    },
    history: 'Построен в период активного жилищного строительства в районном центре.',
  },

  'Lenina_23': {
    id: 'Lenina_23',
    address: 'ул. Ленина, д. 23, с. Красноармейское',
    street: 'Ленина',
    houseNumber: '23',
    type: 'commercial',
    description: 'Торговый центр «Универмаг»',
    floors: 2,
    yearBuilt: 1978,
    wallMaterial: 'Кирпич',
    area: 1200,
    owner: 'ООО «Торговый дом»',
    workingHours: 'Пн-Сб: 9:00-19:00, Вс: 10:00-17:00',
    phone: '+7 (835) 123-45-67',
    coordinates: {
      latitude: 55.7241,
      longitude: 47.1589,
    },
  },

  'Lenina_35': {
    id: 'Lenina_35',
    address: 'ул. Ленина, д. 35, с. Красноармейское',
    street: 'Ленина',
    houseNumber: '35',
    type: 'administrative',
    description: 'Администрация Красноармейского района',
    floors: 3,
    yearBuilt: 1965,
    wallMaterial: 'Кирпич',
    area: 1850,
    owner: 'Муниципальное образование',
    workingHours: 'Пн-Пт: 8:00-17:00, обед 12:00-13:00',
    phone: '+7 (835) 530-21-12',
    website: 'http://gov.cap.ru/main.asp?govid=68',
    coordinates: {
      latitude: 55.7245,
      longitude: 47.1612,
    },
    history: 'Здание построено как районный исполком, с 1991 года — администрация района.',
  },

  'Lenina_39': {
    id: 'Lenina_39',
    address: 'ул. Ленина, д. 39, с. Красноармейское',
    street: 'Ленина',
    houseNumber: '39',
    type: 'cultural',
    description: 'Районный дом культуры',
    floors: 2,
    yearBuilt: 1972,
    wallMaterial: 'Кирпич, бетонные панели',
    area: 2400,
    owner: 'МБУК «Красноармейский РДК»',
    workingHours: 'Вт-Вс: 10:00-21:00, Пн — выходной',
    phone: '+7 (835) 530-22-33',
    coordinates: {
      latitude: 55.7248,
      longitude: 47.1625,
    },
    history: 'Центр культурной жизни района. Проводятся концерты, выставки, народные праздники.',
  },

  'Lenina_74_A': {
    id: 'Lenina_74_A',
    address: 'ул. Ленина, д. 74А, с. Красноармейское',
    street: 'Ленина',
    houseNumber: '74А',
    type: 'educational',
    description: 'МБОУ «Красноармейская СОШ №1»',
    floors: 3,
    yearBuilt: 1968,
    wallMaterial: 'Кирпич',
    area: 4500,
    owner: 'Администрация Красноармейского района',
    workingHours: 'Пн-Сб: 7:30-18:00',
    phone: '+7 (835) 530-21-45',
    website: 'https://kras-school1.edusite.ru/',
    coordinates: {
      latitude: 55.7267,
      longitude: 47.1678,
    },
    history: 'Одна из старейших школ района. Подготовила тысячи выпускников.',
  },

  'Lenina_98': {
    id: 'Lenina_98',
    address: 'ул. Ленина, д. 98, с. Красноармейское',
    street: 'Ленина',
    houseNumber: '98',
    type: 'medical',
    description: 'БУ «Красноармейская ЦРБ» — Центральная районная больница',
    floors: 4,
    yearBuilt: 1982,
    wallMaterial: 'Кирпич',
    area: 6200,
    owner: 'Министерство здравоохранения Чувашской Республики',
    workingHours: 'Круглосуточно (стационар), Поликлиника: Пн-Пт 7:30-18:00',
    phone: '+7 (835) 530-21-96',
    website: 'http://kras-crb.med.cap.ru/',
    coordinates: {
      latitude: 55.7289,
      longitude: 47.1723,
    },
    history: 'Главное лечебное учреждение района. Обслуживает более 20 000 человек.',
  },

  'Sobornaya_2': {
    id: 'Sobornaya_2',
    address: 'ул. Соборная, д. 2, с. Красноармейское',
    street: 'Соборная',
    houseNumber: '2',
    type: 'religious',
    description: 'Храм Святой Троицы',
    floors: 1,
    yearBuilt: 1895,
    wallMaterial: 'Кирпич, белый камень',
    area: 450,
    owner: 'Чебоксарская епархия РПЦ',
    workingHours: 'Ежедневно: 7:00-19:00, службы по расписанию',
    phone: '+7 (835) 530-28-88',
    coordinates: {
      latitude: 55.7256,
      longitude: 47.1598,
    },
    history: 'Памятник архитектуры XIX века. Построен на средства прихожан. В советское время использовался как склад, восстановлен в 1990-х годах.',
  },

  'Vasileva_2': {
    id: 'Vasileva_2',
    address: 'ул. Васильева, д. 2, с. Красноармейское',
    street: 'Васильева',
    houseNumber: '2',
    type: 'public',
    description: 'Центр занятости населения',
    floors: 2,
    yearBuilt: 1990,
    wallMaterial: 'Кирпич',
    area: 680,
    owner: 'Государственная служба занятости',
    workingHours: 'Пн-Пт: 8:00-17:00',
    phone: '+7 (835) 530-25-15',
    coordinates: {
      latitude: 55.7238,
      longitude: 47.1545,
    },
  },
};

/**
 * Статистика по зданиям
 */
export function getBuildingsStatistics() {
  const buildings = Object.values(BUILDINGS_DATABASE);
  const typeCount: Record<string, number> = {};
  let totalArea = 0;
  let oldestYear = Infinity;
  let newestYear = 0;

  buildings.forEach(b => {
    if (b.type) {
      typeCount[b.type] = (typeCount[b.type] || 0) + 1;
    }
    if (b.area) totalArea += b.area;
    if (b.yearBuilt) {
      if (b.yearBuilt < oldestYear) oldestYear = b.yearBuilt;
      if (b.yearBuilt > newestYear) newestYear = b.yearBuilt;
    }
  });

  return {
    totalBuildings: buildings.length,
    typeCount,
    totalArea,
    oldestYear: oldestYear === Infinity ? null : oldestYear,
    newestYear: newestYear === 0 ? null : newestYear,
  };
}

/**
 * Получить информацию о здании по URI из tileset
 */
export function getBuildingInfoByUri(uri: string): BuildingInfo | undefined {
  const filename = uri.split('/').pop()?.replace('.b3dm', '') || '';
  return BUILDINGS_DATABASE[filename];
}

/**
 * Получить информацию о здании по имени файла
 */
export function getBuildingInfoByFilename(filename: string): BuildingInfo | undefined {
  const cleanName = filename.replace('.b3dm', '');
  return BUILDINGS_DATABASE[cleanName];
}

/**
 * Парсинг технического названия здания (Build[Contour[XXXX]])
 */
export function parseGenericBuildingName(uri: string): BuildingInfo | undefined {
  const filename = uri.split('/').pop()?.replace('.b3dm', '') || '';
  
  const buildMatch = filename.match(/Build\[Contour\[(\d+)\]\]/);
  if (buildMatch) {
    const contourId = buildMatch[1];
    return {
      id: filename,
      address: `Здание #${contourId}`,
      description: 'Жилой или хозяйственный объект',
      type: 'residential',
      metadata: {
        contourId: parseInt(contourId, 10),
        note: 'Информация о здании отсутствует в базе данных. Возможно, это частный жилой дом или хозяйственная постройка.',
      },
    };
  }

  const contourMatch = filename.match(/Contour\[(\d+)\]/);
  if (contourMatch) {
    return {
      id: filename,
      address: `Объект #${contourMatch[1]}`,
      description: 'Вспомогательное сооружение',
      type: 'other',
    };
  }

  const lineMatch = filename.match(/Line\[(\d+)\]/);
  if (lineMatch) {
    return {
      id: filename,
      address: `Линейный объект #${lineMatch[1]}`,
      description: 'Забор, ограждение или инженерная коммуникация',
      type: 'other',
    };
  }

  return undefined;
}

/**
 * Универсальная функция получения информации о здании
 */
export function getBuildingInfo(uri: string): BuildingInfo | undefined {
  const dbInfo = getBuildingInfoByUri(uri);
  if (dbInfo) return dbInfo;
  return parseGenericBuildingName(uri);
}

/**
 * Получить все известные адреса для поиска
 */
export function getAllKnownAddresses(): { id: string; address: string; type?: string }[] {
  return Object.values(BUILDINGS_DATABASE).map(b => ({
    id: b.id,
    address: b.address,
    type: b.type,
  }));
}

/**
 * Поиск зданий по адресу
 */
export function searchBuildingsByAddress(query: string): BuildingInfo[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(BUILDINGS_DATABASE).filter(
    b => b.address.toLowerCase().includes(lowerQuery) ||
         b.street?.toLowerCase().includes(lowerQuery) ||
         b.houseNumber?.toLowerCase().includes(lowerQuery) ||
         b.description?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Получить здания по типу
 */
export function getBuildingsByType(type: BuildingInfo['type']): BuildingInfo[] {
  return Object.values(BUILDINGS_DATABASE).filter(b => b.type === type);
}

/**
 * Получить ближайшие здания к координатам
 */
export function getNearestBuildings(lat: number, lon: number, limit: number = 5): BuildingInfo[] {
  const buildingsWithDistance = Object.values(BUILDINGS_DATABASE)
    .filter(b => b.coordinates)
    .map(b => {
      const dLat = b.coordinates!.latitude - lat;
      const dLon = b.coordinates!.longitude - lon;
      const distance = Math.sqrt(dLat * dLat + dLon * dLon);
      return { building: b, distance };
    })
    .sort((a, b) => a.distance - b.distance);

  return buildingsWithDistance.slice(0, limit).map(item => item.building);
}
