'use client';

import { memo, useEffect, useState, useCallback } from 'react';
import { 
  fetchBuildingData, 
  BuildingDataResponse 
} from '@/lib/api/building-data-client';

interface InfoPanelProps {
  coordinates: { lat: number; lon: number } | null;
  tileId: string | null;
  onClose: () => void;
  isVisible: boolean;
}

/**
 * Копирование текста в буфер обмена
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback для старых браузеров
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * Компонент для кадастрового номера с кнопками копирования и ссылкой на ПКК
 */
function CadastralNumber({ number, type = 'building' }: { number: string; type?: 'building' | 'land' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(number);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Ссылка на ПКК Росреестра
  const pkkUrl = `https://pkk.rosreestr.ru/#/search/${encodeURIComponent(number)}`;
  // Ссылка на НСПД
  const nspdUrl = `https://nspd.gov.ru/map?thematicLayer=true&search=${encodeURIComponent(number)}`;

  return (
    <div className="cadastral-number">
      <span className="cadastral-value">{number}</span>
      <div className="cadastral-actions">
        <button
          className="cadastral-btn"
          onClick={handleCopy}
          title={copied ? 'Скопировано!' : 'Копировать'}
          aria-label="Копировать кадастровый номер"
        >
          {copied ? '✓' : '📋'}
        </button>
        <a
          href={pkkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cadastral-btn"
          title="Открыть на ПКК Росреестра"
          aria-label="Открыть на ПКК"
        >
          🔗
        </a>
        <a
          href={nspdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cadastral-btn"
          title="Открыть на НСПД"
          aria-label="Открыть на НСПД"
        >
          🗺️
        </a>
      </div>
    </div>
  );
}

/**
 * Компонент панели информации о здании
 * Получает реальные данные из OSM и ПКК Росреестра через серверный API
 */
function InfoPanel({ coordinates, tileId, onClose, isVisible }: InfoPanelProps) {
  const [buildingData, setBuildingData] = useState<BuildingDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Обработчик данных
  const handleDataReceived = useCallback((data: BuildingDataResponse | null, loading: boolean) => {
    setIsLoading(loading);
    if (data) {
      setBuildingData(data);
      setErrors(data.errors || []);
    } else if (!loading) {
      setBuildingData(null);
    }
  }, []);

  // Загрузка данных при изменении координат
  useEffect(() => {
    if (!isVisible || !coordinates) {
      setBuildingData(null);
      setErrors([]);
      return;
    }

    // Используем debounced fetch
    const cancel = fetchBuildingData(
      coordinates.lat, 
      coordinates.lon, 
      handleDataReceived
    );

    return cancel;
  }, [coordinates, isVisible, handleDataReceived]);

  if (!isVisible) return null;

  // Получаем данные из разных источников
  const osm = buildingData?.osm;
  const nominatim = buildingData?.nominatim;
  const nspd = buildingData?.nspd;
  const organizations = buildingData?.organizations;
  const hasData = osm || nominatim || nspd;

  // Формируем адрес (приоритет: NSPD -> OSM -> Nominatim)
  const address = nspd?.building?.address || nspd?.landPlot?.address ||
    osm?.address || 
    (nominatim?.address ? 
      `${nominatim.address.road || ''}${nominatim.address.house_number ? ', ' + nominatim.address.house_number : ''}`.trim() 
      : null) || null;
  const buildingType = nspd?.building?.buildingType || osm?.buildingType || nominatim?.placeType || null;
  
  // Город/населённый пункт
  const city = osm?.city || nominatim?.address?.city || nominatim?.address?.town || nominatim?.address?.village;
  const region = nominatim?.address?.state;
  const postcode = nominatim?.address?.postcode;

  // Определяем тип объекта для иконки
  const hasBuilding = !!nspd?.building?.cadastralNumber;
  const hasLand = !!nspd?.landPlot?.cadastralNumber;
  const objectIcon = hasBuilding ? '🏢' : hasLand ? '🌍' : '📍';

  return (
    <div className="info-panel">
      {/* Заголовок */}
      <div className="info-panel-header">
        <div className="info-panel-title">
          <span className="info-panel-icon">{objectIcon}</span>
          <div>
            <h3>{address || (hasLand && !hasBuilding ? 'Информация о земельном участке' : 'Информация об объекте')}</h3>
            {(buildingType || (hasLand && !hasBuilding && nspd?.landPlot?.category)) && (
              <span className="info-panel-type">
                {buildingType || nspd?.landPlot?.category}
              </span>
            )}
          </div>
        </div>
        <button 
          className="info-panel-close" 
          onClick={onClose}
          aria-label="Закрыть панель"
        >
          ×
        </button>
      </div>
      
      {/* Контент */}
      <div className="info-panel-content">
        {/* Индикатор загрузки */}
        {isLoading && (
          <div className="info-loading">
            <div className="info-loading-spinner"></div>
            <span>Загрузка данных из OSM и Росреестра...</span>
          </div>
        )}

        {/* Ошибки (показываем как предупреждение если есть хоть какие-то данные) */}
        {errors.length > 0 && !isLoading && !hasData && (
          <div className="info-error">
            <span className="info-error-icon">⚠️</span>
            <p>Не удалось загрузить данные</p>
            <small>{errors.join('; ')}</small>
            <br />
            <small>
              Координаты: {coordinates?.lat.toFixed(6)}, {coordinates?.lon.toFixed(6)}
            </small>
          </div>
        )}

        {/* Данные из OSM */}
        {osm && !isLoading && (
          <div className="info-section">
            <div className="info-section-title">📍 OpenStreetMap</div>
            {osm.street && osm.houseNumber && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Адрес</span>
                  <span className="info-value">{osm.street}, {osm.houseNumber}</span>
                </div>
              </div>
            )}
            {(osm.city || city) && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Населённый пункт</span>
                  <span className="info-value">{osm.city || city}</span>
                </div>
              </div>
            )}
            {region && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Регион</span>
                  <span className="info-value">{region}</span>
                </div>
              </div>
            )}
            {postcode && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Индекс</span>
                  <span className="info-value">{postcode}</span>
                </div>
              </div>
            )}
            {osm.floors && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Этажность</span>
                  <span className="info-value">{osm.floors}</span>
                </div>
              </div>
            )}
            {osm.yearBuilt && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Год постройки</span>
                  <span className="info-value">{osm.yearBuilt}</span>
                </div>
              </div>
            )}
            {osm.wallMaterial && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Материал стен</span>
                  <span className="info-value">{osm.wallMaterial}</span>
                </div>
              </div>
            )}
            {osm.heating && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Отопление</span>
                  <span className="info-value">{osm.heating}</span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Полный адрес из Nominatim (если нет данных OSM) */}
        {!osm && nominatim && !isLoading && (
          <div className="info-section">
            <div className="info-section-title">📍 Адрес (Nominatim)</div>
            {nominatim.fullAddress && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Полный адрес</span>
                  <span className="info-value" style={{ fontSize: '0.85em' }}>{nominatim.fullAddress}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Данные из НСПД Росреестра */}
        {nspd && !isLoading && (nspd.building || nspd.landPlot) && (
          <div className="info-section">
            <div className="info-section-title">🏛️ Росреестр (НСПД)</div>
            
            {/* Данные о здании */}
            {nspd.building && (
              <>
                {nspd.building.cadastralNumber && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Кадастровый номер</span>
                      <CadastralNumber number={nspd.building.cadastralNumber} type="building" />
                    </div>
                  </div>
                )}
                {nspd.building.name && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Наименование</span>
                      <span className="info-value">{nspd.building.name}</span>
                    </div>
                  </div>
                )}
                {nspd.building.address && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Адрес</span>
                      <span className="info-value" style={{ fontSize: '0.85em' }}>{nspd.building.address}</span>
                    </div>
                  </div>
                )}
                {nspd.building.buildingType && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Тип объекта</span>
                      <span className="info-value">{nspd.building.buildingType}</span>
                    </div>
                  </div>
                )}
                {nspd.building.purpose && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Назначение</span>
                      <span className="info-value">{nspd.building.purpose}</span>
                    </div>
                  </div>
                )}
                {nspd.building?.area && nspd.building.area > 0 && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Площадь</span>
                      <span className="info-value">{nspd.building.area.toLocaleString('ru-RU')} м²</span>
                    </div>
                  </div>
                )}
                {nspd.building?.floors && nspd.building.floors > 0 && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Этажность</span>
                      <span className="info-value">
                        {nspd.building.floors}
                        {nspd.building.undergroundFloors && nspd.building.undergroundFloors > 0 && ` (+ ${nspd.building.undergroundFloors} подз.)`}
                      </span>
                    </div>
                  </div>
                )}
                {nspd.building?.yearBuilt && nspd.building.yearBuilt > 0 && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Год постройки</span>
                      <span className="info-value">
                        {nspd.building.yearBuilt}
                        {nspd.building.yearCommissioning && nspd.building.yearCommissioning !== nspd.building.yearBuilt && ` (ввод: ${nspd.building.yearCommissioning})`}
                      </span>
                    </div>
                  </div>
                )}
                {nspd.building.materials && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Материал стен</span>
                      <span className="info-value">{nspd.building.materials}</span>
                    </div>
                  </div>
                )}
                {nspd.building?.cadastralCost && nspd.building.cadastralCost > 0 && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Кадастровая стоимость</span>
                      <span className="info-value">{nspd.building.cadastralCost.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  </div>
                )}
                {nspd.building.costDate && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Дата определения стоимости</span>
                      <span className="info-value">{nspd.building.costDate}</span>
                    </div>
                  </div>
                )}
                {nspd.building.ownershipType && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Форма собственности</span>
                      <span className="info-value">{nspd.building.ownershipType}</span>
                    </div>
                  </div>
                )}
                {nspd.building.status && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Статус</span>
                      <span className="info-value">{nspd.building.status}</span>
                    </div>
                  </div>
                )}
                {nspd.building.registrationDate && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Дата регистрации</span>
                      <span className="info-value">{nspd.building.registrationDate}</span>
                    </div>
                  </div>
                )}
                {nspd.building.culturalHeritage && (
                  <div className="info-row info-row-small">
                    <div className="info-data">
                      <span className="info-label">Объект культурного наследия</span>
                      <span className="info-value">{nspd.building.culturalHeritage}</span>
                    </div>
                  </div>
                )}
              </>
            )}
            
          </div>
        )}

        {/* Отдельная секция для земельного участка */}
        {nspd && !isLoading && nspd.landPlot && (
          <div className="info-section">
            <div className="info-section-title">🌍 Земельный участок</div>
            
            {nspd.landPlot.cadastralNumber && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Кадастровый номер</span>
                  <CadastralNumber number={nspd.landPlot.cadastralNumber} type="land" />
                </div>
              </div>
            )}
            {nspd.landPlot.address && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Адрес</span>
                  <span className="info-value" style={{ fontSize: '0.85em' }}>{nspd.landPlot.address}</span>
                </div>
              </div>
            )}
            {nspd.landPlot.type && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Тип участка</span>
                  <span className="info-value">{nspd.landPlot.type}{nspd.landPlot.subtype ? ` (${nspd.landPlot.subtype})` : ''}</span>
                </div>
              </div>
            )}
            {nspd.landPlot.category && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Категория земель</span>
                  <span className="info-value">{nspd.landPlot.category}</span>
                </div>
              </div>
            )}
            {nspd.landPlot?.area && nspd.landPlot.area > 0 && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Площадь</span>
                  <span className="info-value">
                    {nspd.landPlot.area >= 10000 
                      ? `${(nspd.landPlot.area / 10000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} га (${nspd.landPlot.area.toLocaleString('ru-RU')} м²)`
                      : `${nspd.landPlot.area.toLocaleString('ru-RU')} м²`
                    }
                  </span>
                </div>
              </div>
            )}
            {nspd.landPlot.permittedUse && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Разрешённое использование</span>
                  <span className="info-value" style={{ fontSize: '0.85em' }}>{nspd.landPlot.permittedUse}</span>
                </div>
              </div>
            )}
            {nspd.landPlot?.cadastralCost && nspd.landPlot.cadastralCost > 0 && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Кадастровая стоимость</span>
                  <span className="info-value">{nspd.landPlot.cadastralCost.toLocaleString('ru-RU')} ₽</span>
                </div>
              </div>
            )}
            {nspd.landPlot.costDate && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Дата оценки</span>
                  <span className="info-value">{nspd.landPlot.costDate}</span>
                </div>
              </div>
            )}
            {nspd.landPlot.ownershipType && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Форма собственности</span>
                  <span className="info-value">{nspd.landPlot.ownershipType}</span>
                </div>
              </div>
            )}
            {nspd.landPlot.status && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Статус</span>
                  <span className="info-value">{nspd.landPlot.status}</span>
                </div>
              </div>
            )}
            {nspd.landPlot.registrationDate && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Дата регистрации</span>
                  <span className="info-value">{nspd.landPlot.registrationDate}</span>
                </div>
              </div>
            )}
            {nspd.landPlot.quarterCadNumber && (
              <div className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">Кадастровый квартал</span>
                  <span className="info-value">{nspd.landPlot.quarterCadNumber}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Организации в здании */}
        {organizations && organizations.length > 0 && !isLoading && (
          <div className="info-section">
            <div className="info-section-title">🏪 Организации ({organizations.length})</div>
            {organizations.slice(0, 5).map((org, i) => (
              <div key={i} className="info-row info-row-small">
                <div className="info-data">
                  <span className="info-label">{org.type || 'Организация'}</span>
                  <span className="info-value">{org.name}</span>
                </div>
              </div>
            ))}
            {organizations.length > 5 && (
              <div className="info-row info-row-small">
                <small>...и ещё {organizations.length - 5}</small>
              </div>
            )}
          </div>
        )}

        {/* Координаты */}
        {coordinates && !isLoading && (
          <div className="info-section info-section-footer">
            <div className="info-coords">
              <span className="info-coords-label">📍 Координаты:</span>
              <code>
                {coordinates.lat.toFixed(6)}, {coordinates.lon.toFixed(6)}
              </code>
            </div>
          </div>
        )}

        {/* Нет данных, но нет и ошибок */}
        {!hasData && !isLoading && errors.length === 0 && (
          <div className="info-empty">
            <span className="info-empty-icon">🔍</span>
            <p>Кликните на здание для просмотра информации</p>
          </div>
        )}

        {/* ID тайла (для отладки) */}
        {tileId && (
          <div className="info-section info-section-footer">
            <div className="info-id">
              <span className="info-id-label">Tile ID:</span>
              <code>{tileId}</code>
            </div>
          </div>
        )}
      </div>

      {/* Футер со статусом */}
      <div className="info-panel-footer">
        <div className="info-sources-status">
          <span 
            className={`info-source-badge ${osm ? 'success' : 'error'}`}
            title={osm ? 'Данные получены' : 'Данные не найдены'}
          >
            OSM {osm ? '✓' : '✗'}
          </span>
          <span 
            className={`info-source-badge ${nominatim ? 'success' : 'error'}`}
            title={nominatim ? 'Адрес определён' : 'Адрес не найден'}
          >
            Nominatim {nominatim ? '✓' : '✗'}
          </span>
          <span 
            className={`info-source-badge ${nspd?.building || nspd?.landPlot ? 'success' : 'error'}`}
            title={nspd?.building || nspd?.landPlot ? 'Кадастровые данные получены' : 'Кадастровые данные не найдены'}
          >
            НСПД {nspd?.building || nspd?.landPlot ? '✓' : '✗'}
          </span>
          {buildingData?.fromCache && (
            <span className="info-source-badge cached" title="Данные из кэша">
              📦 кэш
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(InfoPanel);
