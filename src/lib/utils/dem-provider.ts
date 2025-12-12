import path from 'path';

import proj4 from 'proj4';
import { fromFile, type GeoTIFF, type GeoTIFFImage } from 'geotiff';

type DemName = 'Kanash' | 'Krasnoarmeiskoe';

const DEM_FILES: Record<DemName, string> = {
  Kanash: 'data/terrain/dem_UTM_Kanash.tif',
  Krasnoarmeiskoe: 'data/terrain/dem_UTM_Krasnoarmeiskoe.tif',
};

type DemDataset = {
  image: GeoTIFFImage;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY] в проекции DEM
  width: number;
  height: number;
  epsg: number | null;
  projDef: string;
  noData: number | null;
};

const demCache = new Map<DemName, Promise<DemDataset>>();

function ensureProjDef(epsg: number | null): string {
  if (!epsg) {
    const fallback = 'EPSG:32638';
    if (!proj4.defs(fallback)) {
      proj4.defs(fallback, '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs');
    }
    return fallback;
  }

  const code = `EPSG:${epsg}`;
  if (proj4.defs(code)) return code;

  if (epsg >= 32601 && epsg <= 32660) {
    const zone = epsg - 32600;
    proj4.defs(code, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`);
    return code;
  }

  if (epsg >= 32701 && epsg <= 32760) {
    const zone = epsg - 32700;
    proj4.defs(code, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`);
    return code;
  }

  // Если проекция нестандартная и нет defs — попробуем использовать как есть.
  return code;
}

async function loadDem(name: DemName): Promise<DemDataset> {
  const filePath = path.join(process.cwd(), DEM_FILES[name]);
  const tiff: GeoTIFF = await fromFile(filePath);
  const image = await tiff.getImage();

  const bbox = image.getBoundingBox() as [number, number, number, number];
  const width = image.getWidth();
  const height = image.getHeight();
  const geoKeys = image.getGeoKeys();

  const epsgRaw =
    (geoKeys.ProjectedCSTypeGeoKey as number | undefined) ??
    (geoKeys.GeographicTypeGeoKey as number | undefined);

  const epsg = typeof epsgRaw === 'number' && epsgRaw > 0 ? epsgRaw : null;
  const projDef = ensureProjDef(epsg);

  let noData: number | null = null;
  try {
    const nd = image.getGDALNoData?.();
    if (nd !== undefined && nd !== null) noData = Number(nd);
  } catch {
    noData = null;
  }

  return { image, bbox, width, height, epsg, projDef, noData };
}

async function getDataset(name: DemName): Promise<DemDataset> {
  const cached = demCache.get(name);
  if (cached) return cached;
  const p = loadDem(name);
  demCache.set(name, p);
  return p;
}

/**
 * Возвращает высоту из DEM по lon/lat (EPSG:4326).
 * Если точка вне DEM или noData — возвращает null.
 */
export async function getDemHeight(
  name: DemName,
  lon: number,
  lat: number
): Promise<number | null> {
  const ds = await getDataset(name);

  const [x, y] = proj4('EPSG:4326', ds.projDef, [lon, lat]) as [number, number];

  const [minX, minY, maxX, maxY] = ds.bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return null;

  const colF = ((x - minX) / (maxX - minX)) * ds.width;
  const rowF = ((maxY - y) / (maxY - minY)) * ds.height;

  const col = Math.floor(colF);
  const row = Math.floor(rowF);

  if (col < 0 || col >= ds.width || row < 0 || row >= ds.height) return null;

  const rasters = await ds.image.readRasters({
    window: [col, row, col + 1, row + 1],
    width: 1,
    height: 1,
    samples: [0],
    interleave: true,
  });

  // При interleave=true возвращается TypedArray; иначе — массив TypedArray по бэндам.
  const firstValue = Array.isArray(rasters)
    ? (rasters[0] as unknown as ArrayLike<number>)[0]
    : (rasters as unknown as ArrayLike<number>)[0];
  const heightValue = Number(firstValue);

  if (!Number.isFinite(heightValue)) return null;
  if (ds.noData !== null && heightValue === ds.noData) return null;

  return heightValue;
}

export type { DemName };
