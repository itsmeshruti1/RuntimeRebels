import { CROSS_CITY_WAREHOUSE_TEMPLATES, hydrateCrossCityTransportOptions } from '../data/networks';
import { CityNetwork, Warehouse } from '../types/recovery';

export interface ExtractedWarehouseRow {
  warehouseId?: string;
  warehouseName: string;
  city?: string;
  pincode?: string;
  totalProducts: number;
  processingCapacity?: number;
  status?: 'ACTIVE' | 'OUTAGE' | 'DEGRADED';
  lat?: number;
  lon?: number;
}

export interface WarehouseFileApplyResult {
  network: CityNetwork;
  aggregatedEntries: ExtractedWarehouseRow[];
  updatedWarehouses: string[];
  addedWarehouses: string[];
  totalProductUnits: number;
}

interface CityGeoAnchor {
  cityId: string;
  cityLabel: string;
  pincode: string;
  lat: number;
  lon: number;
  sourceFile: string;
}

const CITY_GEO_ANCHORS: CityGeoAnchor[] = [
  ...CROSS_CITY_WAREHOUSE_TEMPLATES.map((t) => ({
    cityId: t.cityId,
    cityLabel: t.cityLabel,
    pincode: t.pincode,
    lat: t.lat,
    lon: t.lon,
    sourceFile: t.sourceFile,
  })),
  { cityId: 'jaipur', cityLabel: 'Jaipur', pincode: '302001', lat: 26.9124, lon: 75.7873, sourceFile: 'northern-zone-261112.osm.pbf' },
  { cityId: 'lucknow', cityLabel: 'Lucknow', pincode: '226001', lat: 26.8467, lon: 80.9462, sourceFile: 'northern-zone-261112.osm.pbf' },
  { cityId: 'kochi', cityLabel: 'Kochi', pincode: '682001', lat: 9.9312, lon: 76.2673, sourceFile: 'southern-zone-261112.osm.pbf' },
  { cityId: 'indore', cityLabel: 'Indore', pincode: '452001', lat: 22.7196, lon: 75.8577, sourceFile: 'western-zone-261112.osm.pbf' },
  { cityId: 'surat', cityLabel: 'Surat', pincode: '395003', lat: 21.1702, lon: 72.8311, sourceFile: 'western-zone-261112.osm.pbf' },
  { cityId: 'nagpur', cityLabel: 'Nagpur', pincode: '440001', lat: 21.1458, lon: 79.0882, sourceFile: 'western-zone-261112.osm.pbf' },
  { cityId: 'patna', cityLabel: 'Patna', pincode: '800001', lat: 25.5941, lon: 85.1376, sourceFile: 'north-eastern-zone-261112.osm.pbf' },
  { cityId: 'chandigarh', cityLabel: 'Chandigarh', pincode: '160017', lat: 30.7333, lon: 76.7794, sourceFile: 'northern-zone-261112.osm.pbf' },
];

const PIN_PREFIX_CITY_MAP: { prefix: string; cityId: string }[] = [
  { prefix: '560', cityId: 'bengaluru' },
  { prefix: '400', cityId: 'mumbai' },
  { prefix: '410', cityId: 'pune' },
  { prefix: '411', cityId: 'pune' },
  { prefix: '110', cityId: 'delhi_ncr' },
  { prefix: '122', cityId: 'delhi_ncr' },
  { prefix: '201', cityId: 'delhi_ncr' },
  { prefix: '600', cityId: 'chennai' },
  { prefix: '602', cityId: 'chennai' },
  { prefix: '781', cityId: 'guwahati' },
  { prefix: '500', cityId: 'hyderabad' },
  { prefix: '501', cityId: 'hyderabad' },
  { prefix: '700', cityId: 'kolkata' },
  { prefix: '712', cityId: 'kolkata' },
  { prefix: '380', cityId: 'ahmedabad' },
  { prefix: '382', cityId: 'ahmedabad' },
  { prefix: '302', cityId: 'jaipur' },
  { prefix: '226', cityId: 'lucknow' },
  { prefix: '682', cityId: 'kochi' },
  { prefix: '452', cityId: 'indore' },
  { prefix: '395', cityId: 'surat' },
  { prefix: '440', cityId: 'nagpur' },
  { prefix: '800', cityId: 'patna' },
  { prefix: '160', cityId: 'chandigarh' },
];

function normalizeToken(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeId(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function sanitizeCount(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  }
  const cleaned = String(raw ?? '')
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function normalizeStatus(raw: unknown): 'ACTIVE' | 'OUTAGE' | 'DEGRADED' | undefined {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return undefined;
  if (s.includes('OUT') || s.includes('OFF') || s.includes('CLOSED') || s.includes('DOWN')) return 'OUTAGE';
  if (s.includes('DEG') || s.includes('PARTIAL') || s.includes('WARN')) return 'DEGRADED';
  if (s.includes('ACT') || s.includes('OK') || s.includes('UP') || s.includes('OPEN')) return 'ACTIVE';
  return undefined;
}

/**
 * Aggregates warehouse rows across product types/SKUs so that any product breakdown
 * is ignored and only the summed total count of products available at each warehouse is kept.
 */
export function aggregateWarehouseCounts(rows: ExtractedWarehouseRow[]): ExtractedWarehouseRow[] {
  const grouped = new Map<string, ExtractedWarehouseRow>();

  for (const raw of rows) {
    const name = String(raw.warehouseName || raw.warehouseId || '').trim();
    const id = raw.warehouseId ? String(raw.warehouseId).trim() : '';
    if (!name && !id) continue;

    const normId = normalizeId(id);
    const normName = normalizeToken(name);
    const pin = String(raw.pincode || '').replace(/\D/g, '').slice(0, 6);
    const key = normId ? `id:${normId}` : `name:${normName || name.toLowerCase()}::${pin}`;

    const units = sanitizeCount(raw.totalProducts);
    const cap =
      raw.processingCapacity !== undefined && raw.processingCapacity !== null
        ? sanitizeCount(raw.processingCapacity)
        : undefined;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        warehouseId: id || undefined,
        warehouseName: name || id,
        city: raw.city ? String(raw.city).trim() : undefined,
        pincode: pin || undefined,
        totalProducts: units,
        processingCapacity: cap && cap > 0 ? cap : undefined,
        status: raw.status ? normalizeStatus(raw.status) : undefined,
        lat: typeof raw.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : undefined,
        lon: typeof raw.lon === 'number' && Number.isFinite(raw.lon) ? raw.lon : undefined,
      });
    } else {
      existing.totalProducts += units;
      if (!existing.warehouseId && id) existing.warehouseId = id;
      if (!existing.city && raw.city) existing.city = String(raw.city).trim();
      if (!existing.pincode && pin) existing.pincode = pin;
      if (cap && cap > 0) {
        existing.processingCapacity = Math.max(existing.processingCapacity || 0, cap);
      }
      if (raw.status && !existing.status) existing.status = normalizeStatus(raw.status);
    }
  }

  return Array.from(grouped.values());
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  for (const alias of aliases) {
    const exact = normalizedHeaders.indexOf(alias);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const partial = normalizedHeaders.findIndex((h) => h.includes(alias));
    if (partial >= 0) return partial;
  }
  return -1;
}

/**
 * Parses CSV/TSV text containing warehouse & product rows.
 * Any product type/SKU columns are ignored; counts are summed per warehouse.
 */
export function parseWarehouseCsvText(csvText: string): ExtractedWarehouseRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);

  const idIdx = findColumnIndex(headers, [
    'warehouse_id',
    'warehouseid',
    'wh_id',
    'hub_id',
    'node_id',
    'warehouse_code',
    'code',
    'id',
  ]);
  const nameIdx = findColumnIndex(headers, [
    'warehouse_name',
    'warehousename',
    'warehouse',
    'hub_name',
    'hub',
    'facility',
    'depot',
    'site',
    'name',
  ]);
  const countIdx = findColumnIndex(headers, [
    'total_products',
    'totalproducts',
    'total_count',
    'product_count',
    'available_products',
    'available_units',
    'available_stock',
    'inventory',
    'stock',
    'quantity',
    'qty',
    'count',
    'units',
    'available',
    'total',
  ]);
  const cityIdx = findColumnIndex(headers, ['city', 'city_id', 'cityid', 'location', 'region', 'zone']);
  const pinIdx = findColumnIndex(headers, ['pincode', 'pin_code', 'pin', 'postal_code', 'postal', 'zip']);
  const capIdx = findColumnIndex(headers, [
    'processing_capacity',
    'processingcapacity',
    'handling_capacity',
    'capacity',
    'cap',
  ]);
  const statusIdx = findColumnIndex(headers, ['status', 'state']);
  const latIdx = findColumnIndex(headers, ['lat', 'latitude']);
  const lonIdx = findColumnIndex(headers, ['lon', 'lng', 'longitude']);

  if (countIdx < 0 || (nameIdx < 0 && idIdx < 0)) {
    return [];
  }

  const rawRows: ExtractedWarehouseRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    const idVal = idIdx >= 0 ? cols[idIdx]?.trim() : '';
    const nameVal = nameIdx >= 0 ? cols[nameIdx]?.trim() : idVal;
    if (!nameVal && !idVal) continue;

    const totalProducts = sanitizeCount(cols[countIdx]);
    const capVal = capIdx >= 0 && cols[capIdx] ? sanitizeCount(cols[capIdx]) : undefined;
    const latVal = latIdx >= 0 && cols[latIdx] ? Number(cols[latIdx]) : undefined;
    const lonVal = lonIdx >= 0 && cols[lonIdx] ? Number(cols[lonIdx]) : undefined;

    rawRows.push({
      warehouseId: idVal || undefined,
      warehouseName: nameVal || idVal,
      city: cityIdx >= 0 ? cols[cityIdx]?.trim() || undefined : undefined,
      pincode: pinIdx >= 0 ? cols[pinIdx]?.trim() || undefined : undefined,
      totalProducts,
      processingCapacity: capVal && capVal > 0 ? capVal : undefined,
      status: statusIdx >= 0 ? normalizeStatus(cols[statusIdx]) : undefined,
      lat: latVal !== undefined && Number.isFinite(latVal) ? latVal : undefined,
      lon: lonVal !== undefined && Number.isFinite(lonVal) ? lonVal : undefined,
    });
  }

  return aggregateWarehouseCounts(rawRows);
}

function resolveCityGeo(
  entry: ExtractedWarehouseRow,
  fallbackNetwork: CityNetwork,
  newIndex: number
): { cityId: string; lat: number; lon: number; pincode: string; sourceFile: string } {
  const cityToken = normalizeToken(entry.city || entry.warehouseName);
  const pin = String(entry.pincode || '').replace(/\D/g, '').slice(0, 6);

  for (const anchor of CITY_GEO_ANCHORS) {
    const anchorCity = normalizeToken(anchor.cityLabel);
    const anchorId = normalizeToken(anchor.cityId);
    if (
      cityToken &&
      (cityToken === anchorCity ||
        cityToken === anchorId ||
        cityToken.includes(anchorCity) ||
        anchorCity.includes(cityToken))
    ) {
      return {
        cityId: anchor.cityId,
        lat: entry.lat ?? anchor.lat,
        lon: entry.lon ?? anchor.lon,
        pincode: pin || anchor.pincode,
        sourceFile: anchor.sourceFile,
      };
    }
  }

  if (pin.length >= 3) {
    const prefixMatch = PIN_PREFIX_CITY_MAP.find((p) => pin.startsWith(p.prefix));
    if (prefixMatch) {
      const anchor = CITY_GEO_ANCHORS.find((a) => a.cityId === prefixMatch.cityId);
      if (anchor) {
        return {
          cityId: anchor.cityId,
          lat: entry.lat ?? anchor.lat,
          lon: entry.lon ?? anchor.lon,
          pincode: pin,
          sourceFile: anchor.sourceFile,
        };
      }
    }
  }

  const refWh = fallbackNetwork.warehouses[0];
  const baseLat = refWh?.lat ?? (fallbackNetwork.bbox[1] + fallbackNetwork.bbox[3]) / 2;
  const baseLon = refWh?.lon ?? (fallbackNetwork.bbox[0] + fallbackNetwork.bbox[2]) / 2;
  const angle = (newIndex * 1.15) % (Math.PI * 2);
  const offset = 0.045;

  return {
    cityId: cityToken ? cityToken.replace(/\s+/g, '_') : fallbackNetwork.cityId,
    lat: entry.lat ?? Math.round((baseLat + Math.sin(angle) * offset) * 10000) / 10000,
    lon: entry.lon ?? Math.round((baseLon + Math.cos(angle) * offset) * 10000) / 10000,
    pincode: pin || refWh?.pincode || '560001',
    sourceFile: 'uploaded-warehouse-file',
  };
}

function findMatchingWarehouseIndex(
  warehouses: Warehouse[],
  entry: ExtractedWarehouseRow
): number {
  const entryId = normalizeId(entry.warehouseId);
  if (entryId) {
    const byExactId = warehouses.findIndex((w) => normalizeId(w.id) === entryId);
    if (byExactId >= 0) return byExactId;

    // Match short codes like W1 -> BLR-W1 when unique
    const suffixMatches = warehouses
      .map((w, idx) => ({ w, idx }))
      .filter(({ w }) => normalizeId(w.id).endsWith(entryId));
    if (suffixMatches.length === 1) return suffixMatches[0].idx;
  }

  const entryName = normalizeToken(entry.warehouseName);
  if (entryName) {
    const byExactName = warehouses.findIndex((w) => normalizeToken(w.name) === entryName);
    if (byExactName >= 0) return byExactName;

    const byNameId = warehouses.findIndex((w) => normalizeId(w.id) === normalizeId(entry.warehouseName));
    if (byNameId >= 0) return byNameId;

    const tokenMatches = warehouses
      .map((w, idx) => ({ norm: normalizeToken(w.name), idx }))
      .filter(({ norm }) => norm.includes(entryName) || entryName.includes(norm));
    if (tokenMatches.length === 1) return tokenMatches[0].idx;
  }

  const pin = String(entry.pincode || '').replace(/\D/g, '').slice(0, 6);
  if (pin.length === 6) {
    const pinMatches = warehouses
      .map((w, idx) => ({ w, idx }))
      .filter(({ w }) => w.pincode === pin);
    if (pinMatches.length === 1) return pinMatches[0].idx;
  }

  return -1;
}

/**
 * Updates existing warehouses or attaches newly discovered warehouses from an uploaded
 * file (PDF, CSV, or Image) using only aggregated total product counts per warehouse.
 */
export function applyImportedWarehousesToNetwork(
  network: CityNetwork,
  rawEntries: ExtractedWarehouseRow[],
  sourceFileName: string
): WarehouseFileApplyResult {
  const aggregatedEntries = aggregateWarehouseCounts(rawEntries);
  const nextWarehouses = network.warehouses.map((w) => ({ ...w }));
  const updatedWarehouses: string[] = [];
  const addedWarehouses: string[] = [];
  let totalProductUnits = 0;

  aggregatedEntries.forEach((entry, idx) => {
    totalProductUnits += entry.totalProducts;
    const matchIdx = findMatchingWarehouseIndex(nextWarehouses, entry);

    if (matchIdx >= 0) {
      const target = nextWarehouses[matchIdx];
      const nextCap = Math.min(
        entry.totalProducts,
        entry.processingCapacity && entry.processingCapacity > 0
          ? entry.processingCapacity
          : target.processingCapacity
      );
      nextWarehouses[matchIdx] = {
        ...target,
        inventory: entry.totalProducts,
        processingCapacity: nextCap,
        status: entry.status || target.status,
        provenance: {
          ...target.provenance,
          operations: {
            ...target.provenance.operations,
            classification: 'Sourced',
            sourceFile: sourceFileName,
            assumptions: `Total available products (${entry.totalProducts}) synced from ${sourceFileName}; product types ignored`,
          },
        },
      };
      updatedWarehouses.push(`${target.id} (${entry.totalProducts})`);
    } else {
      const geo = resolveCityGeo(entry, network, idx);
      const prefix = geo.cityId.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X') || 'IMP';
      let nextId = entry.warehouseId?.trim() || `${prefix}-IMP-${idx + 1}`;
      const usedIds = new Set(nextWarehouses.map((w) => w.id));
      let suffix = 2;
      while (usedIds.has(nextId)) {
        nextId = `${prefix}-IMP-${idx + suffix}`;
        suffix++;
      }

      const defaultCap = Math.min(
        entry.totalProducts,
        entry.processingCapacity && entry.processingCapacity > 0
          ? entry.processingCapacity
          : Math.max(40, Math.min(350, Math.round(entry.totalProducts * 0.6)))
      );

      const added: Warehouse = {
        id: nextId,
        name: entry.warehouseName.includes(nextId)
          ? entry.warehouseName
          : `${entry.warehouseName} (${nextId})`,
        cityId: geo.cityId,
        pincode: geo.pincode,
        lat: geo.lat,
        lon: geo.lon,
        snappedNodeId: `osm-imp-${geo.cityId}-${nextId.toLowerCase()}`,
        inventory: entry.totalProducts,
        processingCapacity: defaultCap,
        status: entry.status || 'ACTIVE',
        provenance: {
          coordinates: {
            classification: 'Sourced',
            sourceFile: `${sourceFileName} + ${geo.sourceFile}`,
            bbox: network.bbox,
            snappingToleranceMeters: 35,
            datasetVersion: 'v2.6.0-file-import',
          },
          operations: {
            classification: 'Sourced',
            sourceFile: sourceFileName,
            assumptions: `Total available products (${entry.totalProducts}) imported from ${sourceFileName}; product types ignored`,
            datasetVersion: 'v2.6.0-file-import',
          },
        },
      };
      nextWarehouses.push(added);
      addedWarehouses.push(`${added.id} (${entry.totalProducts})`);
    }
  });

  const hydrated = hydrateCrossCityTransportOptions({
    ...network,
    warehouses: nextWarehouses,
  });

  return {
    network: hydrated,
    aggregatedEntries,
    updatedWarehouses,
    addedWarehouses,
    totalProductUnits,
  };
}
