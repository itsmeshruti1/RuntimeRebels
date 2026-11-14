import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import {
  defaultBudget,
  getInitialNetworks,
  hydrateCrossCityTransportOptions,
  SOURCE_FILE_AUDITS,
} from './src/data/networks';
import { solveWithinBudget } from './src/engine/budget';
import { csvRow } from './src/engine/csv';
import {
  analyzeImmediateImpact,
  solveNaturalRecovery,
  solveTargetRecovery,
} from './src/engine/solver';
import { validateConfig, validateNetwork } from './src/engine/validation';
import { createCorruptedPlanForAudit, verifyRecoveryPlan } from './src/engine/verifier';
import { CityId, CityNetwork, PlannerConfig, RecoveryPlan } from './src/types/recovery';
import { aggregateWarehouseCounts, ExtractedWarehouseRow } from './src/utils/warehouseFileImport';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT ?? 3000);

  app.use(express.json({ limit: '25mb' }));

  const networks = getInitialNetworks();
  const runsStore = new Map<string, { plan: RecoveryPlan; network: CityNetwork; config: PlannerConfig }>();

  // 1. GET /api/health
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ReverseResilia Optimization & Verification Engine',
      solver: 'Exact Branch-and-Bound MILP / CP-SAT Combinatorial Model',
      citiesLoaded: Object.keys(networks),
      sourceAudits: SOURCE_FILE_AUDITS,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. GET /api/cities
  app.get('/api/cities', (_req, res) => {
    const list = Object.values(networks).map((n) => ({
      cityId: n.cityId,
      name: n.name,
      regionZone: n.regionZone,
      warehousesCount: n.warehouses.length,
      ordersCount: n.orders.length,
      interventionsCount: n.interventions.length,
      seed: n.seed,
      bbox: n.bbox,
    }));
    res.json({ cities: list, sourceAudits: SOURCE_FILE_AUDITS });
  });

  // 3. GET /api/network/:cityId
  app.get('/api/network/:cityId', (req, res) => {
    const cityId = req.params.cityId as CityId;
    const net = Object.hasOwn(networks, cityId) ? networks[cityId] : undefined;
    if (!net) {
      res.status(404).json({ error: `Unknown city_id: ${cityId}` });
      return;
    }
    res.json({ network: net });
  });

  app.use('/api', (req, res, next) => {
    try {
      if (req.body?.network !== undefined) validateNetwork(req.body.network);
      if (req.body?.cityId !== undefined && !Object.hasOwn(networks, req.body.cityId)) {
        throw new Error('Unknown city ID.');
      }
      if (req.body?.protectCriticalOrders !== undefined && typeof req.body.protectCriticalOrders !== 'boolean') {
        throw new Error('Invalid priority setting.');
      }
      next();
    } catch (err) {
      res.status(422).json({ valid: false, errors: [(err as Error).message] });
    }
  });

  // 4. POST /api/network/validate
  app.post('/api/network/validate', (req, res) => {
    const rawNet = req.body?.network as CityNetwork | undefined;
    if (!rawNet || !Array.isArray(rawNet.warehouses) || !Array.isArray(rawNet.orders)) {
      res.status(400).json({ valid: false, errors: ['Missing warehouses or orders array in network payload'] });
      return;
    }
    if (!Object.hasOwn(networks, rawNet.cityId)) {
      res.status(422).json({ valid: false, errors: ['Unknown city ID for stored scenario.'] });
      return;
    }
    const hydrated = hydrateCrossCityTransportOptions({
      ...rawNet,
      transportOptions: Array.isArray(rawNet.transportOptions) ? rawNet.transportOptions : [],
      interventions: Array.isArray(rawNet.interventions) ? rawNet.interventions : [],
      disruptions: Array.isArray(rawNet.disruptions) ? rawNet.disruptions : [],
    });
    networks[hydrated.cityId] = hydrated;
    const distinctWarehouseCities = Array.from(
      new Set(hydrated.warehouses.map((w) => String(w.cityId || hydrated.cityId))),
    );
    res.json({
      valid: true,
      cityId: hydrated.cityId,
      warehousesCount: hydrated.warehouses.length,
      warehouseCities: distinctWarehouseCities,
      ordersCount: hydrated.orders.length,
      transportOptionsCount: hydrated.transportOptions.length,
    });
  });

  // 5. POST /api/scenarios/impact
  app.post('/api/scenarios/impact', (req, res) => {
    const rawNet = (req.body?.network as CityNetwork) || networks[(req.body?.cityId as CityId) || 'bengaluru'];
    if (!rawNet) {
      res.status(400).json({ error: 'Valid network or cityId required' });
      return;
    }
    const net = hydrateCrossCityTransportOptions(rawNet);
    const impact = analyzeImmediateImpact(net);
    res.json({ impact });
  });

  // 6. POST /api/recovery/max-service (Stages A & B)
  app.post('/api/recovery/max-service', (req, res) => {
    const rawNet = (req.body?.network as CityNetwork) || networks[(req.body?.cityId as CityId) || 'bengaluru'];
    const protectCriticalOrders = req.body?.protectCriticalOrders !== false;
    if (!rawNet) {
      res.status(400).json({ error: 'Valid network or cityId required' });
      return;
    }
    const net = hydrateCrossCityTransportOptions(rawNet);
    const { stageA, stageB } = solveNaturalRecovery(net, protectCriticalOrders);
    runsStore.set(stageA.runId, {
      plan: stageA,
      network: net,
      config: {
        targetServicePct: stageA.achievedServicePct,
        availableBudget: stageA.availableBudget,
        permittedInterventionIds: [],
        protectCriticalOrders,
      },
    });
    runsStore.set(stageB.runId, {
      plan: stageB,
      network: net,
      config: {
        targetServicePct: stageB.achievedServicePct,
        availableBudget: stageB.availableBudget,
        permittedInterventionIds: [],
        protectCriticalOrders,
      },
    });
    res.json({ stageA, stageB });
  });

  // 7. POST /api/recovery/optimize (Stage C)
  app.post('/api/recovery/optimize', (req, res) => {
    const rawNet = (req.body?.network as CityNetwork) || networks[(req.body?.cityId as CityId) || 'bengaluru'];
    if (!rawNet) {
      res.status(400).json({ error: 'Valid network or cityId required' });
      return;
    }
    const net = hydrateCrossCityTransportOptions(rawNet);
    const config: PlannerConfig = {
      targetServicePct: req.body?.config?.targetServicePct ?? 100,
      availableBudget: req.body?.config?.availableBudget ?? defaultBudget(net),
      permittedInterventionIds:
        req.body?.config?.permittedInterventionIds ??
        net.interventions.filter((i) => i.eligible).map((i) => i.id),
      protectCriticalOrders: req.body?.config?.protectCriticalOrders ?? true,
      timeoutMs: req.body?.config?.timeoutMs,
    };
    try {
      validateConfig(config, net);
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
      return;
    }
    const plan = solveTargetRecovery(net, config);
    runsStore.set(plan.runId, { plan, network: net, config });
    res.json({ plan, budget: solveWithinBudget(net, config, plan) });
  });

  // 8. POST /api/recovery/verify (Independent Verification F14)
  app.post('/api/recovery/verify', (req, res) => {
    const rawNet = req.body?.network as CityNetwork;
    let plan = req.body?.plan as RecoveryPlan;
    const net = rawNet ? hydrateCrossCityTransportOptions(rawNet) : rawNet;
    const config = (req.body?.config as PlannerConfig) || {
      targetServicePct: plan?.requestedTargetPct ?? 100,
      availableBudget: plan?.availableBudget ?? 0,
      permittedInterventionIds: net?.interventions.map((i) => i.id) ?? [],
      protectCriticalOrders: true,
    };
    const corruptMode = req.body?.corruptMode as
      | 'ASSIGN_TO_OUTAGE'
      | 'EXCEED_CAPACITY'
      | 'FABRICATE_COST'
      | undefined;

    if (!net || !plan) {
      res.status(400).json({ error: 'Both network and plan are required for independent verification' });
      return;
    }
    try {
      validateConfig(config, net);
      if (
        ![plan.assignments, plan.activatedInterventions, plan.warehouseUtilization].every(
          (list) => Array.isArray(list) && list.every((x) => x && typeof x === 'object'),
        ) ||
        !['STAGE_A_MAX_NATURAL', 'STAGE_B_CHEAPEST_NATURAL', 'STAGE_C_TARGET_RECOVERY'].includes(plan.stage) ||
        (corruptMode && !['ASSIGN_TO_OUTAGE', 'EXCEED_CAPACITY', 'FABRICATE_COST'].includes(corruptMode))
      ) {
        throw new Error('Invalid plan or corruption mode.');
      }
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
      return;
    }
    if (corruptMode) {
      plan = createCorruptedPlanForAudit(net, plan, corruptMode);
    }
    const report = verifyRecoveryPlan(net, plan, config);
    if (corruptMode) {
      report.corruptedTestMode = true;
    }
    res.json({ verification: report, evaluatedPlan: plan });
  });

  // 9. GET /api/runs/:runId
  app.get('/api/runs/:runId', (req, res) => {
    const entry = runsStore.get(req.params.runId);
    if (!entry) {
      res.status(404).json({ error: `Run ${req.params.runId} not found` });
      return;
    }
    res.json(entry);
  });

  // 10. GET /api/runs/:runId/export (CSV Export F17)
  app.get('/api/runs/:runId/export', (req, res) => {
    const entry = runsStore.get(req.params.runId);
    if (!entry) {
      res.status(404).json({ error: `Run ${req.params.runId} not found` });
      return;
    }
    const { plan } = entry;
    const headers = [
      'RunID',
      'City',
      'Stage',
      'SolverStatus',
      'VerificationStatus',
      'OrderID',
      'OrderCity',
      'CustomerName',
      'PINCode',
      'Quantity',
      'Priority',
      'DeadlineHours',
      'BaselineWarehouse',
      'AssignedWarehouse',
      'AssignedWarehouseCity',
      'CrossCity',
      'CorridorMode',
      'Reassigned',
      'RoadDistanceKm',
      'EstimatedTimeHours',
      'TransportCostINR',
      'FulfilledOnTime',
      'Provenance',
    ];
    const rows = plan.assignments.map((a) =>
      csvRow([
        plan.runId,
        plan.cityName,
        plan.stage,
        plan.solverStatus,
        plan.verification.overallStatus,
        a.orderId,
        a.orderCityId || plan.cityId,
        a.customerName,
        a.pincode,
        a.quantity,
        a.priority,
        a.deadlineHours,
        a.baselineWarehouseId,
        a.assignedWarehouseId || 'UNASSIGNED',
        a.assignedWarehouseCityId || 'NONE',
        a.isCrossCity ? 'YES' : 'NO',
        a.corridorMode || 'NONE',
        a.reassigned,
        a.roadDistanceKm ?? '',
        a.estimatedTimeHours ?? '',
        a.transportCost,
        a.fulfilledOnTime,
        a.provenanceLabel,
      ]),
    );
    const csv = [csvRow(headers), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reverseresilia-${plan.runId}.csv"`);
    res.send(csv);
  });

  // 11. POST /api/warehouses/extract-file (PDF / Image Warehouse Count Extraction via Gemini)
  app.post('/api/warehouses/extract-file', async (req, res) => {
    try {
      const fileName = String(req.body?.fileName || 'uploaded-file');
      const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
      const rawBase64 = String(req.body?.base64Data || '');
      const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',').pop() || '' : rawBase64;

      if (!mimeType || !cleanBase64) {
        res.status(400).json({ error: 'Both mimeType and base64Data are required.' });
        return;
      }

      const supportedMime =
        mimeType === 'application/pdf' || mimeType.startsWith('image/');
      if (!supportedMime) {
        res.status(400).json({
          error: `Unsupported MIME type "${mimeType}". Upload a CSV, PDF, or Image file.`,
        });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error:
            'GEMINI_API_KEY is not configured in Settings > Secrets. CSV files parse automatically without a key; add GEMINI_API_KEY to extract PDF and Image files.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const filePart = {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      };

      const promptPart = {
        text: [
          'Extract every warehouse or hub listed in this uploaded file.',
          'CRITICAL RULE: Ignore individual product types, SKUs, categories, or item names.',
          'Only keep and sum the total count of all available products at each warehouse into totalProducts.',
          'If a warehouse appears across multiple product rows, either output each count accurately or sum them under that warehouse.',
          'Also include warehouseId, city, pincode, processingCapacity, and status if shown.',
        ].join(' '),
      };

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts: [filePart, promptPart] },
        config: {
          systemInstruction:
            'Extract structured warehouse inventory counts. Ignore product types and output only total available product counts per warehouse in JSON.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              warehouses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    warehouseId: {
                      type: Type.STRING,
                      description: 'Warehouse ID or code if listed',
                    },
                    warehouseName: {
                      type: Type.STRING,
                      description: 'Warehouse or hub name',
                    },
                    city: {
                      type: Type.STRING,
                      description: 'City or region name if listed',
                    },
                    pincode: {
                      type: Type.STRING,
                      description: '6-digit PIN or postal code if listed',
                    },
                    totalProducts: {
                      type: Type.NUMBER,
                      description:
                        'Total count of products available at the warehouse across all product types',
                    },
                    processingCapacity: {
                      type: Type.NUMBER,
                      description: 'Handling capacity if explicitly specified',
                    },
                    status: {
                      type: Type.STRING,
                      description: 'ACTIVE, OUTAGE, or DEGRADED if indicated',
                    },
                  },
                },
              },
            },
          },
        },
      });

      const parsedJson = JSON.parse((response.text ?? '{"warehouses":[]}').trim()) as {
        warehouses?: ExtractedWarehouseRow[];
      };
      const rawRows = Array.isArray(parsedJson.warehouses) ? parsedJson.warehouses : [];
      const aggregated = aggregateWarehouseCounts(rawRows);

      if (aggregated.length === 0) {
        res.status(422).json({
          error: `No warehouse product counts could be detected in "${fileName}". Ensure the file lists warehouse names/IDs and product counts.`,
        });
        return;
      }

      res.json({
        fileName,
        rawRowsCount: rawRows.length,
        warehouses: aggregated,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract warehouse data from file.';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production' && !process.argv.includes('--production')) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(port, process.env.HOST || '0.0.0.0', () => {
    const address = server.address() as import('net').AddressInfo;
    console.log(`ReverseResilia Server listening on http://localhost:${address.port}`);
  });
}

startServer();
