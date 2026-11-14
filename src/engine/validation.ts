import type { CityNetwork, PlannerConfig } from '../types/recovery';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function money(value: unknown): boolean {
  return (
    nonnegative(value) &&
    Number.isSafeInteger(Math.round(value * 100)) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}

function string(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function rows(value: unknown, name: string) {
  if (!Array.isArray(value) || !value.every(record)) {
    throw new Error(`Expected ${name} array of objects.`);
  }
  return value as Record<string, unknown>[];
}

function entities(value: unknown, name: string) {
  const items = rows(value, name);
  const ids = new Set<string>();
  for (const item of items) {
    if (!string(item.id) || ids.has(item.id)) {
      throw new Error(`Missing or duplicate ID in ${name}.`);
    }
    ids.add(item.id);
  }
  return { items, ids };
}

function requireFields(row: Record<string, unknown>, strings: string[], numbers: string[]) {
  for (const key of strings) {
    if (!string(row[key])) throw new Error(`Invalid ${key} on ${row.id ?? 'network'}.`);
  }
  for (const key of numbers) {
    if (!nonnegative(row[key])) throw new Error(`Invalid ${key} on ${row.id ?? 'network'}.`);
  }
}

function checkSite(
  row: Record<string, unknown>,
  cityId: unknown,
  provenanceKey: string,
  allowCrossCity: boolean,
) {
  requireFields(row, ['pincode', 'cityId'], []);
  if (
    (!allowCrossCity && row.cityId !== cityId) ||
    typeof row.lat !== 'number' ||
    !Number.isFinite(row.lat) ||
    Math.abs(row.lat) > 90 ||
    typeof row.lon !== 'number' ||
    !Number.isFinite(row.lon) ||
    Math.abs(row.lon) > 180
  ) {
    throw new Error(`Invalid city or coordinates on ${row.id}.`);
  }
  if (
    !record(row.provenance) ||
    !record(row.provenance.coordinates) ||
    !record(row.provenance[provenanceKey]) ||
    !string(row.provenance[provenanceKey].classification) ||
    !string(row.provenance.coordinates.classification)
  ) {
    throw new Error(`Missing provenance on ${row.id}.`);
  }
}

export function validateNetwork(value: unknown): asserts value is CityNetwork {
  if (!record(value)) throw new Error('A network object is required.');
  requireFields(
    value,
    ['cityId', 'name', 'regionZone', 'schemaVersion'],
    ['seed', 'planningHorizonHours', 'defaultModeledSpeedKmh', 'defaultHandlingDelayHours'],
  );
  if (!Array.isArray(value.bbox) || value.bbox.length !== 4 || !value.bbox.every(Number.isFinite)) {
    throw new Error('Expected four bounding box coordinates.');
  }
  if (value.routeAssumptions !== undefined) {
    const p = value.routeAssumptions;
    if (!record(p)) throw new Error('Invalid route assumptions.');
    requireFields(p, [], ['circuity', 'speedKmh', 'handlingHours', 'dispatchFee', 'pricePerKm', 'reassignmentFee']);
    if (Number(p.circuity) < 1 || Number(p.speedKmh) <= 0) {
      throw new Error('Invalid circuity or route speed.');
    }
  }
  const isMultiCity = value.cityId === 'multi_city';
  const hubs = entities(value.warehouses, 'warehouses');
  if (!hubs.items.length) throw new Error('At least one warehouse is required.');
  for (const w of hubs.items) {
    // Allow cross-city warehouses attached to regional networks or multi-city hubs
    checkSite(w, value.cityId, 'operations', true);
    requireFields(w, ['name'], ['inventory', 'processingCapacity']);
    if (Number(w.processingCapacity) > Number(w.inventory)) {
      throw new Error(
        `Warehouse ${w.id}: base capacity (${w.processingCapacity}) cannot exceed inventory (${w.inventory}).`,
      );
    }
    if (!['ACTIVE', 'OUTAGE', 'DEGRADED'].includes(String(w.status))) {
      throw new Error(`Invalid status on ${w.id}.`);
    }
  }
  const orders = entities(value.orders, 'orders');
  for (const o of orders.items) {
    checkSite(o, value.cityId, 'demand', isMultiCity);
    requireFields(o, ['customerName'], ['quantity', 'deadlineHours']);
    if (
      !o.quantity ||
      !o.deadlineHours ||
      !hubs.ids.has(String(o.baselineWarehouseId)) ||
      !['CRITICAL', 'STANDARD'].includes(String(o.priority))
    ) {
      throw new Error(`Invalid order ${o.id}.`);
    }
  }
  const routes = entities(value.transportOptions, 'transportOptions');
  const pairs = new Set<string>();
  const aliases = new Set<string>();
  for (const t of routes.items) {
    requireFields(t, ['warehouseId', 'orderId'], ['roadDistanceKm', 'estimatedTimeHours', 'pricePerOrder']);
    if (!money(t.pricePerOrder)) {
      throw new Error(`Route price must be in whole paise on ${t.id}.`);
    }
    const key = JSON.stringify([t.warehouseId, t.orderId]);
    if (
      !hubs.ids.has(String(t.warehouseId)) ||
      !orders.ids.has(String(t.orderId)) ||
      pairs.has(key) ||
      typeof t.available !== 'boolean'
    ) {
      throw new Error(`Invalid or duplicate warehouse/order route ${t.id}.`);
    }
    pairs.add(key);
    aliases.add(`${t.warehouseId}->${t.orderId}`);
  }
  for (const i of entities(value.interventions, 'interventions').items) {
    requireFields(
      i,
      ['name', 'affectedResourceId'],
      ['activationPrice', 'inventoryDelta', 'capacityDelta', 'timeReductionHours', 'leadTimeHours'],
    );
    if (
      !money(i.activationPrice) ||
      !(hubs.ids.has(String(i.affectedResourceId)) || routes.ids.has(String(i.affectedResourceId))) ||
      !['EMERGENCY_STOCK', 'HANDLING_CAPACITY', 'TRANSPORT_CORRIDOR'].includes(String(i.type)) ||
      typeof i.eligible !== 'boolean' ||
      typeof i.restoresRoute !== 'boolean'
    ) {
      throw new Error(`Invalid intervention ${i.id}.`);
    }
  }
  for (const d of entities(value.disruptions, 'disruptions').items) {
    requireFields(d, ['label', 'targetId'], ['severityPct']);
    const target = String(d.targetId);
    if (
      typeof d.active !== 'boolean' ||
      Number(d.severityPct) > 100 ||
      !['WAREHOUSE_OUTAGE', 'CAPACITY_REDUCTION', 'INVENTORY_SHORTAGE', 'ROUTE_CLOSURE'].includes(String(d.type)) ||
      !(d.type === 'ROUTE_CLOSURE' ? routes.ids.has(target) || aliases.has(target) : hubs.ids.has(target))
    ) {
      throw new Error(`Invalid disruption ${d.id}.`);
    }
  }
  for (const audit of rows(value.sourceAudits, 'sourceAudits')) {
    requireFields(audit, ['specFilename', 'remoteUrl', 'status'], []);
    if (
      !/^https?:\/\//i.test(String(audit.remoteUrl)) ||
      !Array.isArray(audit.coveredRegions) ||
      !audit.coveredRegions.every(string)
    ) {
      throw new Error('Invalid source audit reference.');
    }
  }
}

export function validateConfig(config: PlannerConfig, net: CityNetwork) {
  if (
    !nonnegative(config.targetServicePct) ||
    config.targetServicePct > 100 ||
    !money(config.availableBudget) ||
    typeof config.protectCriticalOrders !== 'boolean' ||
    (config.timeoutMs !== undefined && (!nonnegative(config.timeoutMs) || !config.timeoutMs)) ||
    !Array.isArray(config.permittedInterventionIds) ||
    !config.permittedInterventionIds.every((id) => net.interventions.some((i) => i.id === id))
  ) {
    throw new Error('Invalid planner target, budget, priority protection, timeout or intervention ID.');
  }
}
