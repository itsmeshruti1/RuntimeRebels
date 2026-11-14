export type ProvenanceClass =
  | 'Sourced'
  | 'Simulated'
  | 'Derived'
  | 'Derived with simulated assumptions'
  | 'Computed model result';

export interface ProvenanceMetadata {
  classification: ProvenanceClass;
  sourceFile?: string;
  sourceUrl?: string;
  bbox?: [number, number, number, number]; // [westLon, southLat, eastLon, northLat]
  snappingToleranceMeters?: number;
  seed?: number;
  assumptions?: string;
  datasetVersion: string;
}

export interface SourceFileAudit {
  specFilename: string;
  remoteUrl: string;
  expectedSizeMB?: number;
  coveredRegions: string[];
  localFilePresent?: boolean;
  status: 'REFERENCE_ONLY' | 'VERIFIED_EXTRACTED' | 'REMOTE_SOURCED_CACHE' | 'MISSING_LOCAL_RAW_PBF';
  sha256Prefix?: string;
  notes: string;
}

export type CityId =
  | 'bengaluru'
  | 'mumbai'
  | 'delhi_ncr'
  | 'chennai'
  | 'guwahati'
  | 'multi_city'
  | 'known_answer';

export type WorkbenchViewId = 'overview' | 'simulator' | 'planner' | 'comparison' | 'actionsheet';

export type CorridorMode = 'INTRA_CITY_VAN' | 'INTER_CITY_HIGHWAY' | 'INTER_CITY_AIR_CARGO';

export interface Warehouse {
  id: string;
  name: string;
  cityId: CityId | string;
  pincode: string;
  lat: number;
  lon: number;
  snappedNodeId: string;
  inventory: number;
  processingCapacity: number;
  status: 'ACTIVE' | 'OUTAGE' | 'DEGRADED';
  provenance: {
    coordinates: ProvenanceMetadata;
    operations: ProvenanceMetadata;
  };
}

export type OrderPriority = 'CRITICAL' | 'STANDARD';

export interface CustomerOrder {
  id: string;
  customerName: string;
  cityId: CityId | string;
  pincode: string;
  lat: number;
  lon: number;
  snappedNodeId: string;
  quantity: number;
  deadlineHours: number;
  priority: OrderPriority;
  baselineWarehouseId: string;
  provenance: {
    coordinates: ProvenanceMetadata;
    demand: ProvenanceMetadata;
  };
}

export interface TransportOption {
  id: string;
  warehouseId: string;
  orderId: string;
  roadDistanceKm: number;
  modeledSpeedKmh: number;
  handlingDelayHours: number;
  estimatedTimeHours: number;
  pricePerOrder: number;
  available: boolean;
  corridorMode?: CorridorMode;
  roadWayIds: string[];
  provenance: {
    distance: ProvenanceMetadata;
    time: ProvenanceMetadata;
    price: ProvenanceMetadata;
  };
}

export type InterventionType = 'EMERGENCY_STOCK' | 'HANDLING_CAPACITY' | 'TRANSPORT_CORRIDOR';

export interface InterventionPackage {
  id: string;
  name: string;
  cityId: CityId | string;
  type: InterventionType;
  affectedResourceId: string; // warehouseId or transportOptionId
  activationPrice: number;
  inventoryDelta: number;
  capacityDelta: number;
  restoresRoute: boolean;
  timeReductionHours: number;
  leadTimeHours: number;
  eligible: boolean;
  description: string;
  provenance: ProvenanceMetadata;
}

export type DisruptionType = 'WAREHOUSE_OUTAGE' | 'ROUTE_CLOSURE' | 'CAPACITY_REDUCTION' | 'INVENTORY_SHORTAGE';

export interface Disruption {
  id: string;
  type: DisruptionType;
  targetId: string; // warehouseId or transportOptionId (or warehouseId->orderId)
  severityPct: number; // 100 for full outage/closure, 1-99 for capacity/inventory reduction
  label: string;
  active: boolean;
}

export interface BaselineAssignment {
  orderId: string;
  warehouseId: string;
  transportOptionId: string;
  roadDistanceKm: number;
  estimatedTimeHours: number;
  transportCost: number;
  deliveredOnTime: boolean;
}

export interface CityNetwork {
  routeAssumptions?: import('../engine/routes').RouteAssumptions;
  cityId: CityId;
  name: string;
  regionZone: string;
  seed: number;
  schemaVersion: string;
  planningHorizonHours: number;
  bbox: [number, number, number, number];
  defaultModeledSpeedKmh: number;
  defaultHandlingDelayHours: number;
  warehouses: Warehouse[];
  orders: CustomerOrder[];
  transportOptions: TransportOption[];
  interventions: InterventionPackage[];
  disruptions: Disruption[];
  sourceAudits: SourceFileAudit[];
}

export type SolverStage =
  | 'BASELINE'
  | 'DISRUPTED_IMPACT'
  | 'STAGE_A_MAX_NATURAL'
  | 'STAGE_B_CHEAPEST_NATURAL'
  | 'STAGE_C_TARGET_RECOVERY';

export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';

export interface OrderAssignmentResult {
  orderId: string;
  customerName: string;
  orderCityId?: string;
  pincode: string;
  quantity: number;
  priority: OrderPriority;
  deadlineHours: number;
  baselineWarehouseId: string;
  assignedWarehouseId: string | null;
  assignedWarehouseCityId?: string | null;
  isCrossCity?: boolean;
  corridorMode?: CorridorMode | null;
  transportOptionId: string | null;
  roadDistanceKm: number | null;
  estimatedTimeHours: number | null;
  transportCost: number;
  fulfilledOnTime: boolean;
  reassigned: boolean;
  unfulfilledReason?: string;
  provenanceLabel: ProvenanceClass;
}

export interface ImpactAnalysisResult {
  inputHash: string;
  totalOrders: number;
  baselineFulfilledOrders: number;
  baselineServicePct: number;
  baselineCost: number;
  immediatelyAffectedOrderIds: string[];
  survivingBaselineOrderIds: string[];
  disruptedServicePctBeforeReassignment: number;
  disruptedRetainedCost: number;
  affectedWarehouses: string[];
  closedRoutesCount: number;
  orderImpacts: {
    orderId: string;
    customerName: string;
    priority: OrderPriority;
    baselineWarehouseId: string;
    status: 'UNAFFECTED' | 'AFFECTED_OUTAGE' | 'AFFECTED_ROUTE_CLOSED' | 'AFFECTED_CAPACITY_SHORTAGE' | 'AFFECTED_INVENTORY_SHORTAGE' | 'AFFECTED_DEADLINE';
    reason: string;
  }[];
}

export interface PlannerConfig {
  targetServicePct: number;
  availableBudget: number;
  permittedInterventionIds: string[];
  protectCriticalOrders: boolean;
  timeoutMs?: number;
}

export interface VerificationCheck {
  id: string;
  name: string;
  category:
    | 'ORDER_UNIQUENESS'
    | 'WAREHOUSE_STATUS'
    | 'INVENTORY_COMPLIANCE'
    | 'CAPACITY_COMPLIANCE'
    | 'TRANSPORT_ELIGIBILITY'
    | 'DEADLINE_COMPLIANCE'
    | 'PRIORITY_COMPLIANCE'
    | 'INTERVENTION_ELIGIBILITY'
    | 'INTERVENTION_EFFECTS'
    | 'COST_ACCURACY'
    | 'SERVICE_CALCULATION_ACCURACY'
    | 'TARGET_COMPLIANCE';
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

export interface VerificationReport {
  overallStatus: 'PASS' | 'FAIL';
  passedCount: number;
  totalChecks: number;
  checks: VerificationCheck[];
  summary: string;
  verifiedAt: string;
  corruptedTestMode?: boolean;
}

export interface RecoveryPlan {
  runId: string;
  cityId: CityId;
  cityName: string;
  inputHash: string;
  stage: SolverStage;
  solverStatus: SolverStatus;
  optimalityProven: boolean;
  solveTimeMs: number;
  nodesExplored: number;
  totalOrders: number;
  fulfilledOrders: number;
  unfulfilledOrdersCount: number;
  criticalOrdersTotal: number;
  criticalOrdersFulfilled: number;
  achievedServicePct: number;
  requestedTargetPct: number;
  maxPossibleServicePct: number;
  naturalMaxOrders: number;
  naturalMaxServicePct: number;
  transportAssignmentCost: number;
  interventionActivationCost: number;
  totalRecoveryCost: number;
  availableBudget: number;
  budgetCompliant: boolean;
  budgetShortfall: number;
  physicallyFeasible: boolean;
  infeasibilityExplanation: string[];
  activatedInterventions: InterventionPackage[];
  assignments: OrderAssignmentResult[];
  warehouseUtilization: {
    warehouseId: string;
    warehouseName: string;
    status: string;
    baseInventory: number;
    effectiveInventory: number;
    usedInventory: number;
    baseCapacity: number;
    effectiveCapacity: number;
    usedCapacity: number;
  }[];
  verification: VerificationReport;
  provenance: ProvenanceMetadata;
  createdAt: string;
}
