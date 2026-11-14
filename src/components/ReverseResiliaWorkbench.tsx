import React, { useMemo, useRef, useState } from 'react';
import {
  CityId,
  CityNetwork,
  CorridorMode,
  ImpactAnalysisResult,
  OrderPriority,
  ProvenanceClass,
  RecoveryPlan,
  VerificationReport,
  Warehouse,
  WorkbenchViewId,
} from '../types/recovery';
import {
  CROSS_CITY_WAREHOUSE_TEMPLATES,
  addCrossCityWarehouseToNetwork,
  appendSiteOrders,
  createWarehouseFromTemplate,
  hydrateCrossCityTransportOptions,
  removeWarehouseFromNetwork,
} from '../data/networks';
import {
  computeEffectiveWarehouseStates,
  createCorruptedPlanForAudit,
  verifyRecoveryPlan,
} from '../engine/verifier';
import {
  applyImportedWarehousesToNetwork,
  ExtractedWarehouseRow,
  parseWarehouseCsvText,
} from '../utils/warehouseFileImport';
import { importOrders, orderColumns } from '../engine/orderImport';
import { readScenario, downloadFile, type Scenario } from '../engine/scenario';
import type { BudgetResult } from '../engine/budget';
import { validateNetwork } from '../engine/validation';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Select,
  Slider,
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Notice,
} from './ui';
import { applyRouteAssumptions, type RouteAssumptions } from '../engine/routes';
import { csvRow } from '../engine/csv';
import { WarehouseMap } from './WarehouseMap';

interface ReverseResiliaWorkbenchProps {
  activeCityId: CityId;
  onSelectCity: (cityId: CityId) => void;
  activeView: WorkbenchViewId;
  onSelectView: (view: WorkbenchViewId) => void;
  network: CityNetwork;
  scenario: Scenario;
  budgetResult: BudgetResult;
  onUpdateNetwork: (updated: CityNetwork, imported?: boolean, restored?: Scenario) => void;
  onResetNetwork: () => void;
  onDefaultShock: () => void;
  targetServicePct: number;
  onChangeTargetServicePct: (pct: number) => void;
  availableBudget: number;
  onChangeAvailableBudget: (budget: number) => void;
  protectCritical: boolean;
  onChangeProtectCritical: (protect: boolean) => void;
  impactResult: ImpactAnalysisResult;
  stageAResult: RecoveryPlan;
  stageBResult: RecoveryPlan;
  stageCResult: RecoveryPlan;
  isStale: boolean;
  onRunEngines: () => void;
}

const CITY_TABS: { id: CityId; label: string; region: string; tag: string }[] = [
  { id: 'bengaluru', label: 'Bengaluru', region: 'Southern Zone', tag: '560001–560100' },
  { id: 'mumbai', label: 'Mumbai', region: 'Western Zone', tag: '400001–400708' },
  { id: 'delhi_ncr', label: 'Delhi NCR', region: 'Northern Zone', tag: '110001–201301' },
  { id: 'chennai', label: 'Chennai', region: 'Southern Zone', tag: '600001–600119' },
  { id: 'guwahati', label: 'Guwahati', region: 'North-Eastern Zone', tag: '781001–781039' },
  { id: 'multi_city', label: 'Pan-India Multi-City', region: 'Cross-Regional', tag: '6 CITIES' },
  { id: 'known_answer', label: '10-Order Benchmark', region: 'Deterministic Audit', tag: 'KA-BENCH-10' },
];

const CORRIDOR_MODE_LABELS: Record<CorridorMode, string> = {
  INTRA_CITY_VAN: 'LOCAL VAN',
  INTER_CITY_HIGHWAY: 'INTER-CITY NH',
  INTER_CITY_AIR_CARGO: 'AIR CARGO',
};

const VIEW_TABS: { id: WorkbenchViewId; anchorId: string; num: string; label: string; features: string }[] = [
  { id: 'overview', anchorId: 'overview', num: '01', label: 'Network Overview', features: 'F01–F04, F18' },
  { id: 'simulator', anchorId: 'simulator', num: '02', label: 'Disruption Simulator', features: 'F05–F07, F10' },
  { id: 'planner', anchorId: 'planner', num: '03', label: 'Recovery Planner', features: 'F08–F09, F11–F13, F15' },
  { id: 'comparison', anchorId: 'comparison', num: '04', label: 'Scenario Comparison', features: 'F16' },
  { id: 'actionsheet', anchorId: 'action-sheet', num: '05', label: 'Verified Action Sheet', features: 'F14, F17' },
];

const PROVENANCE_BADGE_STYLE: Record<ProvenanceClass, string> = {
  Sourced: 'border-[#0D0D0D] bg-[#0D0D0D] text-[#F5F4F0]',
  Derived: 'border-[#0D0D0D]/40 bg-[#E8E5DD] text-[#0D0D0D]',
  'Derived with simulated assumptions': 'border-[#786B59] bg-[#EFECE4] text-[#4E4436]',
  Simulated: 'border-[#0D0D0D]/25 bg-white text-[#52514E]',
  'Computed model result': 'border-[#1F4E3D] bg-[#E6F0EC] text-[#14382B]',
};

export const ReverseResiliaWorkbench: React.FC<ReverseResiliaWorkbenchProps> = ({
  activeCityId,
  onSelectCity,
  activeView,
  onSelectView,
  network,
  scenario,
  budgetResult,
  onUpdateNetwork,
  onResetNetwork,
  onDefaultShock,
  targetServicePct,
  onChangeTargetServicePct,
  availableBudget,
  onChangeAvailableBudget,
  protectCritical,
  onChangeProtectCritical,
  impactResult,
  stageAResult,
  stageBResult,
  stageCResult,
  isStale,
  onRunEngines,
}) => {
  const pageTitle = VIEW_TABS.find((tab) => tab.id === activeView)?.label;
  React.useEffect(() => {
    const previous = document.title;
    document.title = `${pageTitle} — ReverseResilia`;
    return () => { document.title = previous; };
  }, [pageTitle]);

  const [corruptedAuditPlan, setCorruptedAuditPlan] = useState<RecoveryPlan | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [jsonUploadText, setJsonUploadText] = useState<string>('');
  const [jsonUploadMsg, setJsonUploadMsg] = useState<string | null>(null);
  const [showJsonPanel, setShowJsonPanel] = useState<boolean>(false);

  const [addOrderMsg, setAddOrderMsg] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [csvMsg, setCsvMsg] = useState('');
  const [showBudget, setShowBudget] = useState(false);
  const [mapViewMode, setMapViewMode] = useState<'corridor' | 'osm'>('corridor');

  // Cross-city warehouse addition state
  const [showAddCrossCityPanel, setShowAddCrossCityPanel] = useState<boolean>(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(
    CROSS_CITY_WAREHOUSE_TEMPLATES[0].key
  );
  const [presetInv, setPresetInv] = useState<number>(100);
  const [presetCap, setPresetCap] = useState<number>(60);
  const [crossCityNotice, setCrossCityNotice] = useState<string | null>(null);
  const [mapScope, setMapScope] = useState<'full' | 'orders'>('full');

  // Single-file upload (PDF / CSV / Image) state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFileUploading, setIsFileUploading] = useState<boolean>(false);
  const [isDragOverFile, setIsDragOverFile] = useState<boolean>(false);
  const [fileUploadStatus, setFileUploadStatus] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const distinctWarehouseCities = useMemo(
    () => Array.from(new Set(network.warehouses.map((w) => String(w.cityId || network.cityId)))),
    [network.warehouses, network.cityId]
  );

  const activePlan = corruptedAuditPlan || (showBudget ? budgetResult.plan : stageCResult);
  const orderResults = useMemo(
    () => new Map(activePlan.assignments.map((a) => [a.orderId, a])),
    [activePlan]
  );
  const filteredOrders = useMemo(
    () =>
      network.orders.filter((o) => {
        const a = orderResults.get(o.id);
        return (
          (orderFilter === 'all' ||
            (orderFilter === 'unfulfilled' ? a?.fulfilledOnTime === false : a?.reassigned)) &&
          [o.id, o.pincode, o.customerName, o.baselineWarehouseId].some((v) =>
            v.toLowerCase().includes(orderSearch.trim().toLowerCase())
          )
        );
      }),
    [network.orders, orderResults, orderFilter, orderSearch]
  );

  const crossCityAssignmentsCount = useMemo(
    () => activePlan.assignments.filter((a) => a.isCrossCity && a.fulfilledOnTime).length,
    [activePlan.assignments]
  );
  const activeVerification: VerificationReport = useMemo(() => {
    if (corruptedAuditPlan) {
      return verifyRecoveryPlan(network, corruptedAuditPlan, {
        targetServicePct,
        availableBudget,
        permittedInterventionIds: network.interventions
          .filter((i) => i.eligible)
          .map((i) => i.id),
        protectCriticalOrders: protectCritical,
      });
    }
    return activePlan.verification;
  }, [corruptedAuditPlan, network, activePlan, availableBudget, targetServicePct, protectCritical]);

  const effectiveWhStates = useMemo(
    () =>
      computeEffectiveWarehouseStates(
        network,
        new Set(activePlan.activatedInterventions.map((i) => i.id))
      ),
    [network, activePlan.activatedInterventions]
  );

  // Project geographic coordinates into SVG viewport
  const mapProjection = useMemo(() => {
    const orderLats = network.orders.map((o) => o.lat);
    const orderLons = network.orders.map((o) => o.lon);
    const oMinLat = Math.min(...orderLats);
    const oMaxLat = Math.max(...orderLats);
    const oMinLon = Math.min(...orderLons);
    const oMaxLon = Math.max(...orderLons);

    const includedWarehouses =
      mapScope === 'orders'
        ? network.warehouses.filter(
            (w) =>
              w.lat >= oMinLat - 1.2 &&
              w.lat <= oMaxLat + 1.2 &&
              w.lon >= oMinLon - 1.2 &&
              w.lon <= oMaxLon + 1.2
          )
        : network.warehouses;

    const lats = [...includedWarehouses.map((w) => w.lat), ...orderLats];
    const lons = [...includedWarehouses.map((w) => w.lon), ...orderLons];
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latSpan = Math.max(0.02, maxLat - minLat);
    const lonSpan = Math.max(0.02, maxLon - minLon);

    const project = (lat: number, lon: number) => {
      const x = 100 + ((lon - minLon) / lonSpan) * 520;
      const y = 310 - ((lat - minLat) / latSpan) * 235;
      return { x, y };
    };

    return {
      project,
      centerLat: (minLat + maxLat) / 2,
      centerLon: (minLon + maxLon) / 2,
    };
  }, [network.warehouses, network.orders, mapScope]);

  const isWarehouseOutage = (whId: string) => {
    const wh = network.warehouses.find((w) => w.id === whId);
    if (wh?.status === 'OUTAGE') return true;
    return network.disruptions.some(
      (d) => d.active && d.type === 'WAREHOUSE_OUTAGE' && d.targetId === whId && d.severityPct >= 100
    );
  };

  const toggleWarehouseOutage = (whId: string) => {
    setCorruptedAuditPlan(null);
    const currentlyOut = isWarehouseOutage(whId);
    const existingDisruption = network.disruptions.find(
      (d) => d.type === 'WAREHOUSE_OUTAGE' && d.targetId === whId
    );

    let nextDisruptions = [...network.disruptions];
    if (existingDisruption) {
      nextDisruptions = nextDisruptions.map((d) =>
        d.id === existingDisruption.id ? { ...d, active: !currentlyOut, severityPct: 100 } : d
      );
    } else if (!currentlyOut) {
      nextDisruptions.push({
        id: `DIS-OUT-${whId}`,
        type: 'WAREHOUSE_OUTAGE',
        targetId: whId,
        severityPct: 100,
        label: `${whId} Manual Warehouse Outage`,
        active: true,
      });
    }

    const updated: CityNetwork = {
      ...network,
      warehouses: network.warehouses.map((w) =>
        w.id === whId ? { ...w, status: currentlyOut ? 'ACTIVE' : 'OUTAGE' } : w
      ),
      disruptions: nextDisruptions,
    };
    onUpdateNetwork(updated);
  };

  const updateWarehouseNumeric = (
    whId: string,
    field: 'inventory' | 'processingCapacity',
    input: HTMLInputElement
  ) => {
    const wh = network.warehouses.find((w) => w.id === whId);
    if (!wh) return;
    const entered = input.valueAsNumber;
    const value = Number.isFinite(entered) ? Math.max(0, Math.round(entered)) : wh[field];
    const inventory = field === 'inventory' ? value : wh.inventory;
    const processingCapacity = Math.min(
      inventory,
      field === 'processingCapacity' ? value : wh.processingCapacity
    );
    input.value = String(field === 'inventory' ? inventory : processingCapacity);
    if (inventory === wh.inventory && processingCapacity === wh.processingCapacity) return;
    setCorruptedAuditPlan(null);
    const updated: CityNetwork = {
      ...network,
      warehouses: network.warehouses.map((w) =>
        w.id === whId ? { ...w, inventory, processingCapacity } : w
      ),
    };
    onUpdateNetwork(updated);
  };

  const toggleDisruptionItem = (disruptionId: string) => {
    setCorruptedAuditPlan(null);
    const updated: CityNetwork = {
      ...network,
      disruptions: network.disruptions.map((d) =>
        d.id === disruptionId ? { ...d, active: !d.active } : d
      ),
    };
    onUpdateNetwork(updated);
  };

  const toggleTransportOptionAvailability = (trId: string) => {
    setCorruptedAuditPlan(null);
    const updated: CityNetwork = {
      ...network,
      transportOptions: network.transportOptions.map((t) =>
        t.id === trId ? { ...t, available: !t.available } : t
      ),
    };
    onUpdateNetwork(updated);
  };

  const updateOrderField = (
    orderId: string,
    field: 'quantity' | 'deadlineHours' | 'priority',
    value: number | OrderPriority
  ) => {
    setCorruptedAuditPlan(null);
    const updated: CityNetwork = {
      ...network,
      orders: network.orders.map((o) =>
        o.id === orderId ? { ...o, [field]: value } : o
      ),
    };
    onUpdateNetwork(updated);
  };

  const updateInterventionField = (
    intvId: string,
    field: 'activationPrice' | 'eligible' | 'leadTimeHours',
    value: number | boolean
  ) => {
    setCorruptedAuditPlan(null);
    const updated: CityNetwork = {
      ...network,
      interventions: network.interventions.map((iv) =>
        iv.id === intvId ? { ...iv, [field]: value } : iv
      ),
    };
    onUpdateNetwork(updated);
  };

  const clearAllDisruptions = () => {
    setCorruptedAuditPlan(null);
    const updated: CityNetwork = {
      ...network,
      warehouses: network.warehouses.map((w) => ({
        ...w,
        status: 'ACTIVE',
      })),
      disruptions: network.disruptions.map((d) => ({
        ...d,
        active: false,
      })),
      transportOptions: network.transportOptions.map((t) => ({
        ...t,
        available: true,
      })),
    };
    onUpdateNetwork(updated);
  };

  const triggerSevereShock = () => {
    setCorruptedAuditPlan(null);
    const firstWhId = network.warehouses[0]?.id;
    const secondWhId = network.warehouses[1]?.id;
    const nextDisruptions = network.disruptions.map((d) => ({ ...d, active: true }));
    if (firstWhId && !nextDisruptions.some((d) => d.targetId === firstWhId && d.type === 'WAREHOUSE_OUTAGE')) {
      nextDisruptions.push({
        id: `DIS-SEV-${firstWhId}`,
        type: 'WAREHOUSE_OUTAGE',
        targetId: firstWhId,
        severityPct: 100,
        label: `${firstWhId} Severe Hub Outage`,
        active: true,
      });
    }
    if (secondWhId && !nextDisruptions.some((d) => d.targetId === secondWhId && d.type === 'CAPACITY_REDUCTION')) {
      nextDisruptions.push({
        id: `DIS-SEV-CAP-${secondWhId}`,
        type: 'CAPACITY_REDUCTION',
        targetId: secondWhId,
        severityPct: 35,
        label: `${secondWhId} 35% Dock Capacity Reduction`,
        active: true,
      });
    }
    const updated: CityNetwork = {
      ...network,
      disruptions: nextDisruptions,
    };
    onUpdateNetwork(updated);
  };

  const handleAddCrossCityWarehouse = () => {
    setCorruptedAuditPlan(null);
    const tpl =
      CROSS_CITY_WAREHOUSE_TEMPLATES.find((t) => t.key === selectedTemplateKey) ||
      CROSS_CITY_WAREHOUSE_TEMPLATES[0];
    const safeInv = Math.max(10, Math.round(presetInv));
    const safeCap = Math.min(safeInv, Math.max(10, Math.round(presetCap)));
    const newWh: Warehouse = createWarehouseFromTemplate(
      network,
      tpl,
      safeInv,
      safeCap
    );

    const updated = addCrossCityWarehouseToNetwork(network, newWh);
    onUpdateNetwork(updated);
    setCrossCityNotice(
      `Attached ${newWh.id} (${String(newWh.cityId).toUpperCase()}) & synthesized ${network.orders.length} inter-city/local corridors.`
    );
    setShowAddCrossCityPanel(false);
  };

  const handleRemoveWarehouse = (whId: string) => {
    if (network.warehouses.length <= 1) return;
    setCorruptedAuditPlan(null);
    const updated = removeWarehouseFromNetwork(network, whId);
    onUpdateNetwork(updated);
    setCrossCityNotice(`Removed warehouse ${whId} and updated recovery solution.`);
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read uploaded file.'));
      reader.readAsDataURL(file);
    });

  const handleWarehouseFileUpload = async (file: File | null | undefined) => {
    if (!file) return;
    setFileUploadStatus(null);
    setIsFileUploading(true);

    try {
      const lowerName = file.name.toLowerCase();
      const mimeType =
        file.type ||
        (lowerName.endsWith('.pdf')
          ? 'application/pdf'
          : lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')
            ? 'text/csv'
            : lowerName.endsWith('.png')
              ? 'image/png'
              : lowerName.endsWith('.webp')
                ? 'image/webp'
                : 'image/jpeg');

      let extractedRows: ExtractedWarehouseRow[] = [];

      if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || mimeType === 'text/csv') {
        const csvText = await file.text();
        extractedRows = parseWarehouseCsvText(csvText);
        if (extractedRows.length === 0) {
          throw new Error(
            `No warehouse counts found in "${file.name}". Ensure CSV headers include a warehouse name/ID and a count/quantity/inventory/total column.`
          );
        }
      } else if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
        const base64Data = await readFileAsBase64(file);
        const res = await fetch('/api/warehouses/extract-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType,
            base64Data,
          }),
        });
        const payload = (await res.json()) as {
          warehouses?: ExtractedWarehouseRow[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(payload.error || `Failed to extract warehouse data from "${file.name}".`);
        }
        extractedRows = Array.isArray(payload.warehouses) ? payload.warehouses : [];
      } else {
        throw new Error('Unsupported file type. Please upload a PDF, CSV, or Image (.png/.jpg/.webp).');
      }

      const applied = applyImportedWarehousesToNetwork(network, extractedRows, file.name);
      setCorruptedAuditPlan(null);
      onUpdateNetwork(applied.network);

      const parts: string[] = [];
      if (applied.updatedWarehouses.length > 0) {
        parts.push(`Updated: ${applied.updatedWarehouses.join(', ')}`);
      }
      if (applied.addedWarehouses.length > 0) {
        parts.push(`Added: ${applied.addedWarehouses.join(', ')}`);
      }
      setFileUploadStatus({
        kind: 'success',
        message: `Synced ${applied.aggregatedEntries.length} warehouse(s) from "${file.name}" (${applied.totalProductUnits} total products; product types ignored). ${parts.join(' · ')}`,
      });
    } catch (err) {
      setFileUploadStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to process warehouse file.',
      });
    } finally {
      setIsFileUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportCsv = () => {
    const plan = activePlan;
    const headers = [
      'Order ID',
      'Order City',
      'Customer Name',
      'Customer PIN',
      'Priority',
      'Quantity',
      'Baseline Warehouse',
      'Assigned Warehouse',
      'Assigned Warehouse City',
      'Cross-City',
      'Corridor Mode',
      'Transport Route ID',
      'Deadline (hrs)',
      'Est Time (hrs)',
      'Road Distance (km)',
      'Transport Cost (INR)',
      'Fulfilled On Time',
      'Reassigned',
      'Unfulfilled Reason',
      'Provenance',
    ];
    const rows = plan.assignments.map((a) => [
      a.orderId,
      a.orderCityId || network.cityId,
      a.customerName,
      a.pincode,
      a.priority,
      a.quantity,
      a.baselineWarehouseId,
      a.assignedWarehouseId || 'NONE',
      a.assignedWarehouseCityId || 'NONE',
      a.isCrossCity ? 'YES' : 'NO',
      a.corridorMode || 'NONE',
      a.transportOptionId || 'NONE',
      a.deadlineHours,
      a.estimatedTimeHours ?? 'N/A',
      a.roadDistanceKm ?? 'N/A',
      a.transportCost,
      a.fulfilledOnTime ? 'YES' : 'NO',
      a.reassigned ? 'YES' : 'NO',
      a.unfulfilledReason || '',
      a.provenanceLabel,
    ]);
    const csv = [csvRow(headers), ...rows.map(csvRow)].join('\n');
    downloadFile(
      `reverseresilia-${network.cityId}-recovery-actionsheet.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
  };

  const handleImportJson = (source = jsonUploadText) => {
    try {
      const value = JSON.parse(source);
      const restored = value?.network ? readScenario(value) : undefined;
      let parsed: CityNetwork = restored?.network ?? value;
      if (!restored && (!Array.isArray(parsed?.transportOptions) || parsed.transportOptions.length === 0)) {
        parsed = hydrateCrossCityTransportOptions({
          ...parsed,
          transportOptions: [],
          interventions: Array.isArray(parsed?.interventions) ? parsed.interventions : [],
          disruptions: Array.isArray(parsed?.disruptions) ? parsed.disruptions : [],
        });
      }
      validateNetwork(parsed);
      if (parsed.cityId !== activeCityId) {
        throw new Error(`Use cityId "${activeCityId}" for this scenario.`);
      }
      setCorruptedAuditPlan(null);
      onUpdateNetwork(parsed, true, restored);
      const cities = Array.from(
        new Set(parsed.warehouses.map((w) => String(w.cityId || parsed.cityId)))
      );
      setJsonUploadMsg(
        `VALIDATED: Loaded ${parsed.warehouses.length} warehouses across [${cities.join(', ')}], ${parsed.orders.length} orders, & ${parsed.transportOptions.length} corridors.`
      );
    } catch (err) {
      setJsonUploadMsg(`IMPORT ERROR: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
    }
  };

  return (
    <section
      id="reverseresilia-workbench"
      className="w-full bg-black text-[#0D0D0D] border-t border-white/15 pt-16 pb-24 px-4 sm:px-8 md:px-14"
    >
      <div className="max-w-[1440px] mx-auto">
        {/* Architectural Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-white/15">
          <div>
            <div className="flex items-center gap-3 font-auren-mono text-[11px] tracking-[0.16em] uppercase text-white/70 mb-2">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-[1px] bg-[#cee49f] inline-block" />
                REVERSERESILIA ENGINE // COLOSSUS 3.0
              </span>
              <span>·</span>
              <span>SOLVER: SUCCESSIVE SHORTEST PATH + CP-SAT BRANCH &amp; BOUND</span>
            </div>
            <h1 key={activeView} className="engine-title font-auren-sans text-3xl sm:text-4xl md:text-5xl font-bold tracking-[-0.03em] leading-[0.98] uppercase text-white">
              {pageTitle}
            </h1>
          </div>

          <div className="rr-tools flex flex-wrap items-center gap-2">
            <label className="rr-city font-auren-mono text-xs flex items-center gap-2 text-white">
              <span className="text-white/70 uppercase tracking-[0.08em]">Scenario</span>
              <select
                aria-label="Scenario"
                value={activeCityId}
                onChange={(e) => onSelectCity(e.target.value as CityId)}
                className="border border-[#0D0D0D]/20 bg-white px-2.5 py-1.5 text-xs font-auren-mono text-[#0D0D0D] rounded-[3px] focus:outline-none focus:ring-1 focus:ring-white"
              >
                {CITY_TABS.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.label}
                  </option>
                ))}
              </select>
            </label>
            <details className="rr-actions relative font-auren-mono text-[11px] uppercase tracking-[0.1em]">
              <summary className="px-3 py-2 bg-white border border-[#0D0D0D]/20 rounded-[3px] hover:border-[#0D0D0D] cursor-pointer transition-colors text-[#0D0D0D]">
                Scenario actions
              </summary>
              <div
                className="absolute top-[calc(100%+4px)] right-0 w-max bg-white border border-[#0D0D0D]/20 p-1 shadow-md z-10 rounded-[3px] text-[#0D0D0D]"
                onClick={(e) => {
                  if ((e.target as Element).closest('button')) {
                    e.currentTarget.closest('details')!.open = false;
                  }
                }}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-[#F5F4F0] rounded-[2px]"
                  onClick={() => {
                    setCorruptedAuditPlan(null);
                    onRunEngines();
                  }}
                >
                  Recompute plan
                </button>
                <button
                  type="button"
                  disabled={isStale}
                  className="block w-full px-3 py-2 text-left hover:bg-[#F5F4F0] disabled:opacity-50 rounded-[2px]"
                  onClick={handleExportCsv}
                >
                  Export action sheet CSV
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-[#F5F4F0] rounded-[2px]"
                  onClick={() =>
                    downloadFile(
                      `${network.cityId}-scenario.json`,
                      JSON.stringify(scenario, null, 2),
                      'application/json'
                    )
                  }
                >
                  Export scenario JSON
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-[#F5F4F0] rounded-[2px]"
                  onClick={() => {
                    setCorruptedAuditPlan(null);
                    onResetNetwork();
                  }}
                >
                  Reset scenario
                </button>
              </div>
            </details>
          </div>
        </div>

        {/* Stale State Warning Banner (Section 8.2 / F18) */}
        {isStale && (
          <div
            role="status"
            className="rr-notice mt-4 p-4 border border-[#946800]/30 bg-[#FEF9EC] text-[#4E3204] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-[3px]"
          >
            <div className="font-auren-mono text-xs uppercase tracking-[0.08em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-[1px] bg-[#946800] shrink-0" aria-hidden="true" />
              <span>
                <strong>STALE PLAN NOTICE:</strong> Calculating updated plans. Showing the previous result. Click &ldquo;Re-Compute Recovery Plan&rdquo; to synchronize optimization and verification results.
              </span>
            </div>
            <button
              type="button"
              onClick={onRunEngines}
              className="px-3.5 py-1.5 bg-[#4E3204] text-[#FEF9EC] font-auren-mono text-[11px] uppercase tracking-[0.1em] cursor-pointer shrink-0 rounded-[3px] hover:bg-black transition-colors"
            >
              Synchronize Solver Now
            </button>
          </div>
        )}

        <nav aria-label="Engine features" className="engine-pages">
          {VIEW_TABS.map((tab) => (
            <a
              key={tab.id}
              id={tab.anchorId}
              href={`/workbench/${tab.anchorId}?city=${activeCityId}`}
              aria-current={activeView === tab.id ? 'page' : undefined}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onSelectView(tab.id);
              }}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        {/* Live Telemetry Summary Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border border-white/20 bg-white rounded-[3px] overflow-hidden text-[#0D0D0D]">
          <div className="p-4 border-b lg:border-b-0 border-r border-[#0D0D0D]/12">
            <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#5A5852]">
              Baseline Service
            </div>
            <div className="mt-1 font-auren-sans text-2xl font-bold">
              {impactResult.baselineServicePct.toFixed(1)}%
            </div>
            <div className="font-auren-mono text-[10px] text-[#5A5852] mt-0.5">
              {impactResult.baselineFulfilledOrders}/{impactResult.totalOrders} orders · ₹{impactResult.baselineCost.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="p-4 border-b lg:border-b-0 border-r border-[#0D0D0D]/12">
            <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#8E2A1E]">
              Immediate Disrupted (F06)
            </div>
            <div className="mt-1 font-auren-sans text-2xl font-bold text-[#8E2A1E]">
              {impactResult.disruptedServicePctBeforeReassignment.toFixed(1)}%
            </div>
            <div className="font-auren-mono text-[10px] text-[#8E2A1E] mt-0.5">
              {impactResult.immediatelyAffectedOrderIds.length} orders directly disrupted
            </div>
          </div>

          <div className="p-4 border-b sm:border-b-0 border-r border-[#0D0D0D]/12">
            <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#5A5852]">
              Natural Recovery (Stage A/B)
            </div>
            <div className="mt-1 font-auren-sans text-2xl font-bold">
              {stageBResult.achievedServicePct.toFixed(1)}%
            </div>
            <div className="font-auren-mono text-[10px] text-[#5A5852] mt-0.5">
              ₹{stageBResult.transportAssignmentCost.toLocaleString('en-IN')} transport · ₹0 intv
            </div>
          </div>

          <div className="p-4 border-r border-[#0D0D0D]/12">
            <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#1E6641]">
              Target Recovery (Stage C)
            </div>
            <div className="mt-1 font-auren-sans text-2xl font-bold text-[#1E6641]">
              {activePlan.achievedServicePct.toFixed(1)}%
            </div>
            <div className="font-auren-mono text-[10px] text-[#1E6641] mt-0.5">
              Target: {targetServicePct}% · {activePlan.fulfilledOrders}/{activePlan.totalOrders} orders
            </div>
          </div>

          <div className="p-4 border-r border-[#0D0D0D]/12">
            <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#5A5852]">
              Total Recovery Cost
            </div>
            <div className="mt-1 font-auren-sans text-2xl font-bold">
              ₹{activePlan.totalRecoveryCost.toLocaleString('en-IN')}
            </div>
            <div className="font-auren-mono text-[10px] text-[#5A5852] mt-0.5">
              Intv: ₹{activePlan.interventionActivationCost.toLocaleString('en-IN')} / Budget: ₹{availableBudget.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="p-4">
            <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#5A5852]">
              Solver &amp; Verifier (F14/F15)
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`px-2 py-0.5 font-auren-mono text-[11px] font-bold uppercase rounded-[2px] ${
                  activePlan.solverStatus === 'OPTIMAL' || activePlan.solverStatus === 'FEASIBLE'
                    ? 'bg-[#0D0D0D] text-[#cee49f]'
                    : 'bg-[#8E2A1E] text-white'
                }`}
              >
                {activePlan.solverStatus}
              </span>
              <span
                className={`px-2 py-0.5 font-auren-mono text-[11px] font-bold uppercase rounded-[2px] ${
                  activeVerification.overallStatus === 'PASS'
                    ? 'bg-[#1E6641] text-white'
                    : 'bg-[#8E2A1E] text-white'
                }`}
              >
                VERIFY: {activeVerification.overallStatus}
              </span>
            </div>
            <div className="font-auren-mono text-[10px] text-[#5A5852] mt-1">
              Solved in {activePlan.solveTimeMs.toFixed(1)}ms · {activeVerification.passedCount}/{activeVerification.totalChecks} checks
            </div>
          </div>
        </div>

        {/* Budget Comparison Strip (Maximum service within budget vs. requested target) */}
        {['overview', 'planner', 'actionsheet'].includes(activeView) && (
          <section aria-label="Budget comparison" className="rr-budget">
            <div>
              <strong>
                {budgetResult.proven
                  ? 'Maximum service within budget'
                  : 'Service found within budget'}
              </strong>
              <p>
                {budgetResult.plan.fulfilledOrders}/{network.orders.length} orders · ₹
                {budgetResult.plan.totalRecoveryCost.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <strong>Requested target · {stageCResult.requestedTargetPct}%</strong>
              <p>
                {stageCResult.physicallyFeasible
                  ? stageCResult.budgetCompliant
                    ? 'Within budget'
                    : `₹${stageCResult.budgetShortfall.toLocaleString('en-IN')} above budget`
                  : stageCResult.solverStatus === 'UNKNOWN'
                    ? 'Search timed out'
                    : 'Unreachable'}
              </p>
            </div>
            {activeView !== 'planner' && (
              <label>
                Order results and action sheet
                <select
                  value={showBudget ? 'budget' : 'target'}
                  onChange={(e) => {
                    setCorruptedAuditPlan(null);
                    setShowBudget(e.target.value === 'budget');
                  }}
                >
                  <option value="target">Requested target plan</option>
                  <option value="budget">Within-budget plan</option>
                </select>
              </label>
            )}
          </section>
        )}

        {/* =====================================================================
            VIEW 01: NETWORK OVERVIEW (F01, F02, F03, F04, F18)
           ===================================================================== */}
        {activeView === 'overview' && (
          <div className="mt-8 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Interactive PIN & OSM Road Network Map */}
              <div className="lg:col-span-7 border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#0D0D0D]/15">
                  <div>
                    <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                      REAL-GEOGRAPHY CORRIDOR TOPOLOGY // {network.regionZone}
                    </div>
                    <h3 className="font-auren-sans text-xl font-bold uppercase tracking-[-0.02em] mt-0.5">
                      {network.name} — PIN &amp; Road Network Graph
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 font-auren-mono text-[10px] uppercase">
                    <div className="inline-flex border border-[#0D0D0D]/20 bg-[#F5F4F0] p-0.5">
                      <button
                        type="button"
                        aria-pressed={mapViewMode === 'corridor'}
                        onClick={() => setMapViewMode('corridor')}
                        className={`px-2.5 py-1 text-[10px] uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                          mapViewMode === 'corridor'
                            ? 'bg-[#0D0D0D] text-white shadow-sm'
                            : 'text-[#0D0D0D] hover:text-black'
                        }`}
                      >
                        Corridor Graph
                      </button>
                      <button
                        type="button"
                        aria-pressed={mapViewMode === 'osm'}
                        onClick={() => setMapViewMode('osm')}
                        className={`px-2.5 py-1 text-[10px] uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                          mapViewMode === 'osm'
                            ? 'bg-[#0D0D0D] text-white shadow-sm'
                            : 'text-[#0D0D0D] hover:text-black'
                        }`}
                      >
                        OSM Map
                      </button>
                    </div>
                    {mapViewMode === 'corridor' && (
                      <>
                        <span className="flex items-center gap-1.5 text-[#5A5852]">
                          <span className="w-2.5 h-2.5 inline-block bg-[#0D0D0D]"></span> Warehouse ({distinctWarehouseCities.length} {distinctWarehouseCities.length > 1 ? 'Cities' : 'City'})
                        </span>
                        <span className="flex items-center gap-1.5 text-[#5A5852]">
                          <span className="w-2.5 h-2.5 inline-block bg-[#8E2A1E]"></span> Outage / Unfulfilled
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 inline-block bg-[#14382B]"></span> Local Reassigned
                        </span>
                        {crossCityAssignmentsCount > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 inline-block bg-[#1D4ED8]"></span> Cross-City ({crossCityAssignmentsCount})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {mapViewMode === 'osm' ? (
                  <div className="mt-4">
                    <WarehouseMap
                      key={network.cityId}
                      city={network.name}
                      warehouses={network.warehouses}
                      isOutage={isWarehouseOutage}
                      onToggle={toggleWarehouseOutage}
                    />
                  </div>
                ) : (
                <div className="mt-4 relative bg-[#F7F6F2] border border-[#0D0D0D]/10 overflow-hidden">
                  <svg viewBox="0 0 720 390" className="w-full h-[360px] block">
                    <defs>
                      <pattern id="auren-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                        <path
                          d="M 36 0 L 0 0 0 36"
                          fill="none"
                          stroke="rgba(13,13,13,0.06)"
                          strokeWidth="1"
                        />
                      </pattern>
                    </defs>
                    <rect width="720" height="390" fill="url(#auren-grid)" />

                    {/* Baseline & Reassigned Order-to-Warehouse Corridors */}
                    {network.orders.map((ord) => {
                      const baseWh = network.warehouses.find((w) => w.id === ord.baselineWarehouseId);
                      const asgn = activePlan.assignments.find((a) => a.orderId === ord.id);
                      const assignedWh = network.warehouses.find(
                        (w) => w.id === asgn?.assignedWarehouseId
                      );
                      const pOrd = mapProjection.project(ord.lat, ord.lon);
                      const isXc = Boolean(asgn?.isCrossCity);
                      const isAir = asgn?.corridorMode === 'INTER_CITY_AIR_CARGO';

                      return (
                        <g key={ord.id}>
                          {/* Baseline corridor dashed line if reassigned or disrupted */}
                          {baseWh && (!assignedWh || assignedWh.id !== baseWh.id) && (
                            <line
                              x1={mapProjection.project(baseWh.lat, baseWh.lon).x}
                              y1={mapProjection.project(baseWh.lat, baseWh.lon).y}
                              x2={pOrd.x}
                              y2={pOrd.y}
                              stroke="#8E2A1E"
                              strokeWidth={1.3}
                              strokeDasharray="4 4"
                              opacity={0.65}
                            />
                          )}

                          {/* Active assigned corridor */}
                          {assignedWh && (
                            <line
                              x1={mapProjection.project(assignedWh.lat, assignedWh.lon).x}
                              y1={mapProjection.project(assignedWh.lat, assignedWh.lon).y}
                              x2={pOrd.x}
                              y2={pOrd.y}
                              stroke={isXc ? '#1D4ED8' : asgn?.reassigned ? '#14382B' : '#0D0D0D'}
                              strokeWidth={isXc ? 2.5 : asgn?.reassigned ? 2.2 : 1.6}
                              strokeDasharray={isAir ? '6 3' : undefined}
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Customer Delivery Nodes */}
                    {network.orders.map((ord) => {
                      const pt = mapProjection.project(ord.lat, ord.lon);
                      const asgn = activePlan.assignments.find((a) => a.orderId === ord.id);
                      const isUnfulfilled = !asgn?.fulfilledOnTime || !asgn?.assignedWarehouseId;
                      const isCritical = ord.priority === 'CRITICAL';
                      return (
                        <g key={ord.id} transform={`translate(${pt.x}, ${pt.y})`}>
                          <circle
                            r={isCritical ? 6.5 : 5}
                            fill={
                              isUnfulfilled
                                ? '#8E2A1E'
                                : asgn?.isCrossCity
                                ? '#1D4ED8'
                                : asgn?.reassigned
                                ? '#14382B'
                                : '#FFFFFF'
                            }
                            stroke={isUnfulfilled ? '#8E2A1E' : '#0D0D0D'}
                            strokeWidth={isCritical ? 2.2 : 1.5}
                          />
                          <text
                            y={-9}
                            textAnchor="middle"
                            className="font-auren-mono text-[8px] fill-[#0D0D0D]"
                          >
                            {ord.pincode}
                          </text>
                        </g>
                      );
                    })}

                    {/* Warehouse Hub Nodes */}
                    {network.warehouses.map((wh, wi) => {
                      const pt = mapProjection.project(wh.lat, wh.lon);
                      const isSelected = selectedWarehouseId === wh.id;
                      const eff = effectiveWhStates.get(wh.id);
                      const out = !eff?.available;
                      const whCityTag = String(wh.cityId || network.cityId).toUpperCase();
                      const hasCloseNeighbor = network.warehouses.some((other, oi) => {
                        if (oi >= wi) return false;
                        const opt = mapProjection.project(other.lat, other.lon);
                        return Math.abs(opt.x - pt.x) < 120 && Math.abs(opt.y - pt.y) < 36;
                      });
                      const placeAbove = hasCloseNeighbor;
                      return (
                        <g
                          key={wh.id}
                          transform={`translate(${pt.x}, ${pt.y})`}
                          onClick={() => {
                            setSelectedWarehouseId(wh.id);
                            toggleWarehouseOutage(wh.id);
                          }}
                          className="cursor-pointer"
                        >
                          <rect
                            x={-11}
                            y={-11}
                            width={22}
                            height={22}
                            fill={out ? '#8E2A1E' : isSelected ? '#14382B' : '#0D0D0D'}
                            stroke="#FFFFFF"
                            strokeWidth={2}
                          />
                          <text
                            y={placeAbove ? -24 : 22}
                            textAnchor="middle"
                            className="font-auren-mono text-[8.5px] font-bold fill-[#0D0D0D]"
                          >
                            {wh.id} [{whCityTag}]
                          </text>
                          <text
                            y={placeAbove ? -15 : 32}
                            textAnchor="middle"
                            className="font-auren-mono text-[8px] fill-[#5A5852]"
                          >
                            {out ? 'OUTAGE' : `Cap:${eff?.effectiveCapacity ?? wh.processingCapacity}`}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="px-4 py-2.5 bg-[#EFECE6] border-t border-[#0D0D0D]/10 flex flex-wrap items-center justify-between gap-2 font-auren-mono text-[10px] text-[#4E4C46]">
                    <span>TIP: Click any Warehouse square to toggle OUTAGE/ACTIVE, or add out-of-city hubs on the right.</span>
                    <div className="flex items-center gap-3">
                      {distinctWarehouseCities.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setMapScope(mapScope === 'full' ? 'orders' : 'full')}
                          className="px-2 py-0.5 border border-[#0D0D0D]/25 bg-white text-[#0D0D0D] uppercase cursor-pointer hover:bg-[#0D0D0D] hover:text-white"
                        >
                          {mapScope === 'full' ? 'Zoom: Order Cluster' : 'Zoom: Full Cross-City'}
                        </button>
                      )}
                      <span>LAT {mapProjection.centerLat.toFixed(4)}°N · LON {mapProjection.centerLon.toFixed(4)}°E</span>
                    </div>
                  </div>
                </div>
                )}

                <details className="rr-disclosure">
                  <summary>Data sources and assumptions</summary>
                  {/* Data Provenance Transparency Matrix (F18 / Section 12) */}
                  <div className="mt-5 pt-4 border-t border-[#0D0D0D]/15">
                    <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860] mb-2.5">
                      DATA PROVENANCE &amp; TRANSPARENCY LABELS (F18)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 border border-[#0D0D0D]/15 flex items-center justify-between">
                        <span>PIN Codes, Lat/Lon &amp; OSM Corridors</span>
                        <span className={`px-2 py-0.5 font-auren-mono text-[10px] border ${PROVENANCE_BADGE_STYLE['Sourced']}`}>
                          {Array.from(
                            new Set(
                              [...network.orders, ...network.warehouses].map(
                                (x) => x.provenance.coordinates.classification
                              )
                            )
                          ).join(', ')}
                        </span>
                      </div>
                      <div className="p-2.5 border border-[#0D0D0D]/15 flex items-center justify-between">
                        <span>Corridor Road Distance (km)</span>
                        <span className={`px-2 py-0.5 font-auren-mono text-[10px] border ${PROVENANCE_BADGE_STYLE['Derived']}`}>
                          Derived
                        </span>
                      </div>
                      <div className="p-2.5 border border-[#0D0D0D]/15 flex items-center justify-between">
                        <span>Travel Time (Speed + Dock Delay)</span>
                        <span className={`px-2 py-0.5 font-auren-mono text-[10px] border ${PROVENANCE_BADGE_STYLE['Derived with simulated assumptions']}`}>
                          Derived w/ Assumptions
                        </span>
                      </div>
                      <div className="p-2.5 border border-[#0D0D0D]/15 flex items-center justify-between">
                        <span>Inventory, Orders &amp; Emergency Costs</span>
                        <span className={`px-2 py-0.5 font-auren-mono text-[10px] border ${PROVENANCE_BADGE_STYLE['Simulated']}`}>
                          Simulated
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Source Datasets & Geofabrik / India PIN Audit Table */}
                  <div className="mt-5 pt-4 border-t border-[#0D0D0D]/15">
                    <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860] mb-2.5">
                      INGESTED DATASET SOURCES &amp; REGIONAL EXTRACTS (GEOFABRIK OSM PBF + INDIA PIN CSV)
                    </div>
                    <div className="space-y-2">
                      {network.sourceAudits.map((sa) => (
                        <div
                          key={sa.specFilename}
                          className="p-2.5 border border-[#0D0D0D]/15 bg-[#FAF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-auren-mono text-[11px]"
                        >
                          <div>
                            <div className="font-bold">
                              {sa.specFilename}{' '}
                              <span className="text-[10px] font-normal text-[#6B6860]">
                                ({sa.expectedSizeMB} MB · {sa.coveredRegions.join(', ')})
                              </span>
                            </div>
                            <a
                              href={sa.remoteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-[#14382B] underline break-all"
                            >
                              {sa.remoteUrl}
                            </a>
                          </div>
                          <span className="px-2 py-0.5 text-[10px] bg-[#0D0D0D] text-[#F5F4F0] shrink-0 self-start sm:self-center">
                            {sa.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              </div>

              {/* Right 5 Cols: Editable Warehouse Hubs & JSON Import (F04) */}
              <div className="lg:col-span-5 space-y-6">
                <div className="border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#0D0D0D]/15">
                    <div>
                      <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                        EDITABLE WAREHOUSE HUBS (F04) · {distinctWarehouseCities.length} {distinctWarehouseCities.length > 1 ? 'CITIES ACTIVE' : 'CITY'}
                      </div>
                      <h3 className="font-auren-sans text-lg font-bold uppercase tracking-[-0.01em] mt-0.5">
                        Inventory, Handling Capacity &amp; Cross-City Hubs
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.tsv,.pdf,image/png,image/jpeg,image/webp,image/gif"
                        data-testid="warehouse-file-input"
                        onChange={(e) => handleWarehouseFileUpload(e.target.files?.[0])}
                        className="sr-only"
                      />
                      <button
                        type="button"
                        disabled={isFileUploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-[#0D0D0D] text-white font-auren-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-[#cee49f] hover:text-[#0D0D0D] transition-colors disabled:opacity-50"
                      >
                        {isFileUploading ? 'Syncing File...' : 'Upload PDF / CSV / Image'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCrossCityPanel(!showAddCrossCityPanel);
                          if (!showAddCrossCityPanel) setShowJsonPanel(false);
                        }}
                        className="px-2.5 py-1 bg-[#14382B] text-white font-auren-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-[#0D0D0D] transition-colors"
                      >
                        {showAddCrossCityPanel ? 'Close Add Hub' : '+ Add Cross-City Hub'}
                      </button>
                      <button
                        type="button"
                        aria-label="Import / Validate JSON"
                        onClick={() => {
                          setShowJsonPanel(!showJsonPanel);
                          if (!showJsonPanel) setShowAddCrossCityPanel(false);
                        }}
                        className="px-2.5 py-1 border border-[#0D0D0D]/25 font-auren-mono text-[10px] uppercase tracking-wider cursor-pointer hover:bg-[#0D0D0D] hover:text-white transition-colors"
                      >
                        {showJsonPanel ? 'Hide JSON Import' : 'Import / Validate JSON'}
                      </button>
                    </div>
                  </div>

                  {/* Single-File Dropzone (Auto-updates warehouse product totals immediately) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOverFile(true);
                    }}
                    onDragLeave={() => setIsDragOverFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverFile(false);
                      handleWarehouseFileUpload(e.dataTransfer.files?.[0]);
                    }}
                    onClick={() => !isFileUploading && fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!isFileUploading) fileInputRef.current?.click();
                      }
                    }}
                    className={`mt-3 p-2.5 border border-dashed transition-colors cursor-pointer flex items-center justify-between gap-2 font-auren-mono text-[10px] ${
                      isDragOverFile
                        ? 'border-[#14382B] bg-[#E6F0EC] text-[#14382B]'
                        : 'border-[#0D0D0D]/25 bg-[#FAF9F6] text-[#5A5852] hover:border-[#0D0D0D]'
                    }`}
                  >
                    <span>
                      {isFileUploading
                        ? 'Reading uploaded file & aggregating product counts per warehouse...'
                        : 'Drop a single PDF, CSV, or Image — product types are ignored and total counts update live'}
                    </span>
                    <span className="px-1.5 py-0.5 bg-white border border-[#0D0D0D]/20 text-[#0D0D0D] uppercase shrink-0">
                      Browse
                    </span>
                  </div>

                  {fileUploadStatus && (
                    <div
                      data-testid="warehouse-file-status"
                      className={`mt-3 p-2.5 border font-auren-mono text-[10px] flex items-center justify-between gap-2 ${
                        fileUploadStatus.kind === 'success'
                          ? 'border-[#14382B]/40 bg-[#E6F0EC] text-[#14382B]'
                          : 'border-[#8E2A1E]/40 bg-[#FDF5F4] text-[#8E2A1E]'
                      }`}
                    >
                      <span>{fileUploadStatus.message}</span>
                      <button
                        type="button"
                        onClick={() => setFileUploadStatus(null)}
                        className="underline cursor-pointer shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {crossCityNotice && (
                    <div className="mt-3 p-2.5 border border-[#14382B]/40 bg-[#E6F0EC] text-[#14382B] font-auren-mono text-[10px] flex items-center justify-between gap-2">
                      <span>{crossCityNotice}</span>
                      <button
                        type="button"
                        onClick={() => setCrossCityNotice(null)}
                        className="underline cursor-pointer shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {showAddCrossCityPanel && (
                    <div className="mt-3 p-3.5 bg-[#F5F4F0] border border-[#0D0D0D]/20 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-auren-mono text-[10px] font-bold uppercase text-[#0D0D0D]">
                          Attach Out-of-City / Cross-Regional Warehouse
                        </span>
                        <div className="flex gap-1">
                          <span className="px-2 py-0.5 font-auren-mono text-[10px] uppercase border bg-[#0D0D0D] text-white border-[#0D0D0D]">
                            Indian Metro Presets
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block">
                          <span className="font-auren-mono text-[10px] uppercase text-[#5A5852]">
                            Select Out-of-City Warehouse Hub (Auto-generates Highway &amp; Air Corridors):
                          </span>
                          <select
                            value={selectedTemplateKey}
                            onChange={(e) => {
                              const tpl = CROSS_CITY_WAREHOUSE_TEMPLATES.find(
                                (t) => t.key === e.target.value
                              );
                              setSelectedTemplateKey(e.target.value);
                              if (tpl) {
                                setPresetInv(tpl.defaultInventory);
                                setPresetCap(tpl.defaultCapacity);
                              }
                            }}
                            className="mt-1 w-full px-2.5 py-1.5 bg-white border border-[#0D0D0D]/25 font-auren-mono text-xs"
                          >
                            {CROSS_CITY_WAREHOUSE_TEMPLATES.map((tpl) => (
                              <option key={tpl.key} value={tpl.key}>
                                {tpl.cityLabel.toUpperCase()} — {tpl.name} (PIN {tpl.pincode})
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="font-auren-mono text-[10px] uppercase text-[#5A5852]">
                              Inventory Units
                            </span>
                            <input
                              type="number"
                              min={10}
                              max={1000}
                              value={presetInv}
                              onChange={(e) => setPresetInv(Number(e.target.value))}
                              className="mt-1 w-full px-2 py-1 bg-white border border-[#0D0D0D]/25 font-auren-mono text-xs"
                            />
                          </label>
                          <label className="block">
                            <span className="font-auren-mono text-[10px] uppercase text-[#5A5852]">
                              Handling Capacity
                            </span>
                            <input
                              type="number"
                              min={10}
                              max={1000}
                              value={presetCap}
                              onChange={(e) => setPresetCap(Number(e.target.value))}
                              className="mt-1 w-full px-2 py-1 bg-white border border-[#0D0D0D]/25 font-auren-mono text-xs"
                            />
                          </label>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddCrossCityWarehouse}
                        className="w-full py-2 bg-[#0D0D0D] text-white font-auren-mono text-[10px] uppercase tracking-[0.12em] cursor-pointer hover:bg-[#14382B]"
                      >
                        Attach Warehouse &amp; Re-Solve Network →
                      </button>
                    </div>
                  )}

                  {showJsonPanel && (
                    <div className="mt-3 p-3 bg-[#F5F4F0] border border-[#0D0D0D]/20 space-y-2">
                      <div className="font-auren-mono text-[10px] uppercase text-[#5A5852]">
                        Paste full scenario or CityNetwork JSON (missing transport links auto-synthesized):
                      </div>
                      <label className="block text-xs font-auren-mono">
                        Open scenario file
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="mt-1 block text-xs"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) {
                              try {
                                handleImportJson(await file.text());
                              } catch {
                                setJsonUploadMsg('Could not read scenario file.');
                              }
                            }
                          }}
                        />
                      </label>
                      <textarea
                        aria-label="Network JSON"
                        value={jsonUploadText}
                        onChange={(e) => setJsonUploadText(e.target.value)}
                        rows={4}
                        placeholder='{"cityId":"multi_city","warehouses":[...],"orders":[...]}'
                        className="w-full p-2 bg-white border border-[#0D0D0D]/20 font-auren-mono text-xs"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleImportJson()}
                          className="px-3 py-1 bg-[#0D0D0D] text-white font-auren-mono text-[10px] uppercase cursor-pointer"
                        >
                          Validate &amp; Apply JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => setJsonUploadText(JSON.stringify(network, null, 2))}
                          className="px-3 py-1 border border-[#0D0D0D]/25 bg-white font-auren-mono text-[10px] uppercase cursor-pointer"
                        >
                          Load Current JSON
                        </button>
                      </div>
                      {jsonUploadMsg && (
                        <div className="font-auren-mono text-[10px] text-[#14382B] font-bold">
                          {jsonUploadMsg}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-3 font-auren-mono text-[11px] text-[#5A5852]">
                    Capacity is limited to inventory. Lowering inventory below capacity lowers both when you press Enter or leave the field.
                  </p>

                  <div className="mt-4 space-y-3 max-h-[540px] overflow-y-auto rr-scroll pr-1">
                    {network.warehouses.map((wh) => {
                      const eff = effectiveWhStates.get(wh.id);
                      const out = !eff?.available;
                      const whCityStr = String(wh.cityId || network.cityId).toUpperCase();
                      return (
                        <div
                          key={wh.id}
                          className={`p-4 border transition-all duration-150 ${
                            out
                              ? 'border-[#8E2A1E] bg-[#FDF5F4]'
                              : 'border-[#0D0D0D]/15 bg-[#FAF9F6] hover:border-[#0D0D0D]/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5 font-auren-mono text-[10px] uppercase tracking-[0.08em] text-[#6B6860]">
                                <span className="font-bold text-[#0D0D0D]">{wh.id}</span>
                                <span className="px-1.5 py-0.5 bg-[#0D0D0D] text-white text-[9px] tracking-wider">
                                  CITY: {whCityStr}
                                </span>
                                <span>PIN {wh.pincode}</span>
                              </div>
                              <div className="font-auren-sans text-sm font-bold mt-1 tracking-tight">{wh.name}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleWarehouseOutage(wh.id)}
                                className={`px-2.5 py-1 font-auren-mono text-[10px] uppercase tracking-wider cursor-pointer border transition-colors ${
                                  out
                                    ? 'bg-[#8E2A1E] text-white border-[#8E2A1E] hover:bg-[#A93325]'
                                    : 'bg-white text-[#0D0D0D] border-[#0D0D0D]/30 hover:bg-[#0D0D0D] hover:text-white'
                                }`}
                              >
                                {out ? 'OUTAGE (RESTORE)' : 'TRIGGER OUTAGE'}
                              </button>
                              {network.warehouses.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveWarehouse(wh.id)}
                                  title="Remove warehouse from network"
                                  className="px-2 py-1 font-auren-mono text-[10px] uppercase border border-[#0D0D0D]/20 bg-white text-[#8E2A1E] hover:bg-[#8E2A1E] hover:text-white cursor-pointer transition-colors"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="mt-3.5 grid grid-cols-2 gap-3">
                            <label className="block">
                              <span className="font-auren-mono text-[10px] uppercase tracking-wider text-[#5A5852]">
                                Base Inventory (Eff: {eff?.effectiveInventory ?? wh.inventory})
                              </span>
                              <input
                                type="number"
                                min={0}
                                key={wh.inventory}
                                defaultValue={wh.inventory}
                                onBlur={(e) =>
                                  updateWarehouseNumeric(wh.id, 'inventory', e.currentTarget)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                }}
                                className="mt-1 w-full px-2.5 py-1.5 bg-white border border-[#0D0D0D]/20 focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] font-auren-mono text-xs outline-none transition-colors"
                              />
                            </label>
                            <label className="block">
                              <span className="font-auren-mono text-[10px] uppercase tracking-wider text-[#5A5852]">
                                Base Capacity (Eff: {eff?.effectiveCapacity ?? wh.processingCapacity})
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={wh.inventory}
                                key={wh.processingCapacity}
                                defaultValue={wh.processingCapacity}
                                onBlur={(e) =>
                                  updateWarehouseNumeric(wh.id, 'processingCapacity', e.currentTarget)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                }}
                                className="mt-1 w-full px-2.5 py-1.5 bg-white border border-[#0D0D0D]/20 focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] font-auren-mono text-xs outline-none transition-colors"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Editable Orders Table (F04) */}
            <div className="border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#0D0D0D]/15">
                <div>
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                    DEMAND NODES &amp; PRIORITY ORDERS (F04 / F08)
                  </div>
                  <h3 className="font-auren-sans text-lg font-bold uppercase tracking-[-0.01em] mt-0.5">
                    Editable Customer Orders ({network.orders.length} Orders)
                  </h3>
                </div>
                <span className="font-auren-mono text-[10px] uppercase text-[#6B6860]">
                  Edit quantity, deadline or priority. Regional demo orders repeat the sample delivery sites.
                </span>
              </div>

              <details className="rr-disclosure">
                <summary>Add or import orders</summary>
                <form
                  className="flex flex-wrap items-end gap-3 py-3 text-xs"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const fields = new FormData(form);
                    const ids = String(fields.get('ids'))
                      .split(/[,\n]/)
                      .map((id) => id.trim())
                      .filter(Boolean);
                    try {
                      if (!ids.length) throw new Error('Enter at least one order ID.');
                      onUpdateNetwork(appendSiteOrders(network, String(fields.get('site')), ids));
                      setCorruptedAuditPlan(null);
                      setAddOrderMsg(`Added ${ids.length} orders.`);
                      form.reset();
                    } catch (err) {
                      setAddOrderMsg((err as Error).message);
                    }
                  }}
                >
                  <label className="font-auren-mono">
                    Copy delivery site and route inputs
                    <select required name="site" className="mt-1 block border border-[#0D0D0D]/20 bg-white p-2 text-xs outline-none">
                      {network.orders.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.id} · {o.customerName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="font-auren-mono">
                    New order IDs (comma or newline separated)
                    <textarea required name="ids" rows={1} className="mt-1 block border border-[#0D0D0D]/20 bg-white p-2 text-xs outline-none focus:border-[#0D0D0D]" />
                  </label>
                  <button
                    type="submit"
                    className="border border-[#0D0D0D] bg-[#0D0D0D] text-white hover:bg-[#cee49f] hover:text-[#0D0D0D] px-3.5 py-2 font-auren-mono uppercase text-[11px] tracking-wider cursor-pointer transition-colors"
                    disabled={!network.orders.length}
                  >
                    Add orders
                  </button>
                  <output aria-live="polite" className="font-auren-mono text-xs">
                    {addOrderMsg}
                  </output>
                </form>
                <div className="flex flex-wrap items-end gap-3 py-3 border-t border-[#0D0D0D]/15 text-xs">
                  <label className="font-auren-mono">
                    Import orders CSV
                    <input
                      className="mt-1 block"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        try {
                          const updated = importOrders(network, await file.text(), file.name);
                          onUpdateNetwork(updated);
                          setCorruptedAuditPlan(null);
                          setCsvMsg(`Imported ${updated.orders.length - network.orders.length} orders.`);
                        } catch (error) {
                          setCsvMsg((error as Error).message);
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="border border-[#0D0D0D]/25 bg-white px-3.5 py-2 font-auren-mono uppercase text-[11px] tracking-wider cursor-pointer hover:bg-[#0D0D0D] hover:text-white transition-colors"
                    onClick={() =>
                      downloadFile('order-template.csv', orderColumns.join(',') + '\r\n', 'text/csv')
                    }
                  >
                    Download CSV template
                  </button>
                </div>
                <output className="block whitespace-pre-line font-auren-mono text-xs" aria-live="polite">
                  {csvMsg}
                </output>
              </details>

              <div className="flex flex-wrap items-end gap-3 py-3 text-xs font-auren-mono">
                <label>
                  Search orders
                  <input
                    type="search"
                    className="mt-1 block border border-[#0D0D0D]/20 bg-white p-2 text-xs outline-none focus:border-[#0D0D0D]"
                    value={orderSearch}
                    placeholder="Order, customer, PIN or hub"
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                </label>
                <label>
                  Plan status
                  <select
                    className="mt-1 block border border-[#0D0D0D]/20 bg-white p-2 text-xs outline-none cursor-pointer"
                    value={orderFilter}
                    onChange={(e) => setOrderFilter(e.target.value)}
                  >
                    <option value="all">All orders</option>
                    <option value="unfulfilled">Unfulfilled</option>
                    <option value="reassigned">Reassigned</option>
                  </select>
                </label>
                <span className="pb-2 text-[#6B6860]">{filteredOrders.length} matching orders</span>
              </div>

              <div className="mt-2 overflow-x-auto rr-scroll max-h-[340px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#0D0D0D]/15 font-auren-mono text-[10px] uppercase tracking-wider text-[#5A5852]">
                      <th className="py-2.5 pr-3">Order ID</th>
                      <th className="py-2.5 pr-3">Customer PIN</th>
                      <th className="py-2.5 pr-3">Customer / Facility Name</th>
                      <th className="py-2.5 pr-3">Baseline Hub</th>
                      <th className="py-2.5 pr-3">Priority (Editable)</th>
                      <th className="py-2.5 pr-3">Qty (Editable)</th>
                      <th className="py-2.5 pr-3">SLA Deadline hrs (Editable)</th>
                      <th className="py-2.5 pr-3">Provenance</th>
                      <th className="py-2.5">Recovery assignment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0D0D0D]/10 font-auren-mono text-xs">
                    {filteredOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#F5F4F0]/60 transition-colors">
                        <td className="py-2.5 pr-3 font-bold">{ord.id}</td>
                        <td className="py-2.5 pr-3">{ord.pincode}</td>
                        <td className="py-2.5 pr-3 font-auren-sans font-medium">{ord.customerName}</td>
                        <td className="py-2.5 pr-3">{ord.baselineWarehouseId}</td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={ord.priority}
                            onChange={(e) =>
                              updateOrderField(
                                ord.id,
                                'priority',
                                e.target.value as OrderPriority
                              )
                            }
                            className="px-2 py-1 border border-[#0D0D0D]/20 bg-white text-xs outline-none cursor-pointer"
                          >
                            <option value="CRITICAL">CRITICAL</option>
                            <option value="STANDARD">STANDARD</option>
                          </select>
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={ord.quantity}
                            onChange={(e) =>
                              updateOrderField(
                                ord.id,
                                'quantity',
                                Number(e.target.value) > 0 ? Number(e.target.value) : ord.quantity
                              )
                            }
                            className="w-16 px-2 py-1 border border-[#0D0D0D]/20 bg-white text-xs outline-none focus:border-[#0D0D0D]"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={ord.deadlineHours}
                            onChange={(e) =>
                              updateOrderField(
                                ord.id,
                                'deadlineHours',
                                Number(e.target.value) > 0 ? Number(e.target.value) : ord.deadlineHours
                              )
                            }
                            className="w-20 px-2 py-1 border border-[#0D0D0D]/20 bg-white text-xs outline-none focus:border-[#0D0D0D]"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] border ${
                              PROVENANCE_BADGE_STYLE[ord.provenance.demand.classification]
                            }`}
                          >
                            {ord.provenance.demand.classification}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {orderResults.get(ord.id)?.assignedWarehouseId ?? (
                            <details>
                              <summary className="cursor-pointer text-[#8E2A1E] font-medium">Unfulfilled</summary>
                              <span className="text-[11px] text-[#5A5852]">
                                {orderResults.get(ord.id)?.unfulfilledReason}
                              </span>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 02: DISRUPTION SIMULATOR (F05, F06, F07, F10)
           ===================================================================== */}
        {activeView === 'simulator' && (
          <div className="mt-8 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4 p-6 border border-[#0D0D0D]/15 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div>
                <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                  SHOCK INJECTION &amp; NATURAL RECOVERY BENCHMARK (F05–F07, F10)
                </div>
                <h3 className="font-auren-sans text-xl font-bold uppercase tracking-[-0.02em] mt-0.5">
                  Configure Warehouse Outages, Route Closures &amp; Capacity Drops
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onDefaultShock}
                  className="px-3.5 py-2 bg-[#0D0D0D] text-white hover:bg-[#cee49f] hover:text-[#0D0D0D] border border-[#0D0D0D] font-auren-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer transition-colors"
                >
                  Apply Default Regional Shock
                </button>
                <button
                  type="button"
                  onClick={triggerSevereShock}
                  className="px-3.5 py-2 bg-[#8E2A1E] text-white hover:bg-[#A93325] border border-[#8E2A1E] font-auren-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer transition-colors"
                >
                  Inject Severe Multi-Corridor Shock
                </button>
                <button
                  type="button"
                  onClick={clearAllDisruptions}
                  className="px-3.5 py-2 border border-[#0D0D0D]/25 bg-white text-[#0D0D0D] font-auren-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer hover:bg-[#0D0D0D] hover:text-white transition-colors"
                >
                  Clear All Disruptions (Nominal)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Cols: Active Disruption Events & Transport Lanes */}
              <div className="lg:col-span-5 space-y-6">
                <div className="border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860] mb-3">
                    1. CONFIGURED DISRUPTION EVENTS (F05)
                  </div>
                  <div className="space-y-3">
                    {network.disruptions.map((dis) => (
                      <div
                        key={dis.id}
                        className={`p-3.5 border transition-all duration-150 ${
                          dis.active
                            ? 'border-[#8E2A1E] bg-[#FDF5F4]'
                            : 'border-[#0D0D0D]/15 bg-[#FAF9F6] hover:border-[#0D0D0D]/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-auren-mono text-[10px] uppercase text-[#6B6860]">
                              {dis.type} · Target: {dis.targetId} ({dis.severityPct}%)
                            </div>
                            <div className="font-auren-sans text-sm font-bold mt-0.5 tracking-tight">
                              {dis.label}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDisruptionItem(dis.id)}
                            className={`px-2.5 py-1 font-auren-mono text-[10px] uppercase tracking-wider cursor-pointer border transition-colors ${
                              dis.active
                                ? 'bg-[#8E2A1E] text-white border-[#8E2A1E] hover:bg-[#A93325]'
                                : 'bg-[#0D0D0D] text-white border-[#0D0D0D] hover:bg-[#cee49f] hover:text-[#0D0D0D]'
                            }`}
                          >
                            {dis.active ? 'ACTIVE' : 'INACTIVE'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <details className="rr-panel-disclosure">
                  <summary>
                    Transport routes <small>{network.transportOptions.length} routes</small>
                  </summary>
                  <details className="my-3 border border-[#0D0D0D]/15 p-3 text-xs font-auren-mono">
                    <summary className="cursor-pointer uppercase text-[11px]">
                      Recalculate all route distances, travel times and tariffs
                    </summary>
                    <form
                      key={JSON.stringify(network.routeAssumptions)}
                      className="mt-3 grid grid-cols-2 gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        const params = Object.fromEntries(
                          Array.from(fields, ([key, value]) => [key, Number(value)])
                        ) as unknown as RouteAssumptions;
                        setCorruptedAuditPlan(null);
                        onUpdateNetwork(applyRouteAssumptions(network, params));
                      }}
                    >
                      {(
                        [
                          ['circuity', 'Road / straight-line distance factor'],
                          ['speedKmh', 'Speed (km/h)'],
                          ['handlingHours', 'Handling delay (hours)'],
                          ['dispatchFee', 'Dispatch fee (₹)'],
                          ['pricePerKm', 'Distance tariff (₹/km)'],
                          ['reassignmentFee', 'Reassignment fee (₹)'],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="text-[11px]">
                          {label}
                          <input
                            className="mt-1 block border border-[#0D0D0D]/20 bg-white p-1.5 w-full text-xs outline-none focus:border-[#0D0D0D]"
                            name={key}
                            type="number"
                            required
                            step="any"
                            min={key === 'circuity' ? 1 : 0}
                            onInput={(event) =>
                              event.currentTarget.setCustomValidity(
                                key === 'speedKmh' && Number(event.currentTarget.value) <= 0
                                  ? 'Enter a positive speed.'
                                  : ''
                              )
                            }
                            defaultValue={
                              network.routeAssumptions?.[key] ??
                              (key === 'speedKmh'
                                ? network.defaultModeledSpeedKmh
                                : key === 'handlingHours'
                                  ? network.defaultHandlingDelayHours
                                  : undefined)
                            }
                          />
                        </label>
                      ))}
                      <button
                        type="submit"
                        className="border border-[#0D0D0D] bg-[#0D0D0D] text-white hover:bg-[#cee49f] hover:text-[#0D0D0D] px-3 py-2 col-span-2 uppercase text-[11px] tracking-wider cursor-pointer transition-colors"
                      >
                        Apply to all routes
                      </button>
                    </form>
                  </details>
                  <div className="max-h-[280px] overflow-y-auto rr-scroll divide-y divide-[#0D0D0D]/10">
                    {network.transportOptions.map((tr) => (
                      <div
                        key={tr.id}
                        className="py-2.5 flex items-center justify-between gap-2 font-auren-mono text-xs hover:bg-[#F5F4F0]/40 transition-colors px-1"
                      >
                        <div>
                          <div className="font-bold">
                            {tr.warehouseId} → {tr.orderId}
                          </div>
                          <div className="text-[10px] text-[#6B6860]">
                            {tr.roadDistanceKm}km · {Number(tr.estimatedTimeHours.toFixed(3))}h · ₹{tr.pricePerOrder}/order
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleTransportOptionAvailability(tr.id)}
                          className={`px-2.5 py-1 text-[10px] font-auren-mono uppercase tracking-wider cursor-pointer border transition-colors ${
                            !tr.available
                              ? 'bg-[#8E2A1E] text-white border-[#8E2A1E] hover:bg-[#A93325]'
                              : 'bg-[#E6F0EC] text-[#14382B] border border-[#14382B]/30 hover:bg-[#14382B] hover:text-white'
                          }`}
                        >
                          {tr.available ? 'OPEN' : 'CLOSED'}
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              </div>

              {/* Right 7 Cols: Immediate Impact Analysis (F06) + Stage A/B Natural Recovery (F07, F10) */}
              <div className="lg:col-span-7 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 border border-[#8E2A1E]/20 bg-[#FDF5F4] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <div className="font-auren-mono text-[10px] uppercase tracking-wider text-[#8E2A1E]">
                      IMMEDIATE IMPACT BEFORE REASSIGNMENT (F06)
                    </div>
                    <div className="mt-1 font-auren-sans text-3xl font-bold tracking-tight text-[#8E2A1E]">
                      {impactResult.disruptedServicePctBeforeReassignment.toFixed(1)}%
                    </div>
                    <div className="mt-1.5 font-auren-mono text-[11px] text-[#5A5852]">
                      {impactResult.survivingBaselineOrderIds.length} surviving · {impactResult.immediatelyAffectedOrderIds.length} disrupted
                    </div>
                  </div>

                  <div className="p-5 border border-[#0D0D0D]/15 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <div className="font-auren-mono text-[10px] uppercase tracking-wider text-[#0D0D0D]">
                      STAGE A: MAX NATURAL RECOVERY (F07)
                    </div>
                    <div className="mt-1 font-auren-sans text-3xl font-bold tracking-tight">
                      {stageAResult.achievedServicePct.toFixed(1)}%
                    </div>
                    <div className="mt-1.5 font-auren-mono text-[11px] text-[#5A5852]">
                      {stageAResult.fulfilledOrders}/{stageAResult.totalOrders} orders · Zero paid packages
                    </div>
                  </div>

                  <div className="p-5 border border-[#14382B]/20 bg-[#F2F7F5] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <div className="font-auren-mono text-[10px] uppercase tracking-wider text-[#14382B]">
                      STAGE B: CHEAPEST NATURAL COST (F10)
                    </div>
                    <div className="mt-1 font-auren-sans text-3xl font-bold tracking-tight text-[#14382B]">
                      ₹{stageBResult.transportAssignmentCost.toLocaleString('en-IN')}
                    </div>
                    <div className="mt-1.5 font-auren-mono text-[11px] text-[#5A5852]">
                      Min transport cost at {stageBResult.achievedServicePct.toFixed(1)}% natural service
                    </div>
                  </div>
                </div>

                <div className="border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860] mb-2">
                    ORDER-BY-ORDER IMMEDIATE SHOCK DIAGNOSTIC vs. NATURAL REASSIGNMENT (F06 / F07)
                  </div>
                  <div className="overflow-x-auto rr-scroll max-h-[380px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#0D0D0D]/15 font-auren-mono text-[10px] uppercase tracking-wider text-[#5A5852]">
                          <th className="py-2.5 pr-3">Order</th>
                          <th className="py-2.5 pr-3">Priority</th>
                          <th className="py-2.5 pr-3">Baseline Hub</th>
                          <th className="py-2.5 pr-3">Immediate Shock Status (F06)</th>
                          <th className="py-2.5 pr-3">Stage B Natural Recovery (F10)</th>
                          <th className="py-2.5">Natural Transport Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0D0D0D]/10 font-auren-mono text-xs">
                        {impactResult.orderImpacts.map((imp) => {
                          const nat = stageBResult.assignments.find((a) => a.orderId === imp.orderId);
                          return (
                            <tr key={imp.orderId} className="hover:bg-[#F5F4F0]/60 transition-colors">
                              <td className="py-2.5 pr-3 font-bold">
                                {imp.orderId} ({imp.customerName})
                              </td>
                              <td className="py-2.5 pr-3 uppercase">{imp.priority}</td>
                              <td className="py-2.5 pr-3">{imp.baselineWarehouseId}</td>
                              <td className="py-2.5 pr-3">
                                {imp.status !== 'UNAFFECTED' ? (
                                  <span className="text-[#8E2A1E] font-bold">
                                    {imp.status}: {imp.reason}
                                  </span>
                                ) : (
                                  <span className="text-[#14382B]">UNAFFECTED</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-3">
                                {!nat?.fulfilledOnTime || !nat?.assignedWarehouseId ? (
                                  <span className="text-[#8E2A1E]">
                                    UNFULFILLED (Needs Intervention)
                                  </span>
                                ) : (
                                  <span className="text-[#14382B] font-bold">
                                    {nat.assignedWarehouseId} ({nat.reassigned ? 'REASSIGNED' : 'ORIGINAL'})
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5">
                                {!nat?.fulfilledOnTime || !nat?.assignedWarehouseId
                                  ? '—'
                                  : `₹${nat.transportCost.toLocaleString('en-IN')}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 03: RECOVERY PLANNER (F08, F09, F11, F12, F13, F15)
           ===================================================================== */}
        {activeView === 'planner' && (
          <div className="mt-8 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Cols: Target Service %, Budget & Critical Protection Controls */}
              <div className="lg:col-span-5 border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-6">
                <div>
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                    STAGE C: GOAL-DRIVEN RECOVERY CONTROLS (F09 / F11)
                  </div>
                  <h3 className="font-auren-sans text-xl font-bold uppercase tracking-[-0.02em] mt-0.5">
                    Target Service Level &amp; Budget Cap
                  </h3>
                </div>

                {/* Target Service % Slider & Direct 0-100% Selector */}
                <div className="p-5 bg-[#FAF9F6] border border-[#0D0D0D]/15">
                  <div className="flex items-center justify-between gap-2 font-auren-mono text-xs">
                    <span className="uppercase tracking-wider">Target Service Level (%)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        aria-label="Target service percent"
                        min={0}
                        max={100}
                        step="any"
                        value={targetServicePct}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          if (Number.isNaN(raw)) return;
                          const clamped = Math.max(0, Math.min(100, raw));
                          setCorruptedAuditPlan(null);
                          onChangeTargetServicePct(clamped);
                        }}
                        className="w-20 px-2 py-1 bg-white border border-[#0D0D0D]/20 focus:border-[#0D0D0D] font-auren-mono text-base font-bold text-right outline-none"
                      />
                      <span className="text-lg font-bold">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    aria-label="Target Service Level Slider (%)"
                    min={0}
                    max={100}
                    step={0.5}
                    value={targetServicePct}
                    onChange={(e) => {
                      const clamped = Math.max(0, Math.min(100, Number(e.target.value)));
                      setCorruptedAuditPlan(null);
                      onChangeTargetServicePct(clamped);
                    }}
                    className="mt-3 w-full accent-[#0D0D0D] cursor-pointer"
                  />
                  <div className="mt-1 flex items-center justify-between font-auren-mono text-[10px] text-[#6B6860]">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[75, 80, 90, 95, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setCorruptedAuditPlan(null);
                          onChangeTargetServicePct(pct);
                        }}
                        className={`px-2.5 py-1 font-auren-mono text-[10px] tracking-wider border cursor-pointer transition-colors ${
                          targetServicePct === pct
                            ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]'
                            : 'bg-white text-[#0D0D0D] border-[#0D0D0D]/20 hover:border-[#0D0D0D]'
                        }`}
                      >
                        {pct}% Target
                      </button>
                    ))}
                  </div>
                </div>

                {/* Available Recovery Budget */}
                <div className="p-5 bg-[#FAF9F6] border border-[#0D0D0D]/15">
                  <div className="flex items-center justify-between font-auren-mono text-xs">
                    <span className="uppercase tracking-wider">Available Total Recovery Budget (₹)</span>
                    <span className="text-lg font-bold">
                      ₹{availableBudget.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    type="number"
                    aria-label="Recovery budget"
                    min={0}
                    step="any"
                    value={availableBudget}
                    onChange={(e) => {
                      setCorruptedAuditPlan(null);
                      onChangeAvailableBudget(
                        Math.max(0, Math.round(Number(e.target.value) * 100) / 100)
                      );
                    }}
                    className="mt-2.5 w-full px-3 py-2 bg-white border border-[#0D0D0D]/20 focus:border-[#0D0D0D] font-auren-mono text-sm outline-none"
                  />
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {(activeCityId === 'multi_city'
                      ? [5000, 8000, 10000, 12000, 15000]
                      : [1500, 2200, 2600, 3500, 5000]
                    ).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          setCorruptedAuditPlan(null);
                          onChangeAvailableBudget(b);
                        }}
                        className={`px-2.5 py-1 font-auren-mono text-[10px] tracking-wider border cursor-pointer transition-colors ${
                          availableBudget === b
                            ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]'
                            : 'bg-white text-[#0D0D0D] border-[#0D0D0D]/20 hover:border-[#0D0D0D]'
                        }`}
                      >
                        ₹{b.toLocaleString('en-IN')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority-Aware Critical Order Protection Toggle (F08) */}
                <div className="p-5 bg-[#FAF9F6] border border-[#0D0D0D]/15 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-auren-mono text-xs font-bold uppercase tracking-wider">
                      Protect Critical Orders First (F08)
                    </div>
                    <div className="font-auren-mono text-[10px] text-[#5A5852] mt-0.5">
                      Prioritizes clinical, cold-chain, and life-safety SKUs during capacity contention
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCorruptedAuditPlan(null);
                      onChangeProtectCritical(!protectCritical);
                    }}
                    className={`px-3 py-1.5 font-auren-mono text-[10px] uppercase tracking-wider cursor-pointer border transition-colors ${
                      protectCritical
                        ? 'bg-[#14382B] text-white border-[#14382B]'
                        : 'bg-white text-[#0D0D0D] border-[#0D0D0D]/30 hover:bg-[#0D0D0D] hover:text-white'
                    }`}
                  >
                    {protectCritical ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>

              {/* Right 7 Cols: Honest Infeasibility & Budget Diagnostics (F13) + Priced Interventions (F12) */}
              <div className="lg:col-span-7 space-y-6">
                {/* Honest Infeasibility & Budget Shortfall Panel (F13) */}
                <div
                  className={`p-6 border shadow-[0_1px_3px_rgba(0,0,0,0.03)] ${
                    !stageCResult.physicallyFeasible || !stageCResult.budgetCompliant
                      ? 'border-[#8E2A1E]/30 bg-[#FDF5F4]'
                      : 'border-[#14382B]/30 bg-[#F2F7F5]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em]">
                      SOLVER TRANSPARENCY &amp; BUDGET SHORTFALL DIAGNOSTIC (F13 / F15)
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 font-auren-mono text-xs font-bold uppercase ${
                          stageCResult.solverStatus === 'INFEASIBLE'
                            ? 'bg-[#8E2A1E] text-white'
                            : 'bg-[#14382B] text-white'
                        }`}
                      >
                        SOLVER: {stageCResult.solverStatus}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 font-auren-mono text-xs font-bold uppercase ${
                          stageCResult.budgetCompliant
                            ? 'bg-[#0D0D0D] text-white'
                            : 'bg-[#8E2A1E] text-white'
                        }`}
                      >
                        {!stageCResult.physicallyFeasible
                          ? 'NO TARGET PLAN'
                          : stageCResult.budgetCompliant
                            ? 'WITHIN BUDGET'
                            : `SHORTFALL: ₹${stageCResult.budgetShortfall.toLocaleString('en-IN')}`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3.5 space-y-1.5 font-auren-sans text-sm">
                    {stageCResult.infeasibilityExplanation.length > 0 ? (
                      stageCResult.infeasibilityExplanation.map((line, i) => (
                        <p key={i} className="text-[#8E2A1E] font-medium">
                          • {line}
                        </p>
                      ))
                    ) : (
                      <p className="text-[#14382B] font-medium">
                        • Target {targetServicePct}% service achieved ({stageCResult.fulfilledOrders}/{stageCResult.totalOrders} orders) at {stageCResult.optimalityProven ? 'minimum' : 'best found'} total recovery cost ₹{stageCResult.totalRecoveryCost.toLocaleString('en-IN')} (Transport: ₹{stageCResult.transportAssignmentCost.toLocaleString('en-IN')} + Interventions: ₹{stageCResult.interventionActivationCost.toLocaleString('en-IN')}).
                      </p>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 font-auren-mono text-xs">
                    <div className="p-3.5 bg-white border border-[#0D0D0D]/15">
                      <div className="text-[10px] text-[#6B6860] uppercase tracking-wider">
                        1. Max Natural Service (0 Intv)
                      </div>
                      <div className="mt-1 font-auren-sans text-xl font-bold">
                        {stageCResult.naturalMaxServicePct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-[#6B6860] mt-0.5">
                        {stageCResult.naturalMaxOrders}/{stageCResult.totalOrders} orders
                      </div>
                    </div>

                    <div className="p-3.5 bg-white border border-[#0D0D0D]/15">
                      <div className="text-[10px] text-[#6B6860] uppercase tracking-wider">
                        2. Max Possible w/ Interventions
                      </div>
                      <div className="mt-1 font-auren-sans text-xl font-bold">
                        {stageCResult.maxPossibleServicePct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-[#6B6860] mt-0.5">
                        Best service found with all eligible packages
                      </div>
                    </div>

                    <div className="p-3.5 bg-white border border-[#0D0D0D]/15">
                      <div className="text-[10px] text-[#6B6860] uppercase tracking-wider">
                        3. Plan Cost for {targetServicePct}% Target
                      </div>
                      <div className="mt-1 font-auren-sans text-xl font-bold text-[#14382B]">
                        {stageCResult.physicallyFeasible
                          ? `₹${stageCResult.totalRecoveryCost.toLocaleString('en-IN')}`
                          : stageCResult.solverStatus}
                      </div>
                      <div className="text-[10px] text-[#6B6860] mt-0.5">
                        {stageCResult.activatedInterventions.length} packages activated
                      </div>
                    </div>
                  </div>
                </div>

                {/* Priced Emergency Intervention Packages Table (F12) */}
                <div className="border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860] mb-1">
                    PRICED EMERGENCY INTERVENTION PACKAGES (F12)
                  </div>
                  <h3 className="font-auren-sans text-lg font-bold uppercase tracking-[-0.01em] mb-3">
                    Stock, Handling-Capacity &amp; Emergency Transport Packages
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#0D0D0D]/15 font-auren-mono text-[10px] uppercase tracking-wider text-[#5A5852]">
                          <th className="py-2.5 pr-3">Solver Selection</th>
                          <th className="py-2.5 pr-3">Eligible</th>
                          <th className="py-2.5 pr-3">Package ID &amp; Name</th>
                          <th className="py-2.5 pr-3">Type / Target</th>
                          <th className="py-2.5 pr-3">Relief Delta</th>
                          <th className="py-2.5">Activation Price (₹ Editable)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0D0D0D]/10 font-auren-mono text-xs">
                        {network.interventions.map((intv) => {
                          const isSelected = activePlan.activatedInterventions.some(
                            (a) => a.id === intv.id
                          );
                          return (
                            <tr
                              key={intv.id}
                              className={`transition-colors ${isSelected ? 'bg-[#E6F0EC]' : 'hover:bg-[#F5F4F0]/60'}`}
                            >
                              <td className="py-2.5 pr-3">
                                <span
                                  className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                                    isSelected
                                      ? 'bg-[#14382B] text-white'
                                      : 'bg-[#E8E5DD] text-[#5A5852]'
                                  }`}
                                >
                                  {isSelected ? 'ACTIVATED' : 'STANDBY'}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3">
                                <input
                                  type="checkbox"
                                  checked={intv.eligible}
                                  onChange={(e) =>
                                    updateInterventionField(intv.id, 'eligible', e.target.checked)
                                  }
                                  className="accent-[#0D0D0D] cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 pr-3">
                                <div className="font-bold">{intv.id}</div>
                                <div className="font-auren-sans text-xs">{intv.name}</div>
                              </td>
                              <td className="py-2.5 pr-3 uppercase">
                                {intv.type} ({intv.affectedResourceId})
                              </td>
                              <td className="py-2.5 pr-3">
                                {intv.inventoryDelta > 0 && `+${intv.inventoryDelta} Inv `}
                                {intv.capacityDelta > 0 && `+${intv.capacityDelta} Cap `}
                                <label className="block mt-1 text-[10px] text-[#5A5852]">
                                  Activation delay (hours)
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    aria-label={`${intv.id} activation delay in hours`}
                                    className="ml-2 w-16 border border-[#0D0D0D]/20 bg-white px-1.5 py-0.5 text-xs text-[#0D0D0D] outline-none focus:border-[#0D0D0D]"
                                    value={intv.leadTimeHours}
                                    onChange={(e) =>
                                      updateInterventionField(
                                        intv.id,
                                        'leadTimeHours',
                                        Math.max(0, Number(e.target.value))
                                      )
                                    }
                                  />
                                </label>
                                {intv.restoresRoute && `Restores Route (-${intv.timeReductionHours}h)`}
                              </td>
                              <td className="py-2.5">
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={intv.activationPrice}
                                  onChange={(e) =>
                                    updateInterventionField(
                                      intv.id,
                                      'activationPrice',
                                      Math.max(0, Math.round(Number(e.target.value) * 100) / 100)
                                    )
                                  }
                                  className="w-24 px-2 py-1 bg-white border border-[#0D0D0D]/20 focus:border-[#0D0D0D] text-xs outline-none"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 04: SCENARIO COMPARISON (F16)
           ===================================================================== */}
        {activeView === 'comparison' && (
          <div className="mt-8 space-y-8">
            <div className="border border-[#0D0D0D]/15 bg-white p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                SIDE-BY-SIDE MULTI-STAGE SCENARIO BENCHMARK (F16)
              </div>
              <h3 className="font-auren-sans text-2xl font-bold uppercase tracking-[-0.02em] mt-1">
                Baseline vs. Immediate Shock vs. Natural Recovery vs. Target Recovery
              </h3>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-4 border border-[#0D0D0D]/15 divide-y md:divide-y-0 md:divide-x divide-[#0D0D0D]/15">
                {/* Col 1: Baseline */}
                <div className="p-6 bg-[#FAF9F6]">
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6860]">
                    STAGE 00 // NOMINAL BASELINE
                  </div>
                  <div className="mt-2 font-auren-sans text-3xl font-bold tracking-tight">
                    {impactResult.baselineServicePct.toFixed(1)}%
                  </div>
                  <div className="mt-4 space-y-2.5 font-auren-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Fulfilled Orders:</span>
                      <strong>
                        {impactResult.baselineFulfilledOrders}/{impactResult.totalOrders}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Transport Cost:</span>
                      <strong>₹{impactResult.baselineCost.toLocaleString('en-IN')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Emergency Cost:</span>
                      <strong>₹0</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Reassignments:</span>
                      <strong>0</strong>
                    </div>
                  </div>
                </div>

                {/* Col 2: Disrupted Before Reassignment */}
                <div className="p-6 bg-[#FDF5F4]">
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#8E2A1E]">
                    STAGE 01 // DISRUPTED (NO REASSIGNMENT)
                  </div>
                  <div className="mt-2 font-auren-sans text-3xl font-bold tracking-tight text-[#8E2A1E]">
                    {impactResult.disruptedServicePctBeforeReassignment.toFixed(1)}%
                  </div>
                  <div className="mt-4 space-y-2.5 font-auren-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Surviving Orders:</span>
                      <strong>
                        {impactResult.survivingBaselineOrderIds.length}/{impactResult.totalOrders}
                      </strong>
                    </div>
                    <div className="flex justify-between text-[#8E2A1E]">
                      <span>Directly Disrupted:</span>
                      <strong>{impactResult.immediatelyAffectedOrderIds.length} orders</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Retained Cost:</span>
                      <strong>₹{impactResult.disruptedRetainedCost.toLocaleString('en-IN')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Emergency Cost:</span>
                      <strong>₹0</strong>
                    </div>
                  </div>
                </div>

                {/* Col 3: Natural Recovery (Stage A + Stage B) */}
                <div className="p-6 bg-white">
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#0D0D0D]">
                    STAGE A+B // CHEAPEST NATURAL RECOVERY
                  </div>
                  <div className="mt-2 font-auren-sans text-3xl font-bold tracking-tight">
                    {stageBResult.achievedServicePct.toFixed(1)}%
                  </div>
                  <div className="mt-4 space-y-2.5 font-auren-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Fulfilled Orders:</span>
                      <strong>
                        {stageBResult.fulfilledOrders}/{stageBResult.totalOrders}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Critical Protected:</span>
                      <strong>
                        {stageBResult.criticalOrdersFulfilled}/{stageBResult.criticalOrdersTotal}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Transport Cost:</span>
                      <strong>₹{stageBResult.transportAssignmentCost.toLocaleString('en-IN')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Paid Interventions:</span>
                      <strong>0 (₹0)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Verification:</span>
                      <strong className="text-[#14382B]">
                        {stageBResult.verification.overallStatus}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Col 4: Stage C Target Recovery */}
                <div className="p-6 bg-[#F2F7F5]">
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.12em] text-[#14382B]">
                    STAGE C // TARGET RECOVERY ({targetServicePct}%)
                  </div>
                  <div className="mt-2 font-auren-sans text-3xl font-bold tracking-tight text-[#14382B]">
                    {stageCResult.achievedServicePct.toFixed(1)}%
                  </div>
                  <div className="mt-4 space-y-2.5 font-auren-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Fulfilled Orders:</span>
                      <strong>
                        {stageCResult.fulfilledOrders}/{stageCResult.totalOrders}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Critical Protected:</span>
                      <strong>
                        {stageCResult.criticalOrdersFulfilled}/{stageCResult.criticalOrdersTotal}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Transport Cost:</span>
                      <strong>₹{stageCResult.transportAssignmentCost.toLocaleString('en-IN')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Intervention Cost:</span>
                      <strong>
                        ₹{stageCResult.interventionActivationCost.toLocaleString('en-IN')}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Total Recovery Cost:</span>
                      <strong>₹{stageCResult.totalRecoveryCost.toLocaleString('en-IN')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5A5852]">Solver / Verifier:</span>
                      <strong>
                        {stageCResult.solverStatus} / {stageCResult.verification.overallStatus}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 05: VERIFIED RECOVERY ACTION SHEET (F14, F17)
           ===================================================================== */}
        {activeView === 'actionsheet' && (
          <div className="mt-8 space-y-8">
            {/* Independent 12-Point Plan Verification Panel (F14) */}
            <div className="border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#0D0D0D]/15">
                <div>
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                    SEPARATE DETERMINISTIC CONSTRAINT AUDITOR (F14)
                  </div>
                  <h3 className="font-auren-sans text-2xl font-bold uppercase tracking-[-0.02em] flex items-center gap-3 mt-0.5">
                    <span>Independent {activeVerification.totalChecks}-Point Plan Verification</span>
                    <span
                      className={`px-3 py-0.5 font-auren-mono text-xs uppercase tracking-wider ${
                        activeVerification.overallStatus === 'PASS'
                          ? 'bg-[#14382B] text-white'
                          : 'bg-[#8E2A1E] text-white'
                      }`}
                    >
                      {activeVerification.overallStatus} ({activeVerification.passedCount}/
                      {activeVerification.totalChecks} PASSED)
                    </span>
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {corruptedAuditPlan ? (
                    <button
                      type="button"
                      onClick={() => setCorruptedAuditPlan(null)}
                      className="px-3.5 py-2 bg-[#14382B] text-white font-auren-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer hover:bg-[#0D0D0D] transition-colors"
                    >
                      Restore Validated Solver Plan ✓
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setCorruptedAuditPlan(
                          createCorruptedPlanForAudit(network, activePlan, 'ASSIGN_TO_OUTAGE')
                        )
                      }
                      className="px-3.5 py-2 border border-[#8E2A1E] text-[#8E2A1E] bg-[#FDF5F4] font-auren-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer hover:bg-[#8E2A1E] hover:text-white transition-colors"
                    >
                      Simulate Deliberate Plan Corruption (Test verifier with an invalid plan)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isStale}
                    onClick={handleExportCsv}
                    className="px-3.5 py-2 bg-[#0D0D0D] text-white hover:bg-[#cee49f] hover:text-[#0D0D0D] border border-[#0D0D0D] font-auren-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer transition-colors disabled:opacity-50"
                  >
                    Export Action Sheet CSV (F17) ↓
                  </button>
                </div>
              </div>

              <details
                className="rr-disclosure"
                key={activeVerification.overallStatus}
                open={activeVerification.overallStatus === 'FAIL' || true}
              >
                <summary>Verification details</summary>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeVerification.checks.map((chk) => (
                    <div
                      key={chk.id}
                      className={`p-4 border transition-all duration-150 ${
                        chk.passed
                          ? 'border-[#0D0D0D]/15 bg-[#FAF9F6] hover:border-[#0D0D0D]/30'
                          : 'border-[#8E2A1E] bg-[#FDF5F4]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-auren-mono text-[10px] uppercase">
                        <span className="font-bold">{chk.id}</span>
                        <span
                          className={`px-2 py-0.5 font-bold tracking-wider ${
                            chk.passed
                              ? 'bg-[#14382B] text-white'
                              : 'bg-[#8E2A1E] text-white'
                          }`}
                        >
                          {chk.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                      <div className="mt-1 font-auren-sans text-sm font-bold tracking-tight">{chk.name}</div>
                      <div className="mt-1 font-auren-mono text-[10px] text-[#5A5852]">
                        {chk.details}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* Complete Order-Level Recovery Action Sheet Table */}
            <div className="border border-[#0D0D0D]/15 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#0D0D0D]/15">
                <div>
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6860]">
                    COMPUTED MODEL RESULT // ORDER-LEVEL RECOVERY ASSIGNMENTS (F17)
                  </div>
                  <h3 className="font-auren-sans text-xl font-bold uppercase tracking-[-0.02em] mt-0.5">
                    Verified Recovery Action Sheet — {network.name}
                  </h3>
                </div>
                <span className="px-2.5 py-1 font-auren-mono text-[10px] border border-[#1F4E3D] bg-[#E6F0EC] text-[#14382B] uppercase tracking-wider">
                  Provenance: Computed model result
                </span>
              </div>

              <div className="mt-4 overflow-x-auto rr-scroll">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#0D0D0D]/15 font-auren-mono text-[10px] uppercase tracking-wider text-[#5A5852]">
                      <th className="py-2.5 pr-3">Order ID</th>
                      <th className="py-2.5 pr-3">Customer / PIN</th>
                      <th className="py-2.5 pr-3">Priority</th>
                      <th className="py-2.5 pr-3">Qty</th>
                      <th className="py-2.5 pr-3">Baseline Hub</th>
                      <th className="py-2.5 pr-3">Assigned Hub</th>
                      <th className="py-2.5 pr-3">Distance</th>
                      <th className="py-2.5 pr-3">Est Time / SLA</th>
                      <th className="py-2.5 pr-3">Transport Cost</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5">Diagnostic / Unfulfilled Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0D0D0D]/10 font-auren-mono text-xs">
                    {activePlan.assignments
                      .filter((asgn) => network.orders.some((o) => o.id === asgn.orderId))
                      .map((asgn) => (
                      <tr key={asgn.orderId} className="hover:bg-[#F5F4F0]/60 transition-colors">
                        <td className="py-2.5 pr-3 font-bold">{asgn.orderId}</td>
                        <td className="py-2.5 pr-3">
                          <div className="font-auren-sans font-medium">{asgn.customerName}</div>
                          <div className="text-[10px] text-[#6B6860]">
                            PIN {asgn.pincode} · {(asgn.orderCityId || network.cityId).toUpperCase()}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 uppercase">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold ${
                              asgn.priority === 'CRITICAL'
                                ? 'bg-[#0D0D0D] text-white'
                                : 'bg-[#E8E5DD] text-[#0D0D0D]'
                            }`}
                          >
                            {asgn.priority}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">{asgn.quantity}</td>
                        <td className="py-2.5 pr-3">{asgn.baselineWarehouseId}</td>
                        <td className="py-2.5 pr-3">
                          <div className="font-bold">{asgn.assignedWarehouseId || 'NONE'}</div>
                          {asgn.assignedWarehouseCityId && (
                            <div className="text-[10px] text-[#6B6860]">
                              {asgn.assignedWarehouseCityId.toUpperCase()}
                              {asgn.corridorMode ? ` · ${CORRIDOR_MODE_LABELS[asgn.corridorMode]}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {asgn.roadDistanceKm !== null ? `${asgn.roadDistanceKm}km` : '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          {asgn.estimatedTimeHours !== null
                            ? `${asgn.estimatedTimeHours}h / ${asgn.deadlineHours}h`
                            : `— / ${asgn.deadlineHours}h`}
                        </td>
                        <td className="py-2.5 pr-3">
                          ₹{asgn.transportCost.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                              !asgn.fulfilledOnTime || !asgn.assignedWarehouseId
                                ? 'bg-[#8E2A1E] text-white'
                                : asgn.isCrossCity
                                ? 'bg-[#1D4ED8] text-white'
                                : asgn.reassigned
                                ? 'bg-[#14382B] text-white'
                                : 'bg-[#E8E5DD] text-[#0D0D0D]'
                            }`}
                          >
                            {!asgn.fulfilledOnTime || !asgn.assignedWarehouseId
                              ? 'UNFULFILLED'
                              : asgn.isCrossCity
                              ? 'CROSS-CITY'
                              : asgn.reassigned
                              ? 'REASSIGNED'
                              : 'ORIGINAL HUB'}
                          </span>
                        </td>
                        <td className="py-2.5 text-[11px] text-[#5A5852]">
                          {asgn.unfulfilledReason ||
                            (asgn.isCrossCity
                              ? `Cross-city recovery (${asgn.assignedWarehouseCityId?.toUpperCase()} → ${asgn.orderCityId?.toUpperCase()}) within SLA`
                              : 'Verified feasible within SLA & capacity')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
