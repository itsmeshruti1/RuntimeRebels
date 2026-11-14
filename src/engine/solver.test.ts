import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROSS_CITY_WAREHOUSE_TEMPLATES,
  addCrossCityWarehouseToNetwork,
  buildKnownAnswerNetwork,
  buildMultiCityNetwork,
  createWarehouseFromTemplate,
  getInitialNetworks,
  hydrateCrossCityTransportOptions,
} from '../data/networks';
import {
  analyzeImmediateImpact,
  solveNaturalRecovery,
  solveTargetRecovery,
} from './solver';
import { createCorruptedPlanForAudit, verifyRecoveryPlan } from './verifier';

test('1. Known-answer 10-order example: Natural recovery equals exactly 80% (8/10 orders)', () => {
  const network = buildKnownAnswerNetwork();
  const { stageA, stageB } = solveNaturalRecovery(network, true);

  assert.equal(stageA.totalOrders, 10);
  assert.equal(stageA.fulfilledOrders, 8);
  assert.equal(stageA.achievedServicePct, 80);
  assert.equal(stageA.solverStatus, 'OPTIMAL');
  assert.equal(stageA.verification.overallStatus, 'PASS');

  // Stage B preserves Stage A's 80% fulfillment while minimizing transport assignment cost
  assert.equal(stageB.fulfilledOrders, 8);
  assert.equal(stageB.achievedServicePct, 80);
  assert.ok(stageB.transportAssignmentCost <= stageA.transportAssignmentCost);
  assert.equal(stageB.verification.overallStatus, 'PASS');
});

test('2. Known-answer 10-order example: Two specified capacity packages permit 100% recovery at ₹800 combined activation charge', () => {
  const network = buildKnownAnswerNetwork();
  const plan = solveTargetRecovery(network, {
    targetServicePct: 100,
    availableBudget: 5000,
    permittedInterventionIds: ['INT-KA-CAP1', 'INT-KA-CAP2'],
    protectCriticalOrders: true,
  });

  assert.equal(plan.solverStatus, 'OPTIMAL');
  assert.equal(plan.optimalityProven, true);
  assert.equal(plan.fulfilledOrders, 10);
  assert.equal(plan.achievedServicePct, 100);
  assert.equal(plan.activatedInterventions.length, 2);
  assert.equal(plan.interventionActivationCost, 800);
  assert.equal(plan.verification.overallStatus, 'PASS');
});

test('3. Warehouse failures remove invalid assignments and are detected in immediate impact analysis', () => {
  const network = buildKnownAnswerNetwork();
  const impact = analyzeImmediateImpact(network);

  // W1 has 5 baseline orders (O1..O5) and is offline in default disruption
  assert.equal(impact.immediatelyAffectedOrderIds.length, 5);
  assert.equal(impact.survivingBaselineOrderIds.length, 5);
  assert.equal(impact.disruptedServicePctBeforeReassignment, 50);

  const { stageB } = solveNaturalRecovery(network, true);
  for (const a of stageB.assignments) {
    assert.notEqual(a.assignedWarehouseId, 'W1');
  }
});

test('4. Reduced inventory cannot improve maximum recovery', () => {
  const network = buildKnownAnswerNetwork();
  const before = solveNaturalRecovery(network, true).stageA;

  // Reduce W2 inventory from 70 to 20 (only 2 orders instead of 4)
  const w2 = network.warehouses.find((w) => w.id === 'W2')!;
  w2.inventory = 20;
  const after = solveNaturalRecovery(network, true).stageA;

  assert.ok(after.achievedServicePct <= before.achievedServicePct);
  assert.equal(after.achievedServicePct, 60);
});

test('5. Reduced handling capacity cannot improve maximum recovery', () => {
  const network = buildKnownAnswerNetwork();
  const before = solveNaturalRecovery(network, true).stageA;

  const w3 = network.warehouses.find((w) => w.id === 'W3')!;
  w3.processingCapacity = 20;
  const after = solveNaturalRecovery(network, true).stageA;

  assert.ok(after.achievedServicePct <= before.achievedServicePct);
  assert.equal(after.achievedServicePct, 60);
});

test('6. Closed transport connections cannot be used', () => {
  const network = buildKnownAnswerNetwork();
  // Close W2 -> O1 and W3 -> O1
  for (const tr of network.transportOptions) {
    if (tr.orderId === 'O1') tr.available = false;
  }
  const { stageB } = solveNaturalRecovery(network, true);
  const o1Assign = stageB.assignments.find((a) => a.orderId === 'O1')!;
  assert.equal(o1Assign.assignedWarehouseId, null);
  assert.equal(o1Assign.fulfilledOnTime, false);
});

test('7. Unreachable deadlines prevent on-time assignment', () => {
  const network = buildKnownAnswerNetwork();
  const o1 = network.orders.find((o) => o.id === 'O1')!;
  o1.deadlineHours = 0.2; // Shorter than minimum handling + transit time

  const { stageB } = solveNaturalRecovery(network, true);
  const o1Assign = stageB.assignments.find((a) => a.orderId === 'O1')!;
  assert.equal(o1Assign.assignedWarehouseId, null);
  assert.equal(o1Assign.fulfilledOnTime, false);
});

test('8. Critical-order constraints are enforced (all 5 critical orders protected in 80% natural recovery)', () => {
  const network = buildKnownAnswerNetwork();
  const { stageB } = solveNaturalRecovery(network, true);

  assert.equal(stageB.criticalOrdersTotal, 5);
  assert.equal(stageB.criticalOrdersFulfilled, 5);
});

test('9. Missing or unpermitted interventions cannot be activated', () => {
  const network = buildKnownAnswerNetwork();
  const plan = solveTargetRecovery(network, {
    targetServicePct: 100,
    availableBudget: 5000,
    permittedInterventionIds: [], // No interventions permitted
    protectCriticalOrders: true,
  });

  assert.equal(plan.solverStatus, 'INFEASIBLE');
  assert.equal(plan.physicallyFeasible, false);
  assert.equal(plan.activatedInterventions.length, 0);
});

test('10. Insufficient budget is distinguished from physical infeasibility', () => {
  const network = buildKnownAnswerNetwork();
  const plan = solveTargetRecovery(network, {
    targetServicePct: 100,
    availableBudget: 500, // Lower than the ₹800 intervention + transport cost
    permittedInterventionIds: ['INT-KA-CAP1', 'INT-KA-CAP2'],
    protectCriticalOrders: true,
  });

  // Physically feasible (OPTIMAL), but budgetCompliant is false and budgetShortfall > 0
  assert.equal(plan.physicallyFeasible, true);
  assert.equal(plan.solverStatus, 'OPTIMAL');
  assert.equal(plan.budgetCompliant, false);
  assert.ok(plan.budgetShortfall > 0);
  assert.equal(plan.budgetShortfall, plan.totalRecoveryCost - 500);
});

test('11. Deliberately invalid plans fail independent verification', () => {
  const network = buildKnownAnswerNetwork();
  const { stageB } = solveNaturalRecovery(network, true);
  assert.equal(stageB.verification.overallStatus, 'PASS');

  const corruptedOutage = createCorruptedPlanForAudit(network, stageB, 'ASSIGN_TO_OUTAGE');
  const rep1 = verifyRecoveryPlan(network, corruptedOutage, {
    targetServicePct: 80,
    availableBudget: 5000,
    permittedInterventionIds: [],
    protectCriticalOrders: true,
  });
  assert.equal(rep1.overallStatus, 'FAIL');

  const corruptedCap = createCorruptedPlanForAudit(network, stageB, 'EXCEED_CAPACITY');
  const rep2 = verifyRecoveryPlan(network, corruptedCap, {
    targetServicePct: 80,
    availableBudget: 5000,
    permittedInterventionIds: [],
    protectCriticalOrders: true,
  });
  assert.equal(rep2.overallStatus, 'FAIL');

  const corruptedCost = createCorruptedPlanForAudit(network, stageB, 'FABRICATE_COST');
  const rep3 = verifyRecoveryPlan(network, corruptedCost, {
    targetServicePct: 80,
    availableBudget: 5000,
    permittedInterventionIds: [],
    protectCriticalOrders: true,
  });
  assert.equal(rep3.overallStatus, 'FAIL');
});

test('12. Identical scenarios reproduce equivalent deterministic results & hashes', () => {
  const n1 = buildKnownAnswerNetwork();
  const n2 = buildKnownAnswerNetwork();
  const r1 = solveNaturalRecovery(n1, true).stageB;
  const r2 = solveNaturalRecovery(n2, true).stageB;

  assert.equal(r1.inputHash, r2.inputHash);
  assert.equal(r1.fulfilledOrders, r2.fulfilledOrders);
  assert.equal(r1.totalRecoveryCost, r2.totalRecoveryCost);
});

test('13. All five regional datasets (Bengaluru, Mumbai, Delhi NCR, Chennai, Guwahati) run through the same solver and pass independent verification', () => {
  const all = getInitialNetworks();
  const fiveCities = ['bengaluru', 'mumbai', 'delhi_ncr', 'chennai', 'guwahati'] as const;

  for (const cid of fiveCities) {
    const net = all[cid];
    assert.ok(net.warehouses.length >= 3);
    assert.ok(net.orders.length >= 10);

    const { stageB } = solveNaturalRecovery(net, true);
    assert.equal(stageB.verification.overallStatus, 'PASS');

    const allIntvIds = net.interventions.map((i) => i.id);
    const stageC = solveTargetRecovery(net, {
      targetServicePct: 100,
      availableBudget: 25000,
      permittedInterventionIds: allIntvIds,
      protectCriticalOrders: true,
    });
    assert.equal(stageC.solverStatus, 'OPTIMAL');
    assert.equal(stageC.achievedServicePct, 100);
    assert.equal(stageC.verification.overallStatus, 'PASS');
  }
});

test('14. Pan-India Multi-City network solves across 6 cities with cross-city recovery & passes 12/12 verification', () => {
  const multi = buildMultiCityNetwork();
  assert.equal(multi.warehouses.length, 6);
  assert.equal(multi.orders.length, 15);

  const impact = analyzeImmediateImpact(multi);
  assert.equal(impact.immediatelyAffectedOrderIds.length, 5); // 3 Mumbai (outage) + 2 Delhi (cap drop)

  const { stageB } = solveNaturalRecovery(multi, true);
  assert.equal(stageB.solverStatus, 'OPTIMAL');
  assert.equal(stageB.verification.overallStatus, 'PASS');

  const stageC = solveTargetRecovery(multi, {
    targetServicePct: 100,
    availableBudget: 20000,
    permittedInterventionIds: multi.interventions.map((i) => i.id),
    protectCriticalOrders: true,
  });

  assert.equal(stageC.solverStatus, 'OPTIMAL');
  assert.equal(stageC.achievedServicePct, 100);
  assert.equal(stageC.fulfilledOrders, 15);
  assert.equal(stageC.verification.overallStatus, 'PASS');
  assert.equal(stageC.verification.passedCount, 12);

  const crossCityOrders = stageC.assignments.filter((a) => a.isCrossCity);
  assert.ok(crossCityOrders.length >= 5);
  for (const cca of crossCityOrders) {
    assert.ok(
      cca.corridorMode === 'INTER_CITY_AIR_CARGO' ||
        cca.corridorMode === 'INTER_CITY_HIGHWAY',
    );
  }
});

test('15. Adding an out-of-city warehouse to a single-city network increases recovery capacity & routes orders cross-city', () => {
  const all = getInitialNetworks();
  const bengaluru = all.bengaluru;

  // Put all local Bengaluru warehouses under severe capacity squeeze so natural recovery drops below 100%
  const squeezed: typeof bengaluru = {
    ...bengaluru,
    warehouses: bengaluru.warehouses.map((w, idx) =>
      idx === 0 ? { ...w, status: 'OUTAGE' } : { ...w, processingCapacity: 20 },
    ),
    orders: bengaluru.orders.map((o) => ({ ...o, deadlineHours: 5.5 })),
    disruptions: [],
  };

  const before = solveNaturalRecovery(squeezed, true).stageB;
  assert.ok(before.achievedServicePct < 100);

  // Attach Chennai Sriperumbudur & Hyderabad Air-Cargo hubs into Bengaluru's network
  const maaTpl = CROSS_CITY_WAREHOUSE_TEMPLATES.find((t) => t.key === 'chennai-sriperumbudur')!;
  const maaWh = createWarehouseFromTemplate(squeezed, maaTpl, 120, 80);
  const withCrossCity = addCrossCityWarehouseToNetwork(squeezed, maaWh);

  const after = solveNaturalRecovery(withCrossCity, true).stageB;
  assert.ok(after.fulfilledOrders > before.fulfilledOrders);
  assert.equal(after.verification.overallStatus, 'PASS');
  assert.ok(
    after.assignments.some((a) => a.assignedWarehouseId === maaWh.id && a.isCrossCity === true),
  );
});

test('16. Custom multi-city network with omitted transportOptions auto-hydrates cross-city corridors for solver & verifier', () => {
  const all = getInitialNetworks();
  const base = buildMultiCityNetwork();
  const stripped: typeof base = {
    ...base,
    transportOptions: [],
  };

  const hydrated = hydrateCrossCityTransportOptions(stripped);
  assert.equal(hydrated.transportOptions.length, base.warehouses.length * base.orders.length);

  // Even calling solver directly with transportOptions: [] succeeds seamlessly
  const { stageB } = solveNaturalRecovery(stripped, true);
  assert.equal(stageB.solverStatus, 'OPTIMAL');
  assert.equal(stageB.verification.overallStatus, 'PASS');

  // Verify standalone API-style verification also succeeds on hydrated network
  const report = verifyRecoveryPlan(hydrated, stageB, {
    targetServicePct: stageB.achievedServicePct,
    availableBudget: stageB.availableBudget,
    permittedInterventionIds: [],
    protectCriticalOrders: true,
  });
  assert.equal(report.overallStatus, 'PASS');
  assert.ok(Object.keys(all).includes('multi_city'));
});

test('17. Target service levels from 1% to 100% (e.g. 1%, 17%, 42%) solve and pass 12/12 independent verification', () => {
  const network = getInitialNetworks().bengaluru;
  const permitted = network.interventions.map((i) => i.id);

  for (const target of [1, 17, 42, 100]) {
    const plan = solveTargetRecovery(network, {
      targetServicePct: target,
      availableBudget: 20000,
      permittedInterventionIds: permitted,
      protectCriticalOrders: true,
    });
    assert.equal(plan.solverStatus, 'OPTIMAL', `Expected OPTIMAL at ${target}%`);
    assert.equal(plan.physicallyFeasible, true, `Expected physicallyFeasible at ${target}%`);
    assert.ok(
      plan.achievedServicePct >= target,
      `Expected achievedServicePct (${plan.achievedServicePct}) >= ${target}%`,
    );
    assert.equal(plan.verification.overallStatus, 'PASS', `Expected 12/12 PASS at ${target}%`);
  }
});
