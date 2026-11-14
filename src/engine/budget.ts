import type { CityNetwork, PlannerConfig, RecoveryPlan } from '../types/recovery';
import { solveTargetRecovery, seedBudgetPlan } from './solver';

export interface BudgetResult {
  plan: RecoveryPlan;
  proven: boolean;
}

// At each service level the target solver finds the least cost under the same
// priority policy. Its minimum cost cannot decrease as the order count grows.
export function solveWithinBudget(
  network: CityNetwork,
  config: PlannerConfig,
  target: RecoveryPlan,
): BudgetResult {
  const total = network.orders.length;
  let best = target.budgetCompliant && target.verification.overallStatus === 'PASS' ? target : undefined;
  if (!best || best.fulfilledOrders < total) {
    const seed = seedBudgetPlan(network, config);
    if (seed.verification.overallStatus === 'PASS' && (!best || seed.fulfilledOrders > best.fulfilledOrders)) {
      best = seed;
    }
  }
  const deadline = performance.now() + (config.timeoutMs ?? 4000);
  let high = total;
  if (target.optimalityProven && !target.budgetCompliant) {
    high = Math.max(0, Math.ceil((config.targetServicePct * total) / 100 - 1e-9) - 1);
  }
  let low = (best?.fulfilledOrders ?? 0) + 1;
  while (low <= high && performance.now() < deadline) {
    const count = Math.ceil((low + high) / 2);
    const candidate = solveTargetRecovery(network, {
      ...config,
      targetServicePct: (count * 100) / total,
      timeoutMs: Math.max(1, deadline - performance.now()),
    });
    if (candidate.budgetCompliant && candidate.verification.overallStatus === 'PASS') {
      best = candidate;
      low = candidate.fulfilledOrders + 1;
    } else if (
      candidate.solverStatus === 'INFEASIBLE' ||
      (candidate.optimalityProven && !candidate.budgetCompliant)
    ) {
      high = count - 1;
    } else {
      break;
    }
  }
  // Zero orders require no packages or transport, including on an empty network.
  if (!best) throw new Error('Unable to verify a within-budget plan.');
  return { plan: best, proven: best.fulfilledOrders >= high };
}
