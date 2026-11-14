import { analyzeImmediateImpact, solveNaturalRecovery, solveTargetRecovery } from './solver';
import { solveWithinBudget, type BudgetResult } from './budget';
import type { CityNetwork, PlannerConfig, ImpactAnalysisResult, RecoveryPlan } from '../types/recovery';

export interface PlannerResults {
  impact: ImpactAnalysisResult;
  stageA: RecoveryPlan;
  stageB: RecoveryPlan;
  stageC: RecoveryPlan;
  budget: BudgetResult;
}

self.onmessage = (event: MessageEvent<{ network: CityNetwork; config: PlannerConfig }>) => {
  const { network, config } = event.data;
  const impact = analyzeImmediateImpact(network);
  const natural = solveNaturalRecovery(network, config.protectCriticalOrders);
  const stageC = solveTargetRecovery(network, config);
  const budget = solveWithinBudget(network, config, stageC);
  self.postMessage({ impact, ...natural, stageC, budget } satisfies PlannerResults);
};
