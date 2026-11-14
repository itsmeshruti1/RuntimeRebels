import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSiteOrders, buildKnownAnswerNetwork, getInitialNetworks, defaultBudget } from '../data/networks';
import { analyzeImmediateImpact, solveNaturalRecovery, solveTargetRecovery, computeNetworkInputHash } from './solver';
import { computeEffectiveWarehouseStates, verifyRecoveryPlan } from './verifier';
import { applyRouteAssumptions } from './routes';
import { validateNetwork, validateConfig } from './validation';
import { csvRow } from './csv';
import type { CityNetwork } from '../types/recovery';

function config(n: CityNetwork, target = 100) {
  return {
    targetServicePct: target,
    availableBudget: defaultBudget(n),
    permittedInterventionIds: n.interventions.map((i) => i.id),
    protectCriticalOrders: true,
  };
}

test('stock limits usable capacity after shortages and combined stock and handling packages', () => {
  const n = buildKnownAnswerNetwork();
  const w = n.warehouses[1];
  w.processingCapacity = w.inventory + 1;
  assert.throws(() => validateNetwork(n), /base capacity.*cannot exceed inventory/);
  w.processingCapacity = w.inventory;
  validateNetwork(n);
  n.disruptions = [{ id: 'loss', targetId: w.id, type: 'INVENTORY_SHORTAGE', severityPct: 100, active: true, label: 'Stock loss' }];
  const pkg = { ...n.interventions[0], affectedResourceId: w.id, inventoryDelta: 20, capacityDelta: 10, eligible: true };
  n.interventions = [pkg];
  const state = (active: boolean) => computeEffectiveWarehouseStates(n, new Set(active ? [pkg.id] : [])).get(w.id)!;
  assert.equal(state(false).effectiveCapacity, 0);
  assert.equal(state(true).disruptedCapacity, 0);
  assert.equal(state(true).effectiveCapacity, 20);
  w.status = 'OUTAGE';
  assert.equal(state(true).effectiveCapacity, 0);
});

test('all regional demos contain 100+ distinct orders with routes, realistic resource ratios and valid computed plans', () => {
  for (const n of Object.values(getInitialNetworks()).filter(
    (n) => n.cityId !== 'known_answer' && n.cityId !== 'multi_city',
  )) {
    validateNetwork(n);
    assert.ok(n.orders.length > 100);
    assert.ok(n.orders.some((o) => o.id.startsWith('DEMO-')));
    assert.equal(new Set(n.orders.map((o) => o.id)).size, n.orders.length);
    const plan = solveTargetRecovery(n, config(n));
    assert.equal(plan.totalOrders, n.orders.length);
    assert.equal(plan.fulfilledOrders, n.orders.length);
    assert.equal(plan.verification.overallStatus, 'PASS');
  }
});

test('250 entered orders retain their site routes and respond to stock and deadline changes', () => {
  const sample = buildKnownAnswerNetwork();
  const n = appendSiteOrders(sample, 'O1', Array.from({ length: 240 }, (_, i) => 'USER-' + i));
  validateNetwork(n);
  assert.equal(sample.orders.length, 10);
  assert.equal(n.orders.length, 250);
  n.disruptions = [];
  for (const w of n.warehouses) w.processingCapacity = w.inventory = 2500;
  const plan = solveTargetRecovery(n, config(n));
  assert.equal(plan.fulfilledOrders, 250);
  assert.equal(plan.verification.overallStatus, 'PASS');
  n.orders.at(-1)!.deadlineHours = 0.001;
  const natural = solveNaturalRecovery(n).stageA;
  assert.equal(natural.fulfilledOrders, 249);
  assert.equal(solveTargetRecovery(n, config(n)).solverStatus, 'INFEASIBLE');
  assert.throws(() => appendSiteOrders(n, 'O1', ['new', 'new']));
});

test('zero, decimal, empty and unattainable targets have consistent assignments and verification', () => {
  const n = buildKnownAnswerNetwork();
  for (const target of [0, 0.1, 10, 33.33, 75.5, 100]) {
    const p = solveTargetRecovery(n, config(n, target));
    assert.equal(p.fulfilledOrders, Math.ceil((n.orders.length * target) / 100));
    assert.equal(p.verification.overallStatus, 'PASS');
    if (!target) assert.equal(p.totalRecoveryCost, 0);
  }
  n.orders = [];
  n.transportOptions = [];
  n.disruptions = [];
  const p = solveTargetRecovery(n, config(n));
  assert.equal(p.fulfilledOrders, 0);
  assert.equal(p.totalRecoveryCost, 0);
  assert.equal(p.verification.overallStatus, 'PASS');
});

test('protected critical priority holds above the former fixed million-rupee bonus', () => {
  const n = buildKnownAnswerNetwork();
  for (const t of n.transportOptions)
    t.pricePerOrder = n.orders.find((o) => o.id === t.orderId)?.priority === 'CRITICAL' ? 5_000_000 : 0;
  const p = solveTargetRecovery(n, config(n, 10));
  assert.equal(p.criticalOrdersFulfilled, 1);
  assert.equal(p.transportAssignmentCost, 5_000_000);
  assert.equal(p.verification.overallStatus, 'PASS');
  assert.equal(solveTargetRecovery(n, { ...config(n, 10), protectCriticalOrders: false }).totalRecoveryCost, 0);
});

test('the baseline respects entered stock and counts manually closed lanes', () => {
  const n = buildKnownAnswerNetwork();
  n.warehouses[0].inventory = 10;
  assert.equal(analyzeImmediateImpact(n).baselineFulfilledOrders, 6);
  n.transportOptions[0].available = false;
  assert.equal(analyzeImmediateImpact(n).closedRoutesCount, 1);
});

test('31 permitted packages do not wrap a bitmask or drop the least-cost package', () => {
  const n = buildKnownAnswerNetwork();
  n.interventions.push(
    ...Array.from({ length: 29 }, (_, i) => ({ ...n.interventions[0], id: 'EXTRA-' + i, activationPrice: 1e6 })),
  );
  const p = solveTargetRecovery(n, config(n));
  assert.equal(p.interventionActivationCost, 800);
  assert.equal(p.solverStatus, 'OPTIMAL');
});

test('scenario assumptions propagate to times, tariffs, budget estimates and full input hash', () => {
  const n = getInitialNetworks().mumbai;
  const p = n.routeAssumptions!;
  const changed = applyRouteAssumptions(n, { ...p, speedKmh: p.speedKmh * 2, dispatchFee: p.dispatchFee + 200 });
  assert.ok(defaultBudget(changed) > defaultBudget(n));
  const route = changed.transportOptions[0];
  assert.equal(route.estimatedTimeHours, route.roadDistanceKm / (2 * p.speedKmh) + p.handlingHours);
  assert.equal(route.pricePerOrder - n.transportOptions[0].pricePerOrder, 200);
  const before = computeNetworkInputHash(n);
  n.interventions[0].timeReductionHours += 1;
  assert.notEqual(computeNetworkInputHash(n), before);
});

test('network, planner, and quoted CSV validation catch bad external data', () => {
  const n = buildKnownAnswerNetwork();
  for (const bad of [
    { ...n, sourceAudits: null },
    { ...n, orders: [null] },
    { ...n, warehouses: [] },
    { ...n, orders: [n.orders[0], n.orders[0]] },
  ])
    assert.throws(() => validateNetwork(bad));
  const c = config(n);
  for (const bad of [
    { ...c, availableBudget: -1 },
    { ...c, targetServicePct: 101 },
    { ...c, timeoutMs: 0 },
    { ...c, permittedInterventionIds: ['bad'] },
  ])
    assert.throws(() => validateConfig(bad, n));
  assert.equal(csvRow(['A, B', 'he said "go"', '=SUM(1)']), '"A, B","he said ""go""","\'=SUM(1)"');
});

test('verification rejects missing or fabricated assignment rows, ledger values and budget flags', () => {
  const n = buildKnownAnswerNetwork();
  const c = config(n, 40);
  const p = solveTargetRecovery(n, c);
  const corrupt = structuredClone(p);
  corrupt.budgetCompliant = !p.budgetCompliant;
  assert.equal(verifyRecoveryPlan(n, corrupt, c).overallStatus, 'FAIL');
  const unassigned = p.assignments.filter((a) => !a.fulfilledOnTime);
  unassigned[1].orderId = unassigned[0].orderId;
  assert.equal(verifyRecoveryPlan(n, p, c).overallStatus, 'FAIL');
});

// Exhaustively enumerate small asymmetric cases independently of the optimizer.
test('mixed quantities match a brute-force oracle with and without priority protection', () => {
  for (const protect of [false, true])
    for (const capacity of [2, 3, 4, 5, 6]) {
      const n = buildKnownAnswerNetwork();
      n.orders = n.orders.slice(0, 4);
      n.warehouses = n.warehouses.slice(0, 2);
      n.disruptions = [];
      n.interventions = [];
      n.transportOptions = n.transportOptions.filter(
        (t) => n.orders.some((o) => o.id === t.orderId) && n.warehouses.some((w) => w.id === t.warehouseId),
      );
      n.orders.forEach((o, i) => {
        o.quantity = (i % 3) + 1;
        o.deadlineHours = 24;
        o.priority = i === 1 ? 'CRITICAL' : 'STANDARD';
      });
      n.warehouses.forEach((w) => {
        w.inventory = w.processingCapacity = capacity;
      });
      for (const t of n.transportOptions)
        t.pricePerOrder = (t.warehouseId === 'W1' ? 7 : 3) * Number(t.orderId.slice(1));
      const options: { count: number; critical: number; cost: number }[] = [];
      function enumerate(i: number, loads: number[], count: number, critical: number, cost: number) {
        if (i === n.orders.length) {
          options.push({ count, critical, cost });
          return;
        }
        enumerate(i + 1, loads, count, critical, cost);
        n.warehouses.forEach((w, j) => {
          const o = n.orders[i],
            t = n.transportOptions.find((t) => t.orderId === o.id && t.warehouseId === w.id)!;
          if (loads[j] + o.quantity > w.inventory) return;
          const next = [...loads];
          next[j] += o.quantity;
          enumerate(i + 1, next, count + 1, critical + Number(o.priority === 'CRITICAL'), cost + t.pricePerOrder);
        });
      }
      enumerate(0, [0, 0], 0, 0, 0);
      const best = options.sort((a, b) => (protect ? b.critical - a.critical : 0) || b.count - a.count || a.cost - b.cost)[0];
      const natural = solveNaturalRecovery(n, protect).stageB;
      assert.equal(natural.fulfilledOrders, best.count);
      assert.equal(natural.totalRecoveryCost, best.cost);
      const c = { ...config(n, 50), protectCriticalOrders: protect };
      const p = solveTargetRecovery(n, c);
      const costs = options.filter((x) => x.count >= 2 && (!protect || x.critical >= best.critical)).map((x) => x.cost);
      assert.equal(p.totalRecoveryCost, Math.min(...costs));
    }
});

test('a single quantity edit on a 100+ order batch preserves verified service and proves the result', () => {
  const n = getInitialNetworks().bengaluru;
  n.orders[0].quantity += 1;
  const p = solveTargetRecovery(n, config(n, 75));
  assert.equal(p.verification.overallStatus, 'PASS');
  assert.equal(p.solverStatus, 'OPTIMAL');
  assert.equal(p.fulfilledOrders, Math.ceil(n.orders.length * 0.75));
});

test('route restoration and cent-valued quotes produce a balanced cost ledger', () => {
  const n = buildKnownAnswerNetwork();
  n.disruptions = [];
  n.orders = n.orders.slice(0, 2);
  n.interventions = [];
  n.transportOptions = n.transportOptions.filter(
    (t) => t.warehouseId === 'W1' && n.orders.some((o) => o.id === t.orderId),
  );
  n.transportOptions.forEach((t, i) => {
    t.available = false;
    t.pricePerOrder = (i + 1) / 10;
  });
  const pkg = {
    ...buildKnownAnswerNetwork().interventions[0],
    id: 'RESTORE',
    type: 'TRANSPORT_CORRIDOR' as const,
    affectedResourceId: 'W1',
    capacityDelta: 0,
    restoresRoute: true,
    activationPrice: 0.1,
  };
  n.interventions = [pkg];
  const p = solveTargetRecovery(n, { ...config(n), availableBudget: 0.4 });
  assert.equal(p.totalRecoveryCost, 0.4);
  assert.equal(p.budgetShortfall, 0);
  assert.equal(p.verification.overallStatus, 'PASS');
});
