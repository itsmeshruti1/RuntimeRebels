import {
  CityNetwork,
  ImpactAnalysisResult,
  InterventionPackage,
  OrderAssignmentResult,
  PlannerConfig,
  RecoveryPlan,
  SolverStage,
  SolverStatus,
} from '../types/recovery';
import {
  indexRoutes,
  resourceTimeline,
  scheduleAssignments,
  computeEffectiveWarehouseStates,
  isRouteAvailableAndTimely,
  verifyRecoveryPlan,
} from './verifier';
import { hydrateCrossCityTransportOptions } from '../data/networks';

function maybeHydrate(network: CityNetwork): CityNetwork {
  if (network.transportOptions.length === 0 && network.orders.length > 0 && network.warehouses.length > 0) {
    return hydrateCrossCityTransportOptions(network);
  }
  return network;
}

/** A budget-feasible starting plan keeps the comparison usable if exact search times out. */
export function seedBudgetPlan(network: CityNetwork, config: PlannerConfig): RecoveryPlan {
  const ids = new Set<string>();
  const index = indexRoutes(network);
  const states = computeEffectiveWarehouseStates(network,ids);
  const remaining = new Map([...states].map(([id,w]) => [id,w.effectiveCapacity]));
  const assignments = new Map<string,string|null>();
  const quotes = network.orders.map(order => {
    const lanes = network.warehouses.flatMap(w => {
      const route = isRouteAvailableAndTimely(network,w.id,order.id,ids,index);
      return route.onTime && route.available && states.get(w.id)!.available ? [{id:w.id,price:Math.round(route.pricePerOrder*100)}] : [];
    }).sort((a,b) => a.price-b.price);
    return {order,lanes};
  }).sort((a,b) => (config.protectCriticalOrders ? Number(b.order.priority==='CRITICAL')-Number(a.order.priority==='CRITICAL') : 0)
    || (a.lanes[0]?.price ?? Infinity)-(b.lanes[0]?.price ?? Infinity) || a.order.quantity-b.order.quantity);
  let spent = 0, critical = 0;
  const criticalTotal = network.orders.filter(o=>o.priority==='CRITICAL').length;
  for (const {order,lanes} of quotes) {
    if (config.protectCriticalOrders && order.priority==='STANDARD' && critical<criticalTotal) break;
    const lane = lanes.find(l => remaining.get(l.id)! >= order.quantity && spent+l.price <= Math.round(config.availableBudget*100));
    if (!lane) continue;
    assignments.set(order.id,lane.id);
    remaining.set(lane.id,remaining.get(lane.id)!-order.quantity);
    spent+=lane.price;
    if (order.priority==='CRITICAL') critical++;
  }
  const count = assignments.size;
  return buildRecoveryPlanObject(network,'STAGE_C_TARGET_RECOVERY',
    {...config,targetServicePct: network.orders.length ? count*100/network.orders.length : 0},
    {status:'FEASIBLE',optimalityProven:false,fulfilledOrders:count,criticalFulfilled:critical,transportCost:spent/100,
    assignmentsByOrder:assignments,nodesExplored:0,timedOut:false},[],count,count,0);
}

export function computeNetworkInputHash(
  network: CityNetwork,
  config?: Partial<PlannerConfig>,
): string {
  const payload = JSON.stringify({ network, config });

  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Feature F06 — Immediate Impact Analysis before recovery reassignment
 */
export function analyzeImmediateImpact(rawNetwork: CityNetwork): ImpactAnalysisResult {
  const network = maybeHydrate(rawNetwork);
  const inputHash = computeNetworkInputHash(network);
  const index = indexRoutes(network);
  const wStates = computeEffectiveWarehouseStates(network, new Set());
  const emptyInterventions = new Set<string>();

  // Baseline metrics (without active disruptions)
  let baselineFulfilled = 0;
  let baselineCost = 0;
  const nominalLoads = new Map<string, number>();

  // Track cumulative baseline load on each surviving warehouse to detect capacity/inventory shortages
  const usedInv = new Map<string, number>();
  const usedCap = new Map<string, number>();
  for (const w of network.warehouses) {
    usedInv.set(w.id, 0);
    usedCap.set(w.id, 0);
  }

  // Sort orders so CRITICAL baseline orders claim surviving baseline capacity first
  const sortedOrders = [...network.orders].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'CRITICAL' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const impactMap = new Map<
    string,
    {
      status:
        | 'UNAFFECTED'
        | 'AFFECTED_OUTAGE'
        | 'AFFECTED_ROUTE_CLOSED'
        | 'AFFECTED_CAPACITY_SHORTAGE'
        | 'AFFECTED_INVENTORY_SHORTAGE'
        | 'AFFECTED_DEADLINE';
      reason: string;
    }
  >();

  let disruptedRetainedCost = 0;
  const immediatelyAffectedOrderIds: string[] = [];
  const survivingBaselineOrderIds: string[] = [];

  for (const o of sortedOrders) {
    const warehouse = network.warehouses.find(w => w.id === o.baselineWarehouseId);
    const nominalRoute = index.routes.get(o.baselineWarehouseId)?.get(o.id);
    const load = (nominalLoads.get(o.baselineWarehouseId) ?? 0) + o.quantity;
    if (warehouse && nominalRoute?.available && nominalRoute.estimatedTimeHours <= o.deadlineHours &&
        load <= Math.min(warehouse.inventory, warehouse.processingCapacity)) {
      baselineFulfilled++;
      baselineCost += nominalRoute.pricePerOrder;
      nominalLoads.set(warehouse.id, load);
    }

    const ws = wStates.get(o.baselineWarehouseId);
    const rt = isRouteAvailableAndTimely(network, o.baselineWarehouseId, o.id, emptyInterventions, index);

    if (!ws || !ws.available) {
      immediatelyAffectedOrderIds.push(o.id);
      impactMap.set(o.id, {
        status: 'AFFECTED_OUTAGE',
        reason: `Baseline warehouse ${o.baselineWarehouseId} is offline due to active outage disruption.`,
      });
      continue;
    }

    if (!rt.exists || !rt.available) {
      immediatelyAffectedOrderIds.push(o.id);
      impactMap.set(o.id, {
        status: 'AFFECTED_ROUTE_CLOSED',
        reason: `Primary transport corridor ${o.baselineWarehouseId} → ${o.id} is closed.`,
      });
      continue;
    }

    if (!rt.onTime) {
      immediatelyAffectedOrderIds.push(o.id);
      impactMap.set(o.id, {
        status: 'AFFECTED_DEADLINE',
        reason: `Modeled transit time (${rt.estimatedTimeHours}h) exceeds customer deadline (${o.deadlineHours}h).`,
      });
      continue;
    }

    const curInv = usedInv.get(ws.id) || 0;
    const curCap = usedCap.get(ws.id) || 0;

    if (curInv + o.quantity > ws.effectiveInventory) {
      immediatelyAffectedOrderIds.push(o.id);
      impactMap.set(o.id, {
        status: 'AFFECTED_INVENTORY_SHORTAGE',
        reason: `Insufficient surviving stock at ${ws.id} (${ws.effectiveInventory} units available).`,
      });
      continue;
    }

    if (curCap + o.quantity > ws.effectiveCapacity) {
      immediatelyAffectedOrderIds.push(o.id);
      impactMap.set(o.id, {
        status: 'AFFECTED_CAPACITY_SHORTAGE',
        reason: `Reduced handling capacity at ${ws.id} (${ws.effectiveCapacity} units cap) exhausted.`,
      });
      continue;
    }

    usedInv.set(ws.id, curInv + o.quantity);
    usedCap.set(ws.id, curCap + o.quantity);
    survivingBaselineOrderIds.push(o.id);
    disruptedRetainedCost += rt.pricePerOrder;
    impactMap.set(o.id, {
      status: 'UNAFFECTED',
      reason: `Retains valid baseline assignment on ${ws.id} (${rt.estimatedTimeHours}h <= ${o.deadlineHours}h).`,
    });
  }

  const totalOrders = network.orders.length;
  const baselineServicePct =
    totalOrders > 0 ? Math.round((baselineFulfilled / totalOrders) * 1000) / 10 : 0;
  const disruptedServicePctBeforeReassignment =
    totalOrders > 0 ? Math.round((survivingBaselineOrderIds.length / totalOrders) * 1000) / 10 : 0;

  const affectedWarehouses = Array.from(wStates.values())
    .filter(
      (ws) =>
        !ws.available ||
        ws.effectiveCapacity < ws.baseCapacity ||
        ws.effectiveInventory < ws.baseInventory,
    )
    .map((ws) => ws.id);

  const closedRoutesCount = network.transportOptions.filter(t =>
    !isRouteAvailableAndTimely(network, t.warehouseId, t.orderId, emptyInterventions, index).available
  ).length;

  return {
    inputHash,
    totalOrders,
    baselineFulfilledOrders: baselineFulfilled,
    baselineServicePct,
    baselineCost: Math.round(baselineCost * 100) / 100,
    immediatelyAffectedOrderIds,
    survivingBaselineOrderIds,
    disruptedServicePctBeforeReassignment,
    disruptedRetainedCost: Math.round(disruptedRetainedCost * 100) / 100,
    affectedWarehouses,
    closedRoutesCount,
    orderImpacts: network.orders.map((o) => {
      const imp = impactMap.get(o.id)!;
      return {
        orderId: o.id,
        customerName: o.customerName,
        priority: o.priority,
        baselineWarehouseId: o.baselineWarehouseId,
        status: imp.status,
        reason: imp.reason,
      };
    }),
  };
}

interface AssignmentSubproblemResult {
  status: SolverStatus;
  optimalityProven: boolean;
  fulfilledOrders: number;
  criticalFulfilled: number;
  transportCost: number;
  assignmentsByOrder: Map<string, string | null>; // orderId -> warehouseId | null
  nodesExplored: number;
  timedOut: boolean;
}

/**
 * Solves the exact binary assignment problem x[w,o] in {0,1} for a fixed intervention set y[k].
 * Supports:
 * - Objective 'MAX_SERVICE': Lexicographically maximizes (total fulfilled, critical fulfilled, -transportCost)
 * - Objective 'MIN_COST_AT_TARGET': Enforces fulfilled >= requiredOrders (and critical >= requiredCritical),
 *   minimizing transportCost.
 */
function solveAssignmentForFixedInterventions(
  network: CityNetwork,
  activatedInterventionIds: Set<string>,
  protectCritical: boolean,
  requiredOrders: number | null,
  requiredCritical: number,
  deadlinePerfNow: number,
): AssignmentSubproblemResult {
  const index = indexRoutes(network);
  const wStates = computeEffectiveWarehouseStates(network, activatedInterventionIds);
  const warehouses = network.warehouses;
  const wIds = warehouses.map((w) => w.id);
  const wIndex = new Map<string, number>();
  wIds.forEach((id, idx) => wIndex.set(id, idx));

  const remInv = wIds.map((id) => wStates.get(id)?.effectiveInventory || 0);
  const remCap = wIds.map((id) => wStates.get(id)?.effectiveCapacity || 0);

  // Order sorting: CRITICAL orders first, then orders with fewer eligible warehouses (most constrained first)
  const timeline = resourceTimeline(network, activatedInterventionIds);
  const limits = warehouses.map(w => timeline.map(step => step.states.get(w.id)!.effectiveCapacity));
  const orderCandidates = network.orders.map((o) => {
    const validW: { wIdx: number; wId: string; cost: number; latest: number }[] = [];
    for (let wi = 0; wi < wIds.length; wi++) {
      const wId = wIds[wi];
      const ws = wStates.get(wId);
      if (!ws || !ws.available) continue;
      if (o.quantity > ws.effectiveInventory || o.quantity > ws.effectiveCapacity) continue;
      const rt = isRouteAvailableAndTimely(network, wId, o.id, activatedInterventionIds, index);
      if (rt.exists && rt.available && rt.onTime) {
        let latest = timeline.length - 1;
        while (latest > 0 && !isRouteAvailableAndTimely(network, wId, o.id, activatedInterventionIds, index, timeline[latest].time).onTime) latest--;
        if (limits[wi][latest] >= o.quantity) validW.push({ wIdx: wi, wId, cost: rt.pricePerOrder, latest });
      }
    }
    validW.sort((a, b) => a.cost - b.cost);
    return {
      order: o,
      isCritical: o.priority === 'CRITICAL',
      validW,
      minCost: validW.length > 0 ? validW[0].cost : 0,
    };
  });

  orderCandidates.sort((a, b) => {
    if (protectCritical && a.isCritical !== b.isCritical) {
      return a.isCritical ? -1 : 1;
    }
    if (a.validW.length !== b.validW.length) {
      return a.validW.length - b.validW.length;
    }
    return a.order.id.localeCompare(b.order.id);
  });

  const N = orderCandidates.length;
  const suffixMaxOrders = new Array(N + 1).fill(0);
  const suffixMaxCritical = new Array(N + 1).fill(0);
  const suffixSumMinCost = new Array(N + 1).fill(0);
  for (let i = N - 1; i >= 0; i--) {
    const canServe = orderCandidates[i].validW.length > 0 ? 1 : 0;
    suffixMaxOrders[i] = suffixMaxOrders[i + 1] + canServe;
    suffixMaxCritical[i] =
      suffixMaxCritical[i + 1] + (canServe && orderCandidates[i].isCritical ? 1 : 0);
    suffixSumMinCost[i] = suffixSumMinCost[i + 1] + orderCandidates[i].minCost;
  }

  // Quick capacity upper bound
  const totalSystemCap = remCap.reduce((s, c, wi) => s + Math.min(c, remInv[wi]), 0);
  const minOrderQty = N > 0 ? Math.min(...orderCandidates.map((c) => c.order.quantity)) : 1;
  const maxOrderQty = N > 0 ? Math.max(...orderCandidates.map((c) => c.order.quantity)) : 1;
  const maxPossibleByCap = Math.floor(totalSystemCap / minOrderQty);

  if (requiredOrders !== null && requiredOrders > Math.min(suffixMaxOrders[0], maxPossibleByCap)) {
    return {
      status: 'INFEASIBLE',
      optimalityProven: true,
      fulfilledOrders: 0,
      criticalFulfilled: 0,
      transportCost: Infinity,
      assignmentsByOrder: new Map(),
      nodesExplored: 1,
      timedOut: false,
    };
  }

  // A single edited quantity in a uniform batch only adds one warehouse choice.
  // Enumerate that order and solve each remaining uniform batch by minimum-cost flow.
  const sizes = new Map<number, number>();
  for (const c of orderCandidates) sizes.set(c.order.quantity, (sizes.get(c.order.quantity) ?? 0) + 1);
  const unusual = sizes.size === 2 && N > 2
    ? orderCandidates.find(c => sizes.get(c.order.quantity) === 1) : undefined;
  const timeLimitsBind = orderCandidates.some(c => c.validW.some(w => limits[w.wIdx][w.latest] < remCap[w.wIdx]));
  if (unusual && !timeLimitsBind) {
    const o = unusual.order;
    const choices = [null, ...unusual.validW];
    let best: AssignmentSubproblemResult | undefined;
    let timedOut = false;
    let nodes = 0;
    for (const choice of choices) {
      if (performance.now() >= deadlinePerfNow) { timedOut = true; break; }
      const selected = Number(choice !== null);
      const critical = selected * Number(unusual.isCritical);
      const remaining: CityNetwork = { ...network,
        // Resources in wStates already include the selected disruptions and packages.
        warehouses: warehouses.map((w, wi) => {
          const used = choice?.wIdx === wi ? o.quantity : 0;
          const ws = wStates.get(w.id)!;
          return { ...w, status: ws.available ? 'ACTIVE' : 'OUTAGE', inventory: ws.effectiveInventory - used,
            processingCapacity: ws.effectiveCapacity - used };
        }),
        disruptions: network.disruptions.filter(d => d.type === 'ROUTE_CLOSURE'),
        interventions: network.interventions.map(i => ({ ...i, inventoryDelta: 0, capacityDelta: 0 })),
        orders: network.orders.filter(other => other.id !== o.id),
      };
      const criticalNeeded = Math.max(0, requiredCritical - critical);
      const target = requiredOrders === null ? null : Math.max(criticalNeeded, requiredOrders - selected);
      const result = solveAssignmentForFixedInterventions(remaining, activatedInterventionIds, protectCritical,
        target, criticalNeeded, deadlinePerfNow);
      nodes += result.nodesExplored;
      timedOut ||= result.timedOut;
      if (result.status !== 'OPTIMAL' && result.status !== 'FEASIBLE') continue;
      result.fulfilledOrders += selected;
      result.criticalFulfilled += critical;
      result.transportCost += choice?.cost ?? 0;
      result.assignmentsByOrder.set(o.id, choice?.wId ?? null);
      const priorityGain = best && protectCritical ? result.criticalFulfilled - best.criticalFulfilled : 0;
      const serviceGain = best ? result.fulfilledOrders - best.fulfilledOrders : 0;
      if (!best || (requiredOrders === null ? priorityGain || serviceGain || best.transportCost - result.transportCost
        : best.transportCost - result.transportCost) > 0) best = result;
    }
    if (best) return { ...best, status: timedOut ? 'FEASIBLE' : 'OPTIMAL', optimalityProven: !timedOut, timedOut, nodesExplored: nodes };
    return { status: timedOut ? 'UNKNOWN' : 'INFEASIBLE', optimalityProven: !timedOut, timedOut, nodesExplored: nodes,
      fulfilledOrders: 0, criticalFulfilled: 0, transportCost: Infinity, assignmentsByOrder: new Map() };
  }

  // Exact Successive Shortest Path Minimum-Cost Flow (guaranteed integer global optimum in polynomial O(F * E) time)
  // Applicable whenever all orders share a uniform quantity `q` (standard indivisible order unit).
  if (N > 0 && minOrderQty === maxOrderQty && minOrderQty > 0) {
    const q = minOrderQty;
    const W = wIds.length;
    const SOURCE = 0;
    const periods = timeline.length;
    const orderOffset = 1 + W * periods;
    const SINK = orderOffset + N;
    const hubNode = (wi: number, period: number) => 1 + wi * periods + period;
    const totalNodes = SINK + 1;

    interface Edge {
      to: number;
      rev: number;
      cap: number;
      flow: number;
      cost: number;
    }

    const adj: Edge[][] = Array.from({ length: totalNodes }, () => []);
    const addEdge = (u: number, v: number, cap: number, cost: number) => {
      const a: Edge = { to: v, rev: adj[v].length, cap, flow: 0, cost };
      const b: Edge = { to: u, rev: adj[u].length, cap: 0, flow: 0, cost: -cost };
      adj[u].push(a);
      adj[v].push(b);
    };

    for (let wi = 0; wi < W; wi++) {
      for (let t = periods - 1; t >= 0; t--) {
        const from = t === periods - 1 ? SOURCE : hubNode(wi, t + 1);
        addEdge(from, hubNode(wi,t), Math.floor(limits[wi][t] / q), 0);
      }
    }

    // One protected order outweighs the cost of every possible assignment combined.
    const priorityBonus = protectCritical
      ? 1 + orderCandidates.reduce((sum, item) => sum + Math.round((item.validW.at(-1)?.cost ?? 0) * 100), 0)
      : 0;
    for (let oi = 0; oi < N; oi++) {
      const cand = orderCandidates[oi];
      const orderNode = orderOffset + oi;
      for (const vw of cand.validW) {
        addEdge(hubNode(vw.wIdx, vw.latest), orderNode, 1, Math.round(vw.cost * 100));
      }
      addEdge(orderNode, SINK, 1, cand.isCritical ? -priorityBonus : 0);
    }

    let totalFlow = 0;
    let spfaIterations = 0;
    let timedOut = false;

    while (true) {
      if (requiredOrders !== null && totalFlow >= requiredOrders) {
        // In target mode, stop once requiredOrders is reached (since each augmenting path is min-cost)
        break;
      }
      if (performance.now() >= deadlinePerfNow) { timedOut = true; break; }
      const dist = new Array(totalNodes).fill(Infinity);
      const parentNode = new Array(totalNodes).fill(-1);
      const parentEdge = new Array(totalNodes).fill(-1);
      const inQueue = new Array(totalNodes).fill(false);
      const queue: number[] = [SOURCE];
      dist[SOURCE] = 0;
      inQueue[SOURCE] = true;

      let head = 0;
      while (head < queue.length) {
        const u = queue[head++];
        inQueue[u] = false;
        for (let ei = 0; ei < adj[u].length; ei++) {
          const e = adj[u][ei];
          if (e.cap - e.flow > 0 && dist[u] + e.cost < dist[e.to]) {
            dist[e.to] = dist[u] + e.cost;
            parentNode[e.to] = u;
            parentEdge[e.to] = ei;
            if (!inQueue[e.to]) {
              inQueue[e.to] = true;
              queue.push(e.to);
            }
          }
        }
      }

      if (dist[SINK] === Infinity) break;
      spfaIterations++;

      // Push 1 unit of flow along shortest augmenting path
      let cur = SINK;
      while (cur !== SOURCE) {
        const p = parentNode[cur];
        const ei = parentEdge[cur];
        adj[p][ei].flow += 1;
        const revIdx = adj[p][ei].rev;
        adj[cur][revIdx].flow -= 1;
        cur = p;
      }
      totalFlow += 1;
    }

    const assignmentsByOrder = new Map<string, string | null>();
    let realTransportCost = 0;
    let criticalFulfilled = 0;

    for (let oi = 0; oi < N; oi++) {
      const cand = orderCandidates[oi];
      const orderNode = orderOffset + oi;
      let assignedW: string | null = null;
      for (const vw of cand.validW) {
        const wi = vw.wIdx;
        const reverse = adj[orderNode].find(e => e.to === hubNode(wi, vw.latest) && e.flow < 0);
        const edge = reverse && adj[reverse.to][reverse.rev];
        if (edge) {
          assignedW = wIds[wi];
          realTransportCost += edge.cost / 100;
          if (cand.isCritical) criticalFulfilled++;
          break;
        }
      }
      assignmentsByOrder.set(cand.order.id, assignedW);
    }

    if (
      requiredOrders !== null &&
      (totalFlow < requiredOrders || (protectCritical && criticalFulfilled < requiredCritical))
    ) {
      return {
        status: timedOut ? 'UNKNOWN' : 'INFEASIBLE',
        optimalityProven: !timedOut,
        fulfilledOrders: totalFlow,
        criticalFulfilled,
        transportCost: Infinity,
        assignmentsByOrder: new Map(),
        nodesExplored: spfaIterations,
        timedOut,
      };
    }

    return {
      status: timedOut ? 'FEASIBLE' : 'OPTIMAL',
      optimalityProven: !timedOut,
      fulfilledOrders: totalFlow,
      criticalFulfilled,
      transportCost: realTransportCost,
      assignmentsByOrder,
      nodesExplored: Math.max(1, spfaIterations),
      timedOut,
    };
  }

  let bestFulfilled = -1;
  let bestCritical = -1;
  let bestCost = Infinity;
  let bestAssign: (number | null)[] | null = null;
  const curAssign: (number | null)[] = new Array(N).fill(null);
  let nodesExplored = 0;
  let timedOut = false;

  const isTargetMode = requiredOrders !== null;

  // Helper to compute lower bound on additional cost needed to fulfill `neededMore` orders from [idx..N-1]
  function minAdditionalCostBound(idx: number, neededMore: number): number {
    if (neededMore <= 0) return 0;
    if (neededMore === suffixMaxOrders[idx]) return suffixSumMinCost[idx];
    const costs: number[] = [];
    for (let k = idx; k < N; k++) {
      if (orderCandidates[k].validW.length > 0) {
        costs.push(orderCandidates[k].minCost);
      }
    }
    if (costs.length < neededMore) return Infinity;
    costs.sort((a, b) => a - b);
    let sum = 0;
    for (let k = 0; k < neededMore; k++) sum += costs[k];
    return sum;
  }

  function dfs(
    idx: number,
    fulfilled: number,
    criticalFulfilled: number,
    costSoFar: number,
    remSystemBindingUnits: number,
  ) {
    nodesExplored++;
    if ((nodesExplored & 255) === 0 && performance.now() > deadlinePerfNow) {
      timedOut = true;
      return;
    }
    if (timedOut) return;

    const capBoundMore = Math.floor(remSystemBindingUnits / minOrderQty);
    const maxAdditionalOrders = Math.min(suffixMaxOrders[idx], capBoundMore);
    const maxReachableOrders = fulfilled + maxAdditionalOrders;
    const maxReachableCritical =
      criticalFulfilled + Math.min(suffixMaxCritical[idx], capBoundMore);

    if (isTargetMode) {
      if (maxReachableOrders < requiredOrders) return;
      if (protectCritical && maxReachableCritical < requiredCritical) return;
      const neededMore = Math.max(0, requiredOrders - fulfilled);
      if (costSoFar + minAdditionalCostBound(idx, neededMore) >= bestCost) return;
    } else {
      if (protectCritical) {
        if (maxReachableCritical < bestCritical) return;
        if (maxReachableCritical === bestCritical && maxReachableOrders < bestFulfilled) {
          return;
        }
        if (
          maxReachableCritical === bestCritical &&
          maxReachableOrders === bestFulfilled
        ) {
          const neededMore = bestFulfilled - fulfilled;
          if (costSoFar + minAdditionalCostBound(idx, neededMore) >= bestCost) return;
        }
      } else {
        if (maxReachableOrders < bestFulfilled) return;
        if (maxReachableOrders === bestFulfilled) {
          const neededMore = bestFulfilled - fulfilled;
          if (costSoFar + minAdditionalCostBound(idx, neededMore) >= bestCost) return;
        }
      }
    }

    if (idx === N || (isTargetMode && fulfilled >= requiredOrders && criticalFulfilled >= requiredCritical)) {
      if (isTargetMode) {
        if (
          fulfilled >= requiredOrders &&
          (!protectCritical || criticalFulfilled >= requiredCritical) &&
          costSoFar < bestCost
        ) {
          bestFulfilled = fulfilled;
          bestCritical = criticalFulfilled;
          bestCost = costSoFar;
          bestAssign = [...curAssign];
        }
      } else {
        const better = protectCritical
          ? criticalFulfilled > bestCritical ||
            (criticalFulfilled === bestCritical && fulfilled > bestFulfilled) ||
            (criticalFulfilled === bestCritical &&
              fulfilled === bestFulfilled &&
              costSoFar < bestCost)
          : fulfilled > bestFulfilled || (fulfilled === bestFulfilled && costSoFar < bestCost);

        if (better) {
          bestFulfilled = fulfilled;
          bestCritical = criticalFulfilled;
          bestCost = costSoFar;
          bestAssign = [...curAssign];
        }
      }
      return;
    }

    const cand = orderCandidates[idx];
    const qty = cand.order.quantity;

    // Try assigning to each eligible warehouse in increasing cost order
    for (let i = 0; i < cand.validW.length; i++) {
      const { wIdx, cost, latest } = cand.validW[i];
      if (remInv[wIdx] >= qty && remCap[wIdx] >= qty && limits[wIdx].slice(latest).every(v => v >= qty)) {
        for (let t = latest; t < timeline.length; t++) limits[wIdx][t] -= qty;
        const prevBinding = Math.min(remInv[wIdx], remCap[wIdx]);
        remInv[wIdx] -= qty;
        remCap[wIdx] -= qty;
        const newBinding = Math.min(remInv[wIdx], remCap[wIdx]);
        curAssign[idx] = wIdx;

        dfs(
          idx + 1,
          fulfilled + 1,
          criticalFulfilled + (cand.isCritical ? 1 : 0),
          costSoFar + cost,
          remSystemBindingUnits - (prevBinding - newBinding),
        );

        curAssign[idx] = null;
        for (let t = latest; t < timeline.length; t++) limits[wIdx][t] += qty;
        remInv[wIdx] += qty;
        remCap[wIdx] += qty;
        if (timedOut) return;
      }
    }

    // Option to leave order unfulfilled
    curAssign[idx] = null;
    dfs(idx + 1, fulfilled, criticalFulfilled, costSoFar, remSystemBindingUnits);
  }

  dfs(0, 0, 0, 0, totalSystemCap);

  const assignmentsByOrder = new Map<string, string | null>();
  if (bestAssign) {
    for (let i = 0; i < N; i++) {
      const wIdx = bestAssign[i];
      assignmentsByOrder.set(orderCandidates[i].order.id, wIdx !== null ? wIds[wIdx] : null);
    }
  } else {
    for (const o of network.orders) {
      assignmentsByOrder.set(o.id, null);
    }
  }

  if (bestAssign === null) {
    return {
      status: timedOut ? 'UNKNOWN' : 'INFEASIBLE',
      optimalityProven: !timedOut,
      fulfilledOrders: 0,
      criticalFulfilled: 0,
      transportCost: Infinity,
      assignmentsByOrder,
      nodesExplored,
      timedOut,
    };
  }

  return {
    status: timedOut ? 'FEASIBLE' : 'OPTIMAL',
    optimalityProven: !timedOut,
    fulfilledOrders: bestFulfilled,
    criticalFulfilled: bestCritical,
    transportCost: bestCost,
    assignmentsByOrder,
    nodesExplored,
    timedOut,
  };
}

function buildRecoveryPlanObject(
  network: CityNetwork,
  stage: SolverStage,
  config: PlannerConfig,
  subResult: AssignmentSubproblemResult,
  activatedInterventions: InterventionPackage[],
  naturalMaxOrders: number,
  maxPossibleOrdersWithPermitted: number,
  solveTimeMs: number,
): RecoveryPlan {
  const inputHash = computeNetworkInputHash(network, config);
  const activatedIds = new Set(activatedInterventions.map((i) => i.id));
  const index = indexRoutes(network);
  const wStates = computeEffectiveWarehouseStates(network, activatedIds);

  const usedInv = new Map<string, number>();
  const usedCap = new Map<string, number>();
  for (const w of network.warehouses) {
    usedInv.set(w.id, 0);
    usedCap.set(w.id, 0);
  }

  const schedule = scheduleAssignments(network, subResult.assignmentsByOrder, activatedIds, index);
  const committed = new Map<string,number>();
  for (const [id,wh] of subResult.assignmentsByOrder) {
    if (wh) committed.set(wh,(committed.get(wh) ?? 0) + index.orders.get(id)!.quantity);
  }
  const assignments: OrderAssignmentResult[] = [];
  let transportAssignmentCost = 0;
  let fulfilledOrders = 0;
  let criticalOrdersFulfilled = 0;
  const criticalOrdersTotal = network.orders.filter((o) => o.priority === 'CRITICAL').length;

  const warehouseById = new Map(network.warehouses.map((w) => [w.id, w]));

  for (const o of network.orders) {
    const orderCity = String(o.cityId || network.cityId);
    const assignedWId =
      subResult.status === 'OPTIMAL' || subResult.status === 'FEASIBLE'
        ? subResult.assignmentsByOrder.get(o.id) || null
        : null;

    if (assignedWId) {
      const rt = isRouteAvailableAndTimely(network, assignedWId, o.id, activatedIds, index);
      const assignedWh = warehouseById.get(assignedWId);
      const assignedWhCity = assignedWh ? String(assignedWh.cityId || network.cityId) : null;
      const isCrossCity =
        assignedWhCity !== null && assignedWhCity.toLowerCase() !== orderCity.toLowerCase();
      const rawTr = index.routes.get(assignedWId)?.get(o.id);
      const corridorMode =
        rawTr?.corridorMode ||
        (isCrossCity
          ? rt.roadDistanceKm > 420
            ? 'INTER_CITY_AIR_CARGO'
            : 'INTER_CITY_HIGHWAY'
          : 'INTRA_CITY_VAN');

      usedInv.set(assignedWId, (usedInv.get(assignedWId) || 0) + o.quantity);
      usedCap.set(assignedWId, (usedCap.get(assignedWId) || 0) + o.quantity);
      transportAssignmentCost += rt.pricePerOrder;
      fulfilledOrders++;
      if (o.priority === 'CRITICAL') criticalOrdersFulfilled++;

      assignments.push({
        orderId: o.id,
        customerName: o.customerName,
        orderCityId: orderCity,
        pincode: o.pincode,
        quantity: o.quantity,
        priority: o.priority,
        deadlineHours: o.deadlineHours,
        baselineWarehouseId: o.baselineWarehouseId,
        assignedWarehouseId: assignedWId,
        assignedWarehouseCityId: assignedWhCity,
        isCrossCity,
        corridorMode,
        transportOptionId: rt.transportOptionId,
        roadDistanceKm: rt.roadDistanceKm,
        estimatedTimeHours: schedule.arrivals.get(o.id)!,
        transportCost: rt.pricePerOrder,
        fulfilledOnTime: true,
        reassigned: assignedWId !== o.baselineWarehouseId,
        provenanceLabel: 'Computed model result',
      });
    } else {
      // Determine honest operational blocker for unfulfilled order
      const reasons: string[] = [];
      for (const w of network.warehouses) {
        const ws = wStates.get(w.id)!;
        const route = isRouteAvailableAndTimely(network, w.id, o.id, activatedIds, index);
        let reason: string;
        if (!ws.available) reason = 'warehouse offline';
        else if (!route.available) reason = route.exists ? 'route closed' : 'no route';
        else if (!route.onTime) reason = `arrives ${Math.ceil((route.estimatedTimeHours - o.deadlineHours) * 60)} min late`;
        else {
          const latest = schedule.timeline.reduce((last,step,i) => isRouteAvailableAndTimely(network,w.id,o.id,activatedIds,index,step.time).onTime ? i : last, -1);
          const free = Math.max(0, Math.min(...schedule.balances.get(w.id)!.slice(latest)));
          const used = committed.get(w.id) ?? 0;
          if (ws.effectiveInventory - used < o.quantity) reason = `${ws.effectiveInventory-used} units of stock left, ${o.quantity} needed`;
          else if (ws.effectiveCapacity - used < o.quantity) reason = `${ws.effectiveCapacity-used} units of handling capacity left, ${o.quantity} needed`;
          else if (free < o.quantity) reason = `${free} units available by deadline, ${o.quantity} needed`;
          else reason = 'can deliver with remaining resources; outside selected plan';
        }
        reasons.push(`${w.id}: ${reason}`);
      }

      assignments.push({
        orderId: o.id,
        customerName: o.customerName,
        orderCityId: orderCity,
        pincode: o.pincode,
        quantity: o.quantity,
        priority: o.priority,
        deadlineHours: o.deadlineHours,
        baselineWarehouseId: o.baselineWarehouseId,
        assignedWarehouseId: null,
        assignedWarehouseCityId: null,
        isCrossCity: false,
        corridorMode: null,
        transportOptionId: null,
        roadDistanceKm: null,
        estimatedTimeHours: null,
        transportCost: 0,
        fulfilledOnTime: false,
        reassigned: false,
        unfulfilledReason: reasons.join('; '),
        provenanceLabel: 'Computed model result',
      });
    }
  }

  const interventionActivationCost =
    subResult.status === 'OPTIMAL' || subResult.status === 'FEASIBLE'
      ? activatedInterventions.reduce((s, i) => s + Math.round(i.activationPrice * 100), 0) / 100
      : 0;
  transportAssignmentCost = Math.round(transportAssignmentCost * 100) / 100;
  const totalRecoveryCost = Math.round((transportAssignmentCost + interventionActivationCost) * 100) / 100;

  const totalOrders = network.orders.length;
  const achievedServicePct =
    totalOrders > 0 ? Math.round((fulfilledOrders / totalOrders) * 1000) / 10 : 0;
  const naturalMaxServicePct =
    totalOrders > 0 ? Math.round((naturalMaxOrders / totalOrders) * 1000) / 10 : 0;
  const maxPossibleServicePct =
    totalOrders > 0 ? Math.round((maxPossibleOrdersWithPermitted / totalOrders) * 1000) / 10 : 0;

  const physicallyFeasible = subResult.status === 'OPTIMAL' || subResult.status === 'FEASIBLE';
  const budgetShortfall =
    physicallyFeasible && totalRecoveryCost > config.availableBudget
      ? Math.round((totalRecoveryCost - config.availableBudget) * 100) / 100
      : 0;
  const budgetCompliant = physicallyFeasible && budgetShortfall === 0;

  const infeasibilityExplanation: string[] = [];
  if (!physicallyFeasible) {
    infeasibilityExplanation.push(subResult.status === 'UNKNOWN'
      ? 'Search timed out before a plan meeting the requested target was found.'
      : `No assignment meets the ${config.targetServicePct}% target under the selected resources and priority policy.`);
    const unpermittedCount = network.interventions.filter(
      (i) => i.eligible && !config.permittedInterventionIds.includes(i.id),
    ).length;
    if (unpermittedCount > 0) {
      infeasibilityExplanation.push(
        `${unpermittedCount} eligible emergency intervention package(s) are currently unchecked/disabled.`,
      );
    }
    for (const a of assignments) {
      if (!a.fulfilledOnTime && a.unfulfilledReason) {
        infeasibilityExplanation.push(`Order ${a.orderId} (${a.customerName}): ${a.unfulfilledReason}.`);
      }
    }
  } else if (!budgetCompliant) {
    infeasibilityExplanation.push(
      `Target (${config.targetServicePct}%) is physically feasible (plan cost ₹${totalRecoveryCost}, including ₹${interventionActivationCost} intervention activation), which exceeds the available budget ceiling of ₹${config.availableBudget} by ₹${budgetShortfall}.`,
    );
  }

  const warehouseUtilization = network.warehouses.map((w) => {
    const ws = wStates.get(w.id)!;
    return {
      warehouseId: w.id,
      warehouseName: w.name,
      status: ws.available ? 'OPERATIONAL' : 'OUTAGE',
      baseInventory: ws.baseInventory,
      effectiveInventory: ws.effectiveInventory,
      usedInventory: usedInv.get(w.id) || 0,
      baseCapacity: ws.baseCapacity,
      effectiveCapacity: ws.effectiveCapacity,
      usedCapacity: usedCap.get(w.id) || 0,
    };
  });

  const plan: RecoveryPlan = {
    runId: `run-${stage}-${Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), v => v.toString(16).padStart(8, '0')).join('')}`,
    cityId: network.cityId,
    cityName: network.name,
    inputHash,
    stage,
    solverStatus: subResult.status,
    optimalityProven: subResult.optimalityProven && subResult.status === 'OPTIMAL',
    solveTimeMs: Math.round(solveTimeMs * 100) / 100,
    nodesExplored: subResult.nodesExplored,
    totalOrders,
    fulfilledOrders,
    unfulfilledOrdersCount: totalOrders - fulfilledOrders,
    criticalOrdersTotal,
    criticalOrdersFulfilled,
    achievedServicePct,
    requestedTargetPct: config.targetServicePct,
    maxPossibleServicePct,
    naturalMaxOrders,
    naturalMaxServicePct,
    transportAssignmentCost,
    interventionActivationCost,
    totalRecoveryCost,
    availableBudget: config.availableBudget,
    budgetCompliant,
    budgetShortfall,
    physicallyFeasible,
    infeasibilityExplanation,
    activatedInterventions: physicallyFeasible ? activatedInterventions : [],
    assignments,
    warehouseUtilization,
    verification: {
      overallStatus: 'PASS',
      passedCount: 0,
      totalChecks: 0,
      checks: [],
      summary: '',
      verifiedAt: new Date().toISOString(),
    },
    provenance: {
      classification: 'Computed model result',
      sourceFile: `Recovery assignment solver (${stage})`,
      seed: network.seed,
      assumptions: `Input hash ${inputHash}; priority protection=${config.protectCriticalOrders}`,
      datasetVersion: network.schemaVersion,
    },
    createdAt: new Date().toISOString(),
  };

  plan.verification = verifyRecoveryPlan(network, plan, config);
  return plan;
}

/**
 * Solves Stage A (Maximum Existing-Resource Recovery) and Stage B (Cheapest Natural Recovery)
 * without emergency interventions (F07, F10).
 */
export function solveNaturalRecovery(
  rawNetwork: CityNetwork,
  protectCriticalOrders = true,
  timeoutMs = 3000,
): { stageA: RecoveryPlan; stageB: RecoveryPlan } {
  const network = maybeHydrate(rawNetwork);
  const startPerf = performance.now();
  const deadlinePerf = startPerf + timeoutMs;
  const emptySet = new Set<string>();

  // Stage A establishes maximum recoverable orders (and critical orders) and minimum cost at that max
  const resA = solveAssignmentForFixedInterventions(
    network,
    emptySet,
    protectCriticalOrders,
    null,
    0,
    deadlinePerf,
  );

  // The natural objective already minimizes cost at the attained service level.
  const resB = resA;
  const elapsed = performance.now() - startPerf;
  const naturalTargetPct =
    network.orders.length > 0
      ? Math.round((resA.fulfilledOrders / network.orders.length) * 1000) / 10
      : 0;

  const baseConfig: PlannerConfig = {
    targetServicePct: naturalTargetPct,
    availableBudget: Number.isFinite(resA.transportCost) ? Math.round(resA.transportCost * 100) / 100 : 0,
    permittedInterventionIds: [],
    protectCriticalOrders,
    timeoutMs,
  };

  const stageA = buildRecoveryPlanObject(
    network,
    'STAGE_A_MAX_NATURAL',
    baseConfig,
    resA,
    [],
    resA.fulfilledOrders,
    resA.fulfilledOrders,
    elapsed,
  );

  const stageB = buildRecoveryPlanObject(
    network,
    'STAGE_B_CHEAPEST_NATURAL',
    baseConfig,
    resB,
    [],
    resA.fulfilledOrders,
    resA.fulfilledOrders,
    elapsed,
  );

  return { stageA, stageB };
}

/**
 * Solves Stage C — Target-Based Minimum-Cost Recovery with Priced Interventions (F08, F09, F11, F12, F13, F15)
 */
export function solveTargetRecovery(
  rawNetwork: CityNetwork,
  config: PlannerConfig,
): RecoveryPlan {
  const network = maybeHydrate(rawNetwork);
  const startPerf = performance.now();
  const timeoutMs = config.timeoutMs ?? 4000;
  const deadlinePerf = startPerf + timeoutMs;

  const totalOrders = network.orders.length;
  const requiredOrders = Math.ceil((config.targetServicePct / 100) * totalOrders - 1e-9);

  // First compute Stage A natural maximum (0 interventions)
  const naturalRes = solveAssignmentForFixedInterventions(
    network,
    new Set(),
    config.protectCriticalOrders,
    null,
    0,
    startPerf + timeoutMs / 3,
  );

  // Filter eligible permitted interventions
  const permittedInterventions = network.interventions.filter(
    (intv) => intv.eligible && config.permittedInterventionIds.includes(intv.id),
  );

  // Also establish max possible service when ALL permitted interventions are active
  const allPermittedIds = new Set(permittedInterventions.map((i) => i.id));
  const maxPermittedRes = solveAssignmentForFixedInterventions(
    network,
    allPermittedIds,
    config.protectCriticalOrders,
    null,
    0,
    startPerf + timeoutMs * 2 / 3,
  );

  // Required critical orders under priority protection policy:
  // If protectCriticalOrders is true, require at least as many critical orders as are physically achievable
  // up to the target requirement
  const totalCritical = network.orders.filter((o) => o.priority === 'CRITICAL').length;
  const requiredCritical = config.protectCriticalOrders
    ? Math.min(totalCritical, maxPermittedRes.criticalFulfilled, requiredOrders)
    : 0;

  let bestTotalCost = Infinity;
  const best: { result?: AssignmentSubproblemResult } = {};
  let bestInterventions: InterventionPackage[] = [];
  let totalNodesExplored = naturalRes.nodesExplored + maxPermittedRes.nodesExplored;
  let anyTimedOut = naturalRes.timedOut || maxPermittedRes.timedOut;

  // Minimum possible transport cost for requiredOrders
  const cheapestRoute = new Map<string,number>();
  for (const r of network.transportOptions) cheapestRoute.set(r.orderId, Math.min(r.pricePerOrder, cheapestRoute.get(r.orderId) ?? Infinity));
  const allMinOrderCosts = network.orders
.map(o => cheapestRoute.get(o.id) ?? 0)
    .sort((a, b) => a - b);
  const lowerBoundTransport = allMinOrderCosts
    .slice(0, requiredOrders)
    .reduce((s, c) => s + c, 0);

  // Seed a feasible plan before searching subsets so a timeout retains usable assignments.
  function consider(result: AssignmentSubproblemResult, list: InterventionPackage[], price: number) {
    if ((result.status === 'OPTIMAL' || result.status === 'FEASIBLE') &&
        result.fulfilledOrders >= requiredOrders && result.criticalFulfilled >= requiredCritical &&
        price + result.transportCost < bestTotalCost) {
      bestTotalCost = price + result.transportCost;
      best.result = { ...result };
      bestInterventions = [...list];
    }
  }
  if (requiredOrders === 0) consider({status:'OPTIMAL', optimalityProven:true, fulfilledOrders:0,
    criticalFulfilled:0, transportCost:0, assignmentsByOrder:new Map(), nodesExplored:0, timedOut:false}, [], 0);
  consider(naturalRes, [], 0);
  consider(maxPermittedRes, permittedInterventions, permittedInterventions.reduce((sum, p) => sum + p.activationPrice, 0));

  // Visit each combination lazily. Nonnegative prices bound all its supersets.
  function search(start: number, list: InterventionPackage[], price: number) {
    if (price + lowerBoundTransport >= bestTotalCost) return;
    if (performance.now() > deadlinePerf) {
      anyTimedOut = true;
      return;
    }
    const activeIds = new Set(list.map(i => i.id));
    const subRes = solveAssignmentForFixedInterventions(
      network,
      activeIds,
      config.protectCriticalOrders,
      requiredOrders,
      requiredCritical,
      deadlinePerf,
    );
    totalNodesExplored += subRes.nodesExplored;
    if (subRes.timedOut) anyTimedOut = true;

    consider(subRes, list, price);
    for (let i = start; i < permittedInterventions.length; i++) {
      if (price + lowerBoundTransport >= bestTotalCost) break;
      if (performance.now() > deadlinePerf) { anyTimedOut = true; break; }
      const item = permittedInterventions[i];
      search(i + 1, [...list, item], price + item.activationPrice);
    }
  }
  if (maxPermittedRes.timedOut || (maxPermittedRes.fulfilledOrders >= requiredOrders) || config.protectCriticalOrders) {
    search(0, [], 0);
  }

  const elapsed = performance.now() - startPerf;

  const bestSubResult = best.result;
  if (!bestSubResult) {
    const failedRes: AssignmentSubproblemResult = {
      status: anyTimedOut ? 'UNKNOWN' : 'INFEASIBLE',
      optimalityProven: !anyTimedOut,
      fulfilledOrders: maxPermittedRes.fulfilledOrders,
      criticalFulfilled: maxPermittedRes.criticalFulfilled,
      transportCost: 0,
      assignmentsByOrder: new Map(),
      nodesExplored: totalNodesExplored,
      timedOut: anyTimedOut,
    };

    return buildRecoveryPlanObject(
      network,
      'STAGE_C_TARGET_RECOVERY',
      config,
      failedRes,
      [],
      naturalRes.fulfilledOrders,
      maxPermittedRes.fulfilledOrders,
      elapsed,
    );
  }

  bestSubResult.nodesExplored = totalNodesExplored;
  if (anyTimedOut) {
    bestSubResult.status = 'FEASIBLE';
    bestSubResult.optimalityProven = false;
  }

  return buildRecoveryPlanObject(
    network,
    'STAGE_C_TARGET_RECOVERY',
    config,
    bestSubResult,
    bestInterventions,
    naturalRes.fulfilledOrders,
    maxPermittedRes.fulfilledOrders,
    elapsed,
  );
}
