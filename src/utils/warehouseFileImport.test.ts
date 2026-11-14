import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitialNetworks } from '../data/networks';
import {
  aggregateWarehouseCounts,
  applyImportedWarehousesToNetwork,
  parseWarehouseCsvText,
} from './warehouseFileImport';

test('CSV parser ignores product types and sums total available products per warehouse', () => {
  const csv = [
    'Warehouse ID,Warehouse Name,Product Type,Available Products,City,PIN Code',
    'BLR-W1,Peenya Industrial Hub,Electronics,90,Bengaluru,560058',
    'BLR-W1,Peenya Industrial Hub,Medical Kits,110,Bengaluru,560058',
    'BLR-W2,Whitefield EPIP Park,Cold Chain,75,Bengaluru,560066',
    'BLR-W2,Whitefield EPIP Park,Dry Goods,85,Bengaluru,560066',
  ].join('\n');

  const parsed = parseWarehouseCsvText(csv);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].warehouseId, 'BLR-W1');
  assert.equal(parsed[0].totalProducts, 200);
  assert.equal(parsed[1].warehouseId, 'BLR-W2');
  assert.equal(parsed[1].totalProducts, 160);
});

test('applyImportedWarehousesToNetwork updates matched hubs and attaches cross-city warehouses', () => {
  const networks = getInitialNetworks();
  const base = networks.bengaluru;

  const extracted = aggregateWarehouseCounts([
    { warehouseName: 'Peenya Industrial Hub', totalProducts: 85 },
    { warehouseName: 'Peenya Industrial Hub', totalProducts: 95 },
    { warehouseName: 'Pune Chakan Hub', city: 'Pune', pincode: '410501', totalProducts: 130 },
  ]);

  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].totalProducts, 180);

  const result = applyImportedWarehousesToNetwork(base, extracted, 'inventory_sheet.csv');
  assert.equal(result.updatedWarehouses.length, 1);
  assert.equal(result.addedWarehouses.length, 1);
  assert.equal(result.totalProductUnits, 310);

  const blr1 = result.network.warehouses.find((w) => w.id === 'BLR-W1');
  assert.equal(blr1?.inventory, 180);

  const puneHub = result.network.warehouses.find((w) => String(w.cityId).toLowerCase() === 'pune');
  assert.ok(puneHub);
  assert.equal(puneHub?.inventory, 130);

  const crossLinks = result.network.transportOptions.filter((t) => t.warehouseId === puneHub?.id);
  assert.equal(crossLinks.length, result.network.orders.length);
});

test('parseWarehouseCsvText safely handles empty or missing required columns', () => {
  assert.deepEqual(parseWarehouseCsvText(''), []);
  assert.deepEqual(parseWarehouseCsvText('product,price\nShoes,500'), []);
});
