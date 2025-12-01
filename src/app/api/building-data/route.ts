/**
 * API Route для получения данных о здании
 * Источники: OSM Overpass + Nominatim + НСПД Росреестр
 */

import { NextRequest, NextResponse } from 'next/server';

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

let lastOSMTime = 0;
let lastNominatimTime = 0;
let lastNSPDTime = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get('source');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const radius = parseInt(searchParams.get('radius') || '30', 10);

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Требуются параметры: lat, lon' }, { status: 400 });
  }

  const cacheKey = `${source || 'all'}:${lat}:${lon}:${radius}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...(cached.data as object), cached: true });
  }

  try {
    let data;
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (source === 'osm') {
      data = await fetchOSM(latNum, lonNum, radius);
    } else if (source === 'nominatim') {
      data = await fetchNominatim(latNum, lonNum);
    } else if (source === 'nspd') {
      data = await fetchNSPD(latNum, lonNum);
    } else {
      // Параллельно все источники с retry до успеха
      const [osm, nominatim, nspd] = await Promise.all([
        fetchWithRetry(() => fetchOSM(latNum, lonNum, radius)),
        fetchWithRetry(() => fetchNominatim(latNum, lonNum)),
        fetchWithRetry(() => fetchNSPD(latNum, lonNum)),
      ]);
      data = { source: 'all', success: osm.success || nominatim.success || nspd.success, osm, nominatim, nspd };
    }

    if (data.success) cache.set(cacheKey, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ source, success: false, error: (error as Error).message });
  }
}

// Retry wrapper - повторяет пока не загрузится (макс 10 попыток)
async function fetchWithRetry<T extends { success: boolean }>(fn: () => Promise<T>, maxRetries = 10): Promise<T> {
  let lastResult: T | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      lastResult = await fn();
      if (lastResult.success) return lastResult;
      // Не успех - повторяем
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 300 * (i + 1)));
    } catch (e) {
      console.error(`Retry ${i + 1}/${maxRetries} failed:`, (e as Error).message);
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  return lastResult || ({ success: false, error: 'Max retries exceeded' } as T);
}

// OSM Overpass API
async function fetchOSM(lat: number, lon: number, radius: number) {
  const now = Date.now();
  if (now - lastOSMTime < 1000) await new Promise(r => setTimeout(r, 1000 - (now - lastOSMTime)));
  lastOSMTime = Date.now();

  const query = `
    [out:json][timeout:10];
    (
      way["building"](around:${radius},${lat},${lon});
      node["addr:housenumber"](around:${radius},${lat},${lon});
      node["shop"](around:${radius},${lat},${lon});
      node["amenity"](around:${radius},${lat},${lon});
      node["office"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const elements = data.elements || [];
    const buildings = elements.filter((e: OSMElement) => e.tags?.building);
    const addresses = elements.filter((e: OSMElement) => e.tags?.['addr:housenumber']);
    const pois = elements.filter((e: OSMElement) => e.tags?.name && (e.tags?.shop || e.tags?.amenity || e.tags?.office));

    return { source: 'osm', success: elements.length > 0, buildings, addresses, pois, count: elements.length };
  } catch (e) {
    return { source: 'osm', success: false, error: (e as Error).message, buildings: [], addresses: [], pois: [] };
  }
}

// Nominatim reverse geocoding
async function fetchNominatim(lat: number, lon: number) {
  const now = Date.now();
  if (now - lastNominatimTime < 1000) await new Promise(r => setTimeout(r, 1000 - (now - lastNominatimTime)));
  lastNominatimTime = Date.now();

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { 'User-Agent': 'GeoStack/1.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { source: 'nominatim', success: !!data.address, displayName: data.display_name, address: data.address, type: data.type };
  } catch (e) {
    return { source: 'nominatim', success: false, error: (e as Error).message };
  }
}

// НСПД Росреестр WMS
async function fetchNSPD(lat: number, lon: number) {
  const now = Date.now();
  if (now - lastNSPDTime < 300) await new Promise(r => setTimeout(r, 300 - (now - lastNSPDTime)));
  lastNSPDTime = Date.now();

  const x = lon * 20037508.34 / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 20037508.34 / Math.PI;
  const r = 50, bbox = `${x-r},${y-r},${x+r},${y+r}`;

  const headers = { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://nspd.gov.ru', 'Referer': 'https://nspd.gov.ru/map' };
  const buildUrl = (layer: number) =>
    `https://nspd.gov.ru/api/aeggis/v3/${layer}/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}&INFO_FORMAT=application/json&FEATURE_COUNT=1&I=128&J=128&WIDTH=256&HEIGHT=256&CRS=EPSG:3857&BBOX=${bbox}&STYLES=&FORMAT=image/png`;

  try {
    const [bRes, lRes] = await Promise.all([
      fetch(buildUrl(36049), { headers, signal: AbortSignal.timeout(8000) }),
      fetch(buildUrl(36048), { headers, signal: AbortSignal.timeout(8000) }),
    ]);

    let building = null, landPlot = null;
    if (bRes.ok) { const d = await bRes.json(); if (d.features?.[0]) building = parseBuilding(d.features[0]); }
    if (lRes.ok) { const d = await lRes.json(); if (d.features?.[0]) landPlot = parseLandPlot(d.features[0]); }

    return { source: 'nspd', success: !!(building || landPlot), building, landPlot };
  } catch (e) {
    return { source: 'nspd', success: false, error: (e as Error).message, building: null, landPlot: null };
  }
}

interface OSMElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
}

function parseBuilding(f: { properties?: { label?: string; options?: Record<string, unknown> } }) {
  const o = f.properties?.options || {};
  return {
    cadastralNumber: String(o.cad_num || f.properties?.label || ''),
    address: String(o.readable_address || ''),
    name: String(o.building_name || ''),
    buildingType: String(o.build_record_type_value || ''),
    purpose: String(o.purpose || ''),
    area: Number(o.build_record_area || 0),
    floors: Number(o.floors || 0),
    undergroundFloors: Number(o.underground_floors || 0),
    yearBuilt: Number(o.year_built || 0),
    materials: String(o.materials || ''),
    cadastralCost: Number(o.cost_value || 0),
    costDate: String(o.cost_determination_date || ''),
    ownershipType: String(o.ownership_type || ''),
    status: String(o.status || ''),
  };
}

function parseLandPlot(f: { properties?: { label?: string; options?: Record<string, unknown> } }) {
  const o = f.properties?.options || {};
  return {
    cadastralNumber: String(o.cad_num || f.properties?.label || ''),
    address: String(o.readable_address || ''),
    category: String(o.land_record_category_type || ''),
    area: Number(o.land_record_area || o.specified_area || 0),
    permittedUse: String(o.permitted_use_established_by_document || ''),
    cadastralCost: Number(o.cost_value || 0),
    ownershipType: String(o.ownership_type || ''),
    status: String(o.status || ''),
  };
}
