import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnownAnswerNetwork, getInitialNetworks, defaultBudget } from '../data/networks';
import { solveTargetRecovery } from './solver';
import { solveWithinBudget } from './budget';
import { importOrders, orderColumns } from './orderImport';
import { readScenario } from './scenario';
import { verifyRecoveryPlan, indexRoutes, isRouteAvailableAndTimely } from './verifier';

test('late packages cannot cover orders that exhaust the initial capacity', () => {
  const n = buildKnownAnswerNetwork();
  const cfg = {
    targetServicePct: 100,
    protectCriticalOrders: true,
    availableBudget: 5000,
    permittedInterventionIds: n.interventions.map((i) => i.id),
  };
  const original = solveTargetRecovery(n, cfg);
  assert.equal(original.fulfilledOrders, 10);
  n.interventions.forEach((i) => {
    i.leadTimeHours = 1000;
  });
  assert.equal(solveTargetRecovery(n, cfg).solverStatus, 'INFEASIBLE');
  assert.equal(verifyRecoveryPlan(n, original, cfg).overallStatus, 'FAIL');
  const natural = solveTargetRecovery(n, { ...cfg, targetServicePct: 80 });
  assert.equal(natural.fulfilledOrders, 8);
  assert.equal(natural.verification.overallStatus, 'PASS');
});

test('a restored route waits for activation and an open route may leave immediately', () => {
  const n = buildKnownAnswerNetwork(),
    tr = n.transportOptions[0];
  n.interventions = [
    { ...n.interventions[0], affectedResourceId: tr.id, restoresRoute: true, timeReductionHours: 0, leadTimeHours: 2 },
  ];
  const ids = new Set([n.interventions[0].id]),
    index = indexRoutes(n);
  const eta = () => isRouteAvailableAndTimely(n, tr.warehouseId, tr.orderId, ids, index).estimatedTimeHours;
  assert.equal(eta(), tr.estimatedTimeHours);
  tr.available = false;
  assert.equal(eta(), tr.estimatedTimeHours + 2);
});

test('budget comparison agrees with all attainable service levels on the benchmark', () => {
  const n = buildKnownAnswerNetwork();
  const cfg = {
    targetServicePct: 100,
    protectCriticalOrders: true,
    availableBudget: 5000,
    permittedInterventionIds: n.interventions.map((i) => i.id),
  };
  const costs = Array.from({ length: 11 }, (_, k) => solveTargetRecovery(n, { ...cfg, targetServicePct: k * 10 }).totalRecoveryCost);
  for (const availableBudget of [0, 500, 1200, 2014.99, 2015]) {
    const c = { ...cfg, availableBudget };
    const result = solveWithinBudget(n, c, solveTargetRecovery(n, c));
    assert.equal(
      result.plan.fulfilledOrders,
      Math.max(...costs.map((cost, i) => (cost <= availableBudget ? i : 0))),
    );
    assert.ok(result.proven && result.plan.budgetCompliant);
    assert.equal(result.plan.verification.overallStatus, 'PASS');
  }
});

test('CSV creates a new geocoded order and all routes, reports all invalid rows atomically; scenarios round trip', () => {
  const n = getInitialNetworks().bengaluru,
    hub = n.warehouses[0],
    header = orderColumns.join(',');
  const row = `CSV-A,"Clinic, South",012345,${hub.lat},${hub.lon},3,4,STANDARD,${hub.id}`;
  const updated = importOrders(n, header + '\r\n' + row, 'batch.csv');
  assert.equal(updated.orders.at(-1)?.pincode, '012345');
  assert.equal(updated.orders.at(-1)?.customerName, 'Clinic, South');
  assert.equal(updated.transportOptions.length, n.transportOptions.length + n.warehouses.length);
  assert.throws(() => importOrders(n, [header, row, row, 'bad'].join('\n'), 'batch.csv'), /Row 3:[\s\S]*Row 4:/);
  const scenario = {
    network: updated,
    config: { targetServicePct: 73, availableBudget: defaultBudget(n), protectCriticalOrders: false, permittedInterventionIds: [] },
    defaultDisruptions: n.disruptions,
  };
  assert.deepEqual(readScenario(JSON.parse(JSON.stringify(scenario))), scenario);
});
