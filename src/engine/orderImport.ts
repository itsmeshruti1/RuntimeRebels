import type { CityNetwork, CustomerOrder } from '../types/recovery';
import { modelRoute } from './routes';
import { validateNetwork } from './validation';

export const orderColumns = [
  'id',
  'customerName',
  'pincode',
  'lat',
  'lon',
  'quantity',
  'deadlineHours',
  'priority',
  'baselineWarehouseId',
];

function readRows(text: string) {
  const rows: { line: number; fields: string[] }[] = [];
  let line = 1,
    start = 1,
    field = '',
    fields: string[] = [],
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === undefined) throw new Error(`Row ${start}: unclosed quotation mark.`);
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else {
        field += c;
        if (c === '\n') line++;
      }
    } else if (c === ',' || c === '\n' || c === undefined) {
      fields.push(field.trim());
      field = '';
      closed = false;
      if (c !== ',') {
        if (fields.length > 1 || fields[0]) rows.push({ line: start, fields });
        fields = [];
        start = ++line;
      }
    } else if (c === '"' && !field && !closed) {
      quoted = true;
    } else {
      if (closed || c === '"') throw new Error(`Row ${start}: invalid quoted field.`);
      field += c;
    }
  }
  return rows;
}

export function importOrders(network: CityNetwork, text: string, filename: string): CityNetwork {
  const params = network.routeAssumptions;
  if (!params) {
    throw new Error('Set route assumptions in Disruption Simulator before importing new delivery sites.');
  }
  const [header, ...rows] = readRows(text);
  if (
    !header ||
    orderColumns.some((c) => !header.fields.includes(c)) ||
    new Set(header.fields).size !== header.fields.length
  ) {
    throw new Error('Row 1: expected unique columns including ' + orderColumns.join(', '));
  }
  if (!rows.length) throw new Error('The CSV contains no order rows.');
  const ids = new Set(network.orders.map((o) => o.id));
  const errors: string[] = [],
    added: CustomerOrder[] = [];
  const hubs = new Set(network.warehouses.map((w) => w.id));
  const source = {
    classification: 'Sourced' as const,
    sourceFile: filename,
    datasetVersion: network.schemaVersion,
  };
  for (const { line, fields } of rows) {
    const row = Object.fromEntries(header.fields.map((key, i) => [key, fields[i]]));
    const lat = Number(row.lat),
      lon = Number(row.lon),
      quantity = Number(row.quantity),
      deadlineHours = Number(row.deadlineHours);
    const issues: string[] = [];
    if (fields.length !== header.fields.length || orderColumns.some((c) => !row[c])) {
      issues.push('missing or extra fields');
    }
    if (ids.has(row.id)) issues.push('duplicate order ID ' + row.id);
    ids.add(row.id);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
      issues.push('invalid coordinates');
    }
    if (!(quantity > 0 && Number.isFinite(quantity) && deadlineHours > 0 && Number.isFinite(deadlineHours))) {
      issues.push('quantity and deadline must be positive numbers');
    }
    const priority = row.priority?.toUpperCase();
    if (priority !== 'STANDARD' && priority !== 'CRITICAL') {
      issues.push('priority must be STANDARD or CRITICAL');
    }
    if (!hubs.has(row.baselineWarehouseId)) {
      issues.push('unknown baseline warehouse ' + row.baselineWarehouseId);
    }
    if (issues.length) {
      errors.push(`Row ${line}: ${issues.join(', ')}`);
      continue;
    }
    added.push({
      id: row.id,
      customerName: row.customerName,
      pincode: row.pincode,
      lat,
      lon,
      quantity,
      deadlineHours,
      priority: priority as CustomerOrder['priority'],
      baselineWarehouseId: row.baselineWarehouseId,
      cityId: network.cityId,
      snappedNodeId: '',
      provenance: { coordinates: source, demand: source },
    });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const routes = added.flatMap((o) =>
    network.warehouses.map((w) => ({
      id: `TR-${w.id}-${o.id}`,
      warehouseId: w.id,
      orderId: o.id,
      available: true,
      ...modelRoute(w, o, params, network.schemaVersion),
    })),
  );
  const updated = {
    ...network,
    orders: [...network.orders, ...added],
    transportOptions: [...network.transportOptions, ...routes],
  };
  validateNetwork(updated);
  return updated;
}
