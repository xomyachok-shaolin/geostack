/**
 * Типы данных для агрегатора информации о зданиях
 */

export interface UnifiedBuildingData {
  // Адрес
  address?: string;
  street?: string;
  houseNumber?: string;
  city?: string;
  
  // Характеристики здания
  floors?: number;
  yearBuilt?: number;
  totalArea?: number;
  livingArea?: number;
  buildingType?: string;
  
  // Материалы
  wallMaterial?: string;
  roofMaterial?: string;
  foundationType?: string;
  
  // Кадастр
  cadastralNumber?: string;
  landArea?: number;
  cadastralCost?: number;
  
  // Управление (ЖКХ)
  managementCompany?: string;
  managementPhone?: string;
  
  // Коммуникации
  heating?: string;
  hotWater?: string;
  coldWater?: string;
  sewage?: string;
  gas?: string;
  electricity?: string;
  
  // Состояние
  condition?: string;
  lastRepairYear?: number;
  isEmergency?: boolean;
  
  // Организации внутри здания
  organizations?: OrganizationInfo[];
  
  // Мета-информация
  sources: DataSource[];
  lastUpdated: Date;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

export interface OrganizationInfo {
  name: string;
  type?: string;
  phone?: string;
  website?: string;
  workingHours?: string;
  floor?: string;
}

export type DataSource = 'osm' | 'pkk' | 'manual';

export interface DataSourceResult {
  source: DataSource;
  success: boolean;
  data?: Partial<UnifiedBuildingData>;
  error?: string;
}
