import {
  CityNetwork,
  PlannerConfig,
  RecoveryPlan,
  VerificationCheck,
  VerificationReport,
} from '../types/recovery';

export interface EffectiveWarehouseState {
  id: string;
  name: string;
  available: boolean;
  baseInventory: number;
  disruptedInventory: number;
  effectiveInventory: number;
  baseCapacity: number;
  disruptedCapacity: number;
  effectiveCapacity: number;
}

export function computeEffectiveWarehouseStates(
  network: CityNetwork,
  activatedInterventionIds: Set<string>,
): Map<string, EffectiveWarehouseState> {
  const activeDisruptions = network.disruptions.filter((d) => d.active);
  const map = new Map<string, EffectiveWarehouseState>();

  for (const w of network.warehouses) {
    let available = w.status !== 'OUTAGE';
    let invFactor = 1.0;
    let capFactor = 1.0;

    for (const d of activeDisruptions) {
      if (d.targetId === w.id) {
        if (d.type === 'WAREHOUSE_OUTAGE' && d.severityPct >= 100) {
          available = false;
        } else if (d.type === 'CAPACITY_REDUCTION') {
          capFactor *= Math.max(0, 1 - d.severityPct / 100);
        } else if (d.type === 'INVENTORY_SHORTAGE') {
          invFactor *= Math.max(0, 1 - d.severityPct / 100);
        }
      }
    }

    const disruptedInventory = available ? (invFactor === 1 ? w.inventory : Math.floor(w.inventory * invFactor)) : 0;
    const handlingCapacity = capFactor === 1 ? w.processingCapacity : Math.floor(w.processingCapacity * capFactor);

    let bonusInv = 0;
    let bonusCap = 0;
    if (available) {
      for (const intv of network.interventions) {
        if (
          activatedInterventionIds.has(intv.id) &&
          intv.eligible &&
          intv.affectedResourceId === w.id
        ) {
          bonusInv += intv.inventoryDelta;
          bonusCap += intv.capacityDelta;
        }
      }
    }

    const effectiveInventory = disruptedInventory + bonusInv;
    map.set(w.id, {
      id: w.id,
      name: w.name,
      available,
      baseInventory: w.inventory,
      disruptedInventory,
      effectiveInventory,
      baseCapacity: w.processingCapacity,
      disruptedCapacity: Math.min(disruptedInventory, handlingCapacity),
      effectiveCapacity: Math.min(effectiveInventory, handlingCapacity + bonusCap),
    });
  }

  return map;
}

/** Build once per calculation. A fresh index also supports callers editing a network in place. */
export function indexRoutes(network: CityNetwork) {
  const orders = new Map(network.orders.map(o => [o.id, o]));
  const routes = new Map<string, Map<string, CityNetwork['transportOptions'][number]>>();
  for (const route of network.transportOptions) {
    if (!routes.has(route.warehouseId)) routes.set(route.warehouseId, new Map());
    routes.get(route.warehouseId)!.set(route.orderId, route);
  }
  return { orders, routes };
}

export function isRouteAvailableAndTimely(
  network: CityNetwork,
  warehouseId: string,
  orderId: string,
  activatedInterventionIds: Set<string>,
  index = indexRoutes(network),
  readyAt = 0,
): {
  exists: boolean;
  available: boolean;
  onTime: boolean;
  estimatedTimeHours: number;
  deadlineHours: number;
  pricePerOrder: number;
  roadDistanceKm: number;
  transportOptionId: string | null;
} {
  const order = index.orders.get(orderId);
  const tr = index.routes.get(warehouseId)?.get(orderId);
  if (!order || !tr) {
    return {
      exists: false,
      available: false,
      onTime: false,
      estimatedTimeHours: Infinity,
      deadlineHours: order ? order.deadlineHours : 0,
      pricePerOrder: 0,
      roadDistanceKm: 0,
      transportOptionId: null,
    };
  }

  const activeDisruptions = network.disruptions.filter((d) => d.active);
  let closedByDisruption = false;
  for (const d of activeDisruptions) {
    if (
      d.type === 'ROUTE_CLOSURE' &&
      (d.targetId === tr.id || d.targetId === `${warehouseId}->${orderId}`)
    ) {
      closedByDisruption = true;
    }
  }

  const effects = network.interventions.filter(i => activatedInterventionIds.has(i.id) && i.eligible &&
    (i.affectedResourceId === tr.id || i.affectedResourceId === warehouseId) && (i.restoresRoute || i.timeReductionHours > 0));
  let effectiveTime = Infinity;
  // Launch packages together. An open lane can depart before an optional speed-up arrives.
  for (const departure of [readyAt, ...effects.map(i => Math.max(readyAt, i.leadTimeHours))]) {
    const ready = effects.filter(i => i.leadTimeHours <= departure);
    if ((!tr.available || closedByDisruption) && !ready.some(i => i.restoresRoute)) continue;
    const saving = ready.reduce((sum, i) => sum + i.timeReductionHours, 0);
    effectiveTime = Math.min(effectiveTime, departure + Math.max(0, tr.estimatedTimeHours - saving));
  }
  const available = Number.isFinite(effectiveTime);
  const onTime = effectiveTime <= order.deadlineHours;

  return {
    exists: true,
    available,
    onTime,
    estimatedTimeHours: effectiveTime,
    deadlineHours: order.deadlineHours,
    pricePerOrder: tr.pricePerOrder,
    roadDistanceKm: tr.roadDistanceKm,
    transportOptionId: tr.id,
  };
}

export function resourceTimeline(network: CityNetwork, ids: Set<string>) {
  const packages = network.interventions.filter(i => i.eligible && ids.has(i.id));
  const times = [...new Set([0, ...packages.filter(i => i.capacityDelta || i.inventoryDelta).map(i => i.leadTimeHours)])].sort((a,b) => a-b);
  return times.map(time => ({ time, states: computeEffectiveWarehouseStates(network,
    new Set(packages.filter(i => i.leadTimeHours <= time).map(i => i.id))) }));
}

export function scheduleAssignments(network: CityNetwork, assigned: Map<string,string|null>, ids: Set<string>, index = indexRoutes(network)) {
  const timeline = resourceTimeline(network, ids);
  const arrivals = new Map<string,number>();
  const balances = new Map<string,number[]>();
  for (const wh of network.warehouses) {
    const limits = timeline.map(step => step.states.get(wh.id)!.effectiveCapacity);
    const jobs = network.orders.filter(o => assigned.get(o.id) === wh.id).map(o => {
      const latest = timeline.reduce((last, step, i) => isRouteAvailableAndTimely(network, wh.id, o.id, ids, index, step.time).onTime ? i : last, -1);
      return { o, latest };
    }).sort((a,b) => a.latest - b.latest || a.o.id.localeCompare(b.o.id));
    let used = 0;
    const remaining = [...limits];
    for (const { o, latest } of jobs) {
      used += o.quantity;
      const first = limits.findIndex(limit => limit >= used);
      arrivals.set(o.id, first < 0 ? Infinity : isRouteAvailableAndTimely(network, wh.id, o.id, ids, index, timeline[first].time).estimatedTimeHours);
      for (let i = Math.max(0, latest); i < remaining.length; i++) remaining[i] -= o.quantity;
    }
    balances.set(wh.id,remaining);
  }
  return { arrivals, balances, timeline };
}

/**
 * Independent Plan Verification Engine (Section 8 / Feature F14)
 * Recomputes all 12 operational & mathematical constraints from raw inputs and proposed plan.
 */
export function verifyRecoveryPlan(
  network: CityNetwork,
  plan: RecoveryPlan,
  config: PlannerConfig,
): VerificationReport {
  const checks: VerificationCheck[] = [];
  const index = indexRoutes(network);
  const permittedSet = new Set(config.permittedInterventionIds);
  const activatedIds = new Set(plan.activatedInterventions.map((i) => i.id));

  // 1. Order Uniqueness & Validity
  const seenOrders = new Set<string>();
  const duplicateOrders: string[] = [];
  const unknownOrders: string[] = [];
  const validOrderIds = new Set(network.orders.map((o) => o.id));

  for (const a of plan.assignments) {
    const order = index.orders.get(a.orderId);
    if (order && (a.quantity !== order.quantity || a.priority !== order.priority || a.deadlineHours !== order.deadlineHours ||
        a.customerName !== order.customerName || a.pincode !== order.pincode || a.baselineWarehouseId !== order.baselineWarehouseId ||
        a.reassigned !== (a.assignedWarehouseId !== null && a.assignedWarehouseId !== order.baselineWarehouseId) ||
        (a.assignedWarehouseId === null && (a.transportCost !== 0 || a.transportOptionId !== null || a.estimatedTimeHours !== null || a.roadDistanceKm !== null)))) {
      unknownOrders.push(`${a.orderId} (row differs from inputs)`);
    }
    if (!validOrderIds.has(a.orderId)) {
      unknownOrders.push(a.orderId);
    }
    {
      if (seenOrders.has(a.orderId) || a.fulfilledOnTime !== (a.assignedWarehouseId !== null)) {
        duplicateOrders.push(a.orderId);
      }
      seenOrders.add(a.orderId);
    }
  }
  const uniquenessPassed =
    duplicateOrders.length === 0 &&
    unknownOrders.length === 0 &&
    plan.assignments.length === network.orders.length;

  checks.push({
    id: 'CHK-01',
    name: 'Assigned Order Uniqueness & Completeness',
    category: 'ORDER_UNIQUENESS',
    passed: uniquenessPassed,
    expected: `Each of ${network.orders.length} orders assigned at most once`,
    actual: uniquenessPassed
      ? `${seenOrders.size} unique orders across ${plan.assignments.length} records`
      : `Duplicates: [${duplicateOrders.join(', ')}], Unknown: [${unknownOrders.join(', ')}]`,
    details: uniquenessPassed
      ? 'Every customer order appears once and is assigned to at most one surviving warehouse.'
      : 'Order uniqueness violation detected in proposed assignment table.',
  });

  // 8. Intervention Eligibility & Availability (checked early to compute effective resources)
  const invalidInterventions: string[] = [];
  for (const intv of plan.activatedInterventions) {
    const rawIntv = network.interventions.find((x) => x.id === intv.id);
    if (!rawIntv || !rawIntv.eligible) {
      invalidInterventions.push(`${intv.id} (ineligible/missing)`);
    } else if (plan.stage === 'STAGE_C_TARGET_RECOVERY' && !permittedSet.has(intv.id)) {
      invalidInterventions.push(`${intv.id} (not permitted by user)`);
    } else if (
      (plan.stage === 'STAGE_A_MAX_NATURAL' || plan.stage === 'STAGE_B_CHEAPEST_NATURAL') &&
      plan.activatedInterventions.length > 0
    ) {
      invalidInterventions.push(`${intv.id} (natural recovery forbids interventions)`);
    }
  }
  const intvEligibilityPassed = invalidInterventions.length === 0 && activatedIds.size === plan.activatedInterventions.length;

  // Compute effective warehouse states from raw network + verified interventions
  const wStates = computeEffectiveWarehouseStates(network, activatedIds);

  // 2. Warehouse Status Compliance
  const outageViolations: string[] = [];
  for (const a of plan.assignments) {
    if (a.assignedWarehouseId) {
      const ws = wStates.get(a.assignedWarehouseId);
      if (!ws || !ws.available) {
        outageViolations.push(`${a.orderId} -> ${a.assignedWarehouseId}`);
      }
    }
  }
  const warehouseStatusPassed = outageViolations.length === 0;
  checks.push({
    id: 'CHK-02',
    name: 'Warehouse Availability Status',
    category: 'WAREHOUSE_STATUS',
    passed: warehouseStatusPassed,
    expected: '0 orders assigned to OUTAGE warehouses',
    actual: warehouseStatusPassed
      ? '0 assignments to unavailable warehouses'
      : `Outage violations: ${outageViolations.join(', ')}`,
    details: warehouseStatusPassed
      ? 'All assigned warehouses are confirmed operational in the active disruption scenario.'
      : 'Proposed plan assigns orders to a failed or non-existent warehouse.',
  });

  // 3. Inventory Consumption & 4. Processing-Capacity Consumption
  const usedInvByW = new Map<string, number>();
  const usedCapByW = new Map<string, number>();
  for (const w of network.warehouses) {
    usedInvByW.set(w.id, 0);
    usedCapByW.set(w.id, 0);
  }

  for (const a of plan.assignments) {
    if (a.assignedWarehouseId && a.fulfilledOnTime) {
      const rawOrder = index.orders.get(a.orderId);
      const qty = rawOrder ? rawOrder.quantity : a.quantity;
      usedInvByW.set(a.assignedWarehouseId, (usedInvByW.get(a.assignedWarehouseId) || 0) + qty);
      usedCapByW.set(a.assignedWarehouseId, (usedCapByW.get(a.assignedWarehouseId) || 0) + qty);
    }
  }

  const invViolations: string[] = [];
  const capViolations: string[] = [];
  for (const [wId, ws] of wStates.entries()) {
    const usedI = usedInvByW.get(wId) || 0;
    const usedC = usedCapByW.get(wId) || 0;
    if (usedI > ws.effectiveInventory) {
      invViolations.push(`${wId}: used ${usedI} > avail ${ws.effectiveInventory}`);
    }
    if (usedC > ws.effectiveCapacity) {
      capViolations.push(`${wId}: used ${usedC} > cap ${ws.effectiveCapacity}`);
    }
  }

  checks.push({
    id: 'CHK-03',
    name: 'Warehouse Inventory Consumption',
    category: 'INVENTORY_COMPLIANCE',
    passed: invViolations.length === 0,
    expected: 'Used inventory <= effective available stock at all warehouses',
    actual:
      invViolations.length === 0
        ? Array.from(wStates.values())
            .map((ws) => `${ws.id}: ${usedInvByW.get(ws.id) || 0}/${ws.effectiveInventory}`)
            .join(' | ')
        : invViolations.join('; '),
    details:
      invViolations.length === 0
        ? 'Independent stock ledger confirms sufficient inventory at every warehouse.'
        : 'Warehouse stock overrun detected.',
  });

  checks.push({
    id: 'CHK-04',
    name: 'Warehouse Processing-Capacity Consumption',
    category: 'CAPACITY_COMPLIANCE',
    passed: capViolations.length === 0,
    expected: 'Used handling capacity <= effective capacity at all warehouses',
    actual:
      capViolations.length === 0
        ? Array.from(wStates.values())
            .map((ws) => `${ws.id}: ${usedCapByW.get(ws.id) || 0}/${ws.effectiveCapacity}`)
            .join(' | ')
        : capViolations.join('; '),
    details:
      capViolations.length === 0
        ? 'Independent dock-handling audit confirms capacity limits hold.'
        : 'Warehouse handling-capacity limit exceeded.',
  });

  // 5. Transport Eligibility & 6. Modeled Delivery Timing vs Deadline
  const routeViolations: string[] = [];
  const deadlineViolations: string[] = [];
  let recomputedTransportCost = 0;

  const assigned = new Map(plan.assignments.map(a => [a.orderId, a.assignedWarehouseId]));
  const schedule = scheduleAssignments(network, assigned, activatedIds, index);
  for (const a of plan.assignments) {
    if (a.assignedWarehouseId && a.fulfilledOnTime) {
      const rt = isRouteAvailableAndTimely(
        network,
        a.assignedWarehouseId,
        a.orderId,
        activatedIds, index,
      );
      if (!rt.exists || !rt.available || a.transportOptionId !== rt.transportOptionId || a.transportCost !== rt.pricePerOrder || a.roadDistanceKm !== rt.roadDistanceKm) {
        routeViolations.push(`${a.assignedWarehouseId}->${a.orderId} (route closed/unavailable)`);
      }
      const arrival = schedule.arrivals.get(a.orderId) ?? Infinity;
      if (arrival > rt.deadlineHours || a.estimatedTimeHours !== arrival) {
        deadlineViolations.push(
          `${a.orderId}: scheduled ${arrival}h, deadline ${rt.deadlineHours}h`,
        );
      }
      recomputedTransportCost += rt.pricePerOrder;
    }
  }

  checks.push({
    id: 'CHK-05',
    name: 'Transport Route Eligibility & Connectivity',
    category: 'TRANSPORT_ELIGIBILITY',
    passed: routeViolations.length === 0,
    expected: 'All assigned routes open and connected in road graph',
    actual:
      routeViolations.length === 0
        ? 'All active assignments use open road corridors'
        : routeViolations.join('; '),
    details:
      routeViolations.length === 0
        ? 'Every assigned warehouse-to-customer edge is drivable and open.'
        : 'Plan routes an order across a closed or non-existent transport link.',
  });

  checks.push({
    id: 'CHK-06',
    name: 'Customer Delivery Deadline Compliance',
    category: 'DEADLINE_COMPLIANCE',
    passed: deadlineViolations.length === 0,
    expected: 'Modeled delivery time <= order deadline for all fulfilled orders',
    actual:
      deadlineViolations.length === 0
        ? '0 late deliveries among fulfilled orders'
        : deadlineViolations.join('; '),
    details:
      deadlineViolations.length === 0
        ? 'All fulfilled orders arrive within their committed delivery window.'
        : 'Deadline violation: order assigned to a route exceeding its deadline.',
  });

  // 7. Priority Order Compliance
  const criticalOrders = network.orders.filter((o) => o.priority === 'CRITICAL');
  const fulfilledCriticalCount = plan.assignments.filter(
    (a) =>
      a.fulfilledOnTime &&
      a.assignedWarehouseId !== null &&
      index.orders.get(a.orderId)?.priority === 'CRITICAL',
  ).length;
  const standardFulfilledCount = plan.assignments.filter(
    (a) =>
      a.fulfilledOnTime &&
      a.assignedWarehouseId !== null &&
      index.orders.get(a.orderId)?.priority === 'STANDARD',
  ).length;

  // Check if any unfulfilled critical order could have taken a slot used by a standard order
  let priorityViolation = false;
  if (config.protectCriticalOrders && fulfilledCriticalCount < criticalOrders.length && standardFulfilledCount > 0) {
    // Check if an unfulfilled critical order had a valid, timely route to a warehouse that served a standard order
    const unfulfilledCriticals = criticalOrders.filter(
      (co) => !plan.assignments.find((a) => a.orderId === co.id && a.fulfilledOnTime),
    );
    for (const uco of unfulfilledCriticals) {
      if (priorityViolation) break;
      for (const a of plan.assignments) {
        const rawO = index.orders.get(a.orderId);
        if (rawO?.priority === 'STANDARD' && a.assignedWarehouseId && a.fulfilledOnTime) {
          const rt = isRouteAvailableAndTimely(network, a.assignedWarehouseId, uco.id, activatedIds, index);
          const ws = wStates.get(a.assignedWarehouseId);
          if (rt.available && rt.onTime && ws?.available && uco.quantity <= rawO.quantity + Math.min(ws.effectiveInventory - (usedInvByW.get(ws.id) ?? 0), ws.effectiveCapacity - (usedCapByW.get(ws.id) ?? 0))) {
            const swapped = new Map(assigned);
            swapped.delete(a.orderId);
            swapped.set(uco.id, ws.id);
            const alternate = scheduleAssignments(network, swapped, activatedIds, index);
            if ([...alternate.arrivals].every(([id, eta]) => eta <= index.orders.get(id)!.deadlineHours)) priorityViolation = true;
            if (priorityViolation) break;
          }
        }
      }
    }
  }

  checks.push({
    id: 'CHK-07',
    name: 'Priority-Aware Critical Order Protection',
    category: 'PRIORITY_COMPLIANCE',
    passed: !priorityViolation,
    expected: config.protectCriticalOrders
      ? 'No critical order preempted by a standard order on a feasible warehouse'
      : 'Standard priority policy active',
    actual: `${fulfilledCriticalCount}/${criticalOrders.length} critical orders fulfilled`,
    details: !priorityViolation
      ? 'Critical orders receive strict priority protection over standard demand.'
      : 'A critical order was left unfulfilled while a standard order consumed eligible capacity.',
  });

  // 8. Intervention Eligibility check record
  checks.push({
    id: 'CHK-08',
    name: 'Intervention Package Availability & Permission',
    category: 'INTERVENTION_ELIGIBILITY',
    passed: intvEligibilityPassed,
    expected: 'Only eligible, user-permitted interventions activated',
    actual: intvEligibilityPassed
      ? `${plan.activatedInterventions.length} valid package(s) activated`
      : invalidInterventions.join('; '),
    details: intvEligibilityPassed
      ? 'All activated intervention packages are permitted and eligible.'
      : 'Unauthorized or ineligible intervention package activated.',
  });

  // 9. Intervention Resource Effects
  let effectMismatch = plan.warehouseUtilization.length !== wStates.size ||
    new Set(plan.warehouseUtilization.map(w => w.warehouseId)).size !== wStates.size;
  for (const wu of plan.warehouseUtilization) {
    const ws = wStates.get(wu.warehouseId);
    if (!ws || wu.effectiveCapacity !== ws.effectiveCapacity || wu.effectiveInventory !== ws.effectiveInventory || wu.usedInventory !== usedInvByW.get(wu.warehouseId) || wu.usedCapacity !== usedCapByW.get(wu.warehouseId)) {
      effectMismatch = true;
    }
  }
  checks.push({
    id: 'CHK-09',
    name: 'Intervention Resource Effect Consistency',
    category: 'INTERVENTION_EFFECTS',
    passed: !effectMismatch,
    expected: 'Warehouse capacity & stock deltas match declared package specs',
    actual: !effectMismatch ? 'Resource deltas verified exact' : 'Resource expansion mismatch',
    details: !effectMismatch
      ? 'Intervention stock and handling-capacity expansions match specification.'
      : 'Claimed warehouse capacity/inventory does not match active interventions.',
  });

  // 10. Cost Calculation Accuracy
  const recomputedIntvCost = plan.activatedInterventions.reduce((acc, i) => {
    const raw = network.interventions.find((x) => x.id === i.id);
    return acc + Math.round((raw ? raw.activationPrice : i.activationPrice) * 100);
  }, 0) / 100;
  recomputedTransportCost = Math.round(recomputedTransportCost * 100) / 100;
  const recomputedTotalCost = Math.round((recomputedTransportCost + recomputedIntvCost) * 100) / 100;
  const costPassed =
    recomputedTransportCost === plan.transportAssignmentCost &&
    recomputedIntvCost === plan.interventionActivationCost &&
    recomputedTotalCost === plan.totalRecoveryCost && plan.availableBudget === config.availableBudget &&
    plan.budgetCompliant === (plan.physicallyFeasible && recomputedTotalCost <= config.availableBudget) &&
    plan.budgetShortfall === (plan.physicallyFeasible ? Math.max(0, Math.round((recomputedTotalCost - config.availableBudget) * 100) / 100) : 0);

  checks.push({
    id: 'CHK-10',
    name: 'Independent Cost Ledger Recalculation',
    category: 'COST_ACCURACY',
    passed: costPassed,
    expected: `Transport ₹${recomputedTransportCost} + Interventions ₹${recomputedIntvCost} = ₹${recomputedTotalCost}`,
    actual: `Reported: Transport ₹${plan.transportAssignmentCost} + Interventions ₹${plan.interventionActivationCost} = ₹${plan.totalRecoveryCost}`,
    details: costPassed
      ? 'Independent summation of route tariffs and intervention charges matches reported expenditure.'
      : 'Cost discrepancy between reported plan cost and independent ledger.',
  });

  // 11. Actual Achieved Service Calculation
  const validFulfilledCount = plan.assignments.filter(
    (a) => a.assignedWarehouseId !== null && a.fulfilledOnTime,
  ).length;
  const recomputedServicePct =
    network.orders.length > 0
      ? Math.round((validFulfilledCount / network.orders.length) * 1000) / 10
      : 0;
  const serviceCalcPassed =
    validFulfilledCount === plan.fulfilledOrders &&
    plan.totalOrders === network.orders.length && plan.unfulfilledOrdersCount === network.orders.length - validFulfilledCount &&
    plan.criticalOrdersTotal === criticalOrders.length && plan.criticalOrdersFulfilled === fulfilledCriticalCount &&
    plan.achievedServicePct === recomputedServicePct;

  checks.push({
    id: 'CHK-11',
    name: 'Fulfilled Order & Service Percentage Accuracy',
    category: 'SERVICE_CALCULATION_ACCURACY',
    passed: serviceCalcPassed,
    expected: `${validFulfilledCount}/${network.orders.length} (${recomputedServicePct}%)`,
    actual: `${plan.fulfilledOrders}/${plan.totalOrders} (${plan.achievedServicePct}%)`,
    details: serviceCalcPassed
      ? 'Reported fulfillment count and percentage match independent tally.'
      : 'Reported service level does not match actual valid assignments.',
  });

  // 12. Target Compliance
  const targetPassed =
    plan.stage !== 'STAGE_C_TARGET_RECOVERY' ||
    (plan.physicallyFeasible && ['OPTIMAL', 'FEASIBLE'].includes(plan.solverStatus) &&
      config.targetServicePct === plan.requestedTargetPct &&
      validFulfilledCount >= Math.ceil(config.targetServicePct * network.orders.length / 100 - 1e-9));

  checks.push({
    id: 'CHK-12',
    name: 'Target Service Level Compliance',
    category: 'TARGET_COMPLIANCE',
    passed: targetPassed,
    expected:
      plan.stage === 'STAGE_C_TARGET_RECOVERY'
        ? `Achieved service >= ${plan.requestedTargetPct}% target`
        : `Stage ${plan.stage} natural optimum`,
    actual: `Achieved ${recomputedServicePct}% (Target: ${plan.requestedTargetPct}%)`,
    details: targetPassed
      ? 'Plan satisfies the requested service target.'
      : 'Plan claims target compliance but falls short of the required service percentage.',
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const overallStatus = passedCount === checks.length ? 'PASS' : 'FAIL';

  return {
    overallStatus,
    passedCount,
    totalChecks: checks.length,
    checks,
    summary:
      overallStatus === 'PASS'
        ? `All ${checks.length}/${checks.length} independent verification checks PASSED. Plan is operationally feasible and verified.`
        : `VERIFICATION FAILED: ${checks.length - passedCount} of ${checks.length} independent checks failed. Do not execute unverified plan.`,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Deliberately corrupts a valid RecoveryPlan to test that the Independent Verifier
 * catches invalid assignments, capacity overruns, or fabricated costs (Section 8 / Section 14).
 */
export function createCorruptedPlanForAudit(
  network: CityNetwork,
  validPlan: RecoveryPlan,
  corruptionMode: 'ASSIGN_TO_OUTAGE' | 'EXCEED_CAPACITY' | 'FABRICATE_COST' = 'ASSIGN_TO_OUTAGE',
): RecoveryPlan {
  const cloned: RecoveryPlan = JSON.parse(JSON.stringify(validPlan));

  if (corruptionMode === 'ASSIGN_TO_OUTAGE') {
    const outageDisruption = network.disruptions.find(
      (d) => d.active && d.type === 'WAREHOUSE_OUTAGE',
    );
    if (!outageDisruption || !cloned.assignments.length) return createCorruptedPlanForAudit(network, validPlan, 'FABRICATE_COST');
    const outageWarehouseId = outageDisruption.targetId;
    if (cloned.assignments.length > 0) {
      cloned.assignments[0].assignedWarehouseId = outageWarehouseId;
      cloned.assignments[0].fulfilledOnTime = true;
    }
  } else if (corruptionMode === 'EXCEED_CAPACITY') {
    const survivingW =
      network.warehouses.find(
        (w) =>
          !network.disruptions.some(
            (d) => d.active && d.type === 'WAREHOUSE_OUTAGE' && d.targetId === w.id,
          ),
      ) || network.warehouses[0];
    for (const a of cloned.assignments) {
      a.assignedWarehouseId = survivingW.id;
      a.fulfilledOnTime = true;
    }
    cloned.fulfilledOrders = cloned.assignments.length;
    cloned.achievedServicePct = 100;
  } else if (corruptionMode === 'FABRICATE_COST') {
    cloned.totalRecoveryCost = cloned.totalRecoveryCost + Math.max(1, cloned.totalRecoveryCost);
  }

  return cloned;
}
