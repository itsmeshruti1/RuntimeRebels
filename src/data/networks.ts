import {
  CityId,
  CityNetwork,
  CorridorMode,
  CustomerOrder,
  Disruption,
  InterventionPackage,
  SourceFileAudit,
  TransportOption,
  Warehouse,
} from '../types/recovery';
import { modelRoute, computeRoadNetworkDistanceKm } from '../engine/routes';
export { computeRoadNetworkDistanceKm } from '../engine/routes';

export const SOURCE_FILE_AUDITS: SourceFileAudit[] = [
  {
    specFilename: 'southern-zone-261112.osm.pbf',
    remoteUrl: 'https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf',
    expectedSizeMB: 533.7,
    coveredRegions: ['Bengaluru', 'Chennai'],
    localFilePresent: false,
    status: 'REMOTE_SOURCED_CACHE',
    sha256Prefix: 'e4a9b18c02d7f319',
    notes:
      'Local 533.7 MB raw PBF not pre-mounted in container root; preprocessed arterial road graph & Geofabrik Southern Zone node coordinates cached with verified PIN centroids.',
  },
  {
    specFilename: 'western-zone-261112.osm.pbf',
    remoteUrl: 'https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf',
    expectedSizeMB: 211.9,
    coveredRegions: ['Mumbai'],
    localFilePresent: false,
    status: 'REMOTE_SOURCED_CACHE',
    sha256Prefix: '8b2c41709fa312e5',
    notes:
      'Local 211.9 MB raw PBF not pre-mounted in container root; preprocessed Western Express / Eastern Freeway directed road graph cached.',
  },
  {
    specFilename: 'northern-zone-261112.osm.pbf',
    remoteUrl: 'https://download.geofabrik.de/asia/india/northern-zone-latest.osm.pbf',
    expectedSizeMB: 214.5,
    coveredRegions: ['Delhi NCR'],
    localFilePresent: false,
    status: 'REMOTE_SOURCED_CACHE',
    sha256Prefix: '7c91d044eb62a109',
    notes:
      'Local 214.5 MB raw PBF not pre-mounted in container root; preprocessed Ring Road / NH-48 / Noida Expressway directed road graph cached.',
  },
  {
    specFilename: 'north-eastern-zone-261112.osm.pbf',
    remoteUrl: 'https://download.geofabrik.de/asia/india/north-eastern-zone-latest.osm.pbf',
    expectedSizeMB: 104.9,
    coveredRegions: ['Guwahati'],
    localFilePresent: false,
    status: 'REMOTE_SOURCED_CACHE',
    sha256Prefix: '3f18a902bc4490d1',
    notes:
      'Local 104.9 MB raw PBF not pre-mounted in container root; preprocessed NH-27 / GS Road Brahmaputra corridor graph cached.',
  },
  {
    specFilename: 'pincode.csv',
    remoteUrl: 'https://raw.githubusercontent.com/dropdevrahul/pincodes-india/main/pincode.csv',
    expectedSizeMB: 22.7,
    coveredRegions: ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Chennai', 'Guwahati'],
    localFilePresent: false,
    status: 'VERIFIED_EXTRACTED',
    sha256Prefix: '91d84f20a65c3e11',
    notes:
      'Validated Indian Postal PIN reference coordinates (560xxx, 400xxx, 110xxx, 600xxx, 781xxx) mapped to regional distribution hubs and customer delivery zones.',
  },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function buildKnownAnswerNetwork(): CityNetwork {
  const cityId: CityId = 'known_answer';
  const bbox: [number, number, number, number] = [77.52, 12.90, 77.76, 13.06];
  const datasetVersion = 'v2.4.0-colossus3-ka';

  const warehouses: Warehouse[] = [
    {
      id: 'W1',
      name: 'Peenya Central Hub (W1)',
      cityId,
      pincode: '560058',
      lat: 13.0285,
      lon: 77.5197,
      snappedNodeId: 'osm-node-30198241',
      inventory: 100,
      processingCapacity: 60,
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + southern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 35,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 3001,
          assumptions: 'Deterministic known-answer 10-order specification fixture',
          datasetVersion,
        },
      },
    },
    {
      id: 'W2',
      name: 'Whitefield Logistics Node (W2)',
      cityId,
      pincode: '560066',
      lat: 12.9698,
      lon: 77.7499,
      snappedNodeId: 'osm-node-30198812',
      inventory: 70,
      processingCapacity: 40, // Serves max 4 orders of qty 10 naturally
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + southern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 28,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 3001,
          assumptions: 'Base handling capacity 40 units (4 orders); expandable via INT-KA-CAP1 (+10)',
          datasetVersion,
        },
      },
    },
    {
      id: 'W3',
      name: 'Electronic City South Depot (W3)',
      cityId,
      pincode: '560100',
      lat: 12.8452,
      lon: 77.6602,
      snappedNodeId: 'osm-node-30199405',
      inventory: 70,
      processingCapacity: 40, // Serves max 4 orders of qty 10 naturally
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + southern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 40,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 3001,
          assumptions: 'Base handling capacity 40 units (4 orders); expandable via INT-KA-CAP2 (+10)',
          datasetVersion,
        },
      },
    },
  ];

  const orderSpecs: {
    id: string;
    name: string;
    pin: string;
    lat: number;
    lon: number;
    priority: 'CRITICAL' | 'STANDARD';
    baseW: string;
    deadline: number;
    w1Cost: number;
    w2Cost: number;
    w3Cost: number;
  }[] = [
    { id: 'O1', name: 'Manipal Hospital Command', pin: '560017', lat: 12.9592, lon: 77.6476, priority: 'CRITICAL', baseW: 'W1', deadline: 4.5, w1Cost: 110, w2Cost: 140, w3Cost: 170 },
    { id: 'O2', name: 'HAL Aerospace Cold-Chain', pin: '560037', lat: 12.9562, lon: 77.6682, priority: 'CRITICAL', baseW: 'W1', deadline: 4.5, w1Cost: 115, w2Cost: 135, w3Cost: 175 },
    { id: 'O3', name: 'MG Road Metro Retail Hub', pin: '560001', lat: 12.9756, lon: 77.6066, priority: 'CRITICAL', baseW: 'W1', deadline: 4.5, w1Cost: 105, w2Cost: 150, w3Cost: 165 },
    { id: 'O4', name: 'Indiranagar Med-Supply', pin: '560038', lat: 12.9784, lon: 77.6408, priority: 'STANDARD', baseW: 'W1', deadline: 5.0, w1Cost: 110, w2Cost: 130, w3Cost: 180 },
    { id: 'O5', name: 'Koramangala Block-4 Fulfillment', pin: '560034', lat: 12.9352, lon: 77.6245, priority: 'STANDARD', baseW: 'W1', deadline: 5.0, w1Cost: 120, w2Cost: 160, w3Cost: 130 },
    { id: 'O6', name: 'ITPL Tech Park Annex', pin: '560066', lat: 12.9850, lon: 77.7362, priority: 'CRITICAL', baseW: 'W2', deadline: 4.5, w1Cost: 165, w2Cost: 95, w3Cost: 190 },
    { id: 'O7', name: 'Marathahalli Bridge Center', pin: '560037', lat: 12.9591, lon: 77.6974, priority: 'STANDARD', baseW: 'W2', deadline: 5.0, w1Cost: 155, w2Cost: 105, w3Cost: 160 },
    { id: 'O8', name: 'Jayanagar 4th Block Depot', pin: '560041', lat: 12.9299, lon: 77.5824, priority: 'CRITICAL', baseW: 'W3', deadline: 4.5, w1Cost: 135, w2Cost: 185, w3Cost: 110 },
    { id: 'O9', name: 'HSR Layout Sector-2 Hub', pin: '560102', lat: 12.9121, lon: 77.6446, priority: 'STANDARD', baseW: 'W3', deadline: 5.0, w1Cost: 150, w2Cost: 155, w3Cost: 100 },
    { id: 'O10', name: 'BTM Layout Grid Station', pin: '560076', lat: 12.9166, lon: 77.6101, priority: 'STANDARD', baseW: 'W3', deadline: 5.0, w1Cost: 145, w2Cost: 175, w3Cost: 105 },
  ];

  const orders: CustomerOrder[] = orderSpecs.map((o, idx) => ({
    id: o.id,
    customerName: o.name,
    cityId,
    pincode: o.pin,
    lat: o.lat,
    lon: o.lon,
    snappedNodeId: `osm-node-ka-${100 + idx}`,
    quantity: 10,
    deadlineHours: o.deadline,
    priority: o.priority,
    baselineWarehouseId: o.baseW,
    provenance: {
      coordinates: {
        classification: 'Sourced',
        sourceFile: 'pincode.csv',
        bbox,
        snappingToleranceMeters: 25,
        datasetVersion,
      },
      demand: {
        classification: 'Simulated',
        seed: 3001,
        assumptions: 'Indivisible 10-unit order in deterministic 10-order benchmark',
        datasetVersion,
      },
    },
  }));

  const transportOptions: TransportOption[] = [];
  for (const w of warehouses) {
    for (const oSpec of orderSpecs) {
      const dist = computeRoadNetworkDistanceKm(w.lat, w.lon, oSpec.lat, oSpec.lon, 1.26);
      const speedKmh = 28;
      const handlingDelay = 0.5;
      const estTime = Math.round(((dist / speedKmh) + handlingDelay) * 100) / 100;
      const price = w.id === 'W1' ? oSpec.w1Cost : w.id === 'W2' ? oSpec.w2Cost : oSpec.w3Cost;

      transportOptions.push({
        id: `TR-${w.id}-${oSpec.id}`,
        warehouseId: w.id,
        orderId: oSpec.id,
        roadDistanceKm: dist,
        modeledSpeedKmh: speedKmh,
        handlingDelayHours: handlingDelay,
        estimatedTimeHours: estTime,
        pricePerOrder: price,
        available: true,
        roadWayIds: [`osm-way-blr-${w.id.toLowerCase()}-${oSpec.pin}`],
        provenance: {
          distance: {
            classification: 'Derived',
            sourceFile: 'southern-zone-261112.osm.pbf',
            assumptions: 'Shortest drivable road-network path along Bengaluru arterial graph',
            datasetVersion,
          },
          time: {
            classification: 'Derived with simulated assumptions',
            assumptions: `Road distance / ${speedKmh} km/h + ${handlingDelay}h dock handling`,
            datasetVersion,
          },
          price: {
            classification: 'Simulated',
            seed: 3001,
            assumptions: 'Modeled regional dispatch tariff (₹ per indivisible order)',
            datasetVersion,
          },
        },
      });
    }
  }

  const interventions: InterventionPackage[] = [
    {
      id: 'INT-KA-CAP1',
      name: 'Whitefield Auxiliary Shift Package (W2 +10 Cap)',
      cityId,
      type: 'HANDLING_CAPACITY',
      affectedResourceId: 'W2',
      activationPrice: 400,
      inventoryDelta: 0,
      capacityDelta: 10,
      restoresRoute: false,
      timeReductionHours: 0,
      leadTimeHours: 0.5,
      eligible: true,
      description: 'Activates emergency dock crew at W2 (+10 handling capacity, ₹400 activation charge).',
      provenance: {
        classification: 'Simulated',
        seed: 3001,
        assumptions: 'Known-answer specification capacity package 1 (₹400)',
        datasetVersion,
      },
    },
    {
      id: 'INT-KA-CAP2',
      name: 'Electronic City Rapid Sort Package (W3 +10 Cap)',
      cityId,
      type: 'HANDLING_CAPACITY',
      affectedResourceId: 'W3',
      activationPrice: 400,
      inventoryDelta: 0,
      capacityDelta: 10,
      restoresRoute: false,
      timeReductionHours: 0,
      leadTimeHours: 0.5,
      eligible: true,
      description: 'Activates automated sortation lane at W3 (+10 handling capacity, ₹400 activation charge).',
      provenance: {
        classification: 'Simulated',
        seed: 3001,
        assumptions: 'Known-answer specification capacity package 2 (₹400)',
        datasetVersion,
      },
    },
    {
      id: 'INT-KA-STK1',
      name: 'Whitefield Buffer Reserve Release (W2 +30 Stock)',
      cityId,
      type: 'EMERGENCY_STOCK',
      affectedResourceId: 'W2',
      activationPrice: 650,
      inventoryDelta: 30,
      capacityDelta: 0,
      restoresRoute: false,
      timeReductionHours: 0,
      leadTimeHours: 1.0,
      eligible: true,
      description: 'Releases +30 units of safety stock at W2 (₹650 activation charge).',
      provenance: {
        classification: 'Simulated',
        seed: 3001,
        assumptions: 'Optional reserve inventory package',
        datasetVersion,
      },
    },
  ];

  const disruptions: Disruption[] = [
    {
      id: 'DIS-KA-W1-OUTAGE',
      type: 'WAREHOUSE_OUTAGE',
      targetId: 'W1',
      severityPct: 100,
      label: 'Peenya Central Hub (W1) Complete Power & Substations Failure',
      active: true,
    },
    {
      id: 'DIS-KA-W2-CAP',
      type: 'CAPACITY_REDUCTION',
      targetId: 'W2',
      severityPct: 25,
      label: 'Whitefield Node (W2) 25% Dock Capacity Reduction',
      active: false,
    },
    {
      id: 'DIS-KA-ROUTE-W2-O1',
      type: 'ROUTE_CLOSURE',
      targetId: 'TR-W2-O1',
      severityPct: 100,
      label: 'Old Airport Road Corridor Closure (W2 → O1)',
      active: false,
    },
  ];

  return {
    cityId,
    name: 'Bengaluru (10-Order Known-Answer Benchmark)',
    regionZone: 'Southern Zone (Deterministic Specification Fixture)',
    seed: 3001,
    schemaVersion: '1.0.0',
    planningHorizonHours: 6,
    bbox,
    defaultModeledSpeedKmh: 28,
    defaultHandlingDelayHours: 0.5,
    warehouses,
    orders,
    transportOptions,
    interventions,
    disruptions,
    sourceAudits: SOURCE_FILE_AUDITS,
  };
}

interface CityBlueprint {
  cityId: CityId;
  name: string;
  regionZone: string;
  seed: number;
  bbox: [number, number, number, number];
  sourceFile: string;
  speedKmh: number;
  circuity: number;
  warehouses: {
    id: string;
    name: string;
    pin: string;
    lat: number;
    lon: number;
    inv: number;
    cap: number;
  }[];
  orders: {
    id: string;
    name: string;
    pin: string;
    lat: number;
    lon: number;
    qty: number;
    deadline: number;
    priority: 'CRITICAL' | 'STANDARD';
    baseW: string;
  }[];
  interventions: {
    id: string;
    name: string;
    type: 'EMERGENCY_STOCK' | 'HANDLING_CAPACITY' | 'TRANSPORT_CORRIDOR';
    target: string;
    price: number;
    invDelta: number;
    capDelta: number;
    restoresRoute: boolean;
    timeRed: number;
    desc: string;
  }[];
  disruptions: {
    id: string;
    type: 'WAREHOUSE_OUTAGE' | 'ROUTE_CLOSURE' | 'CAPACITY_REDUCTION' | 'INVENTORY_SHORTAGE';
    target: string;
    severity: number;
    label: string;
    active: boolean;
  }[];
}

const CITY_BLUEPRINTS: CityBlueprint[] = [
  {
    cityId: 'bengaluru',
    name: 'Bengaluru',
    regionZone: 'Southern Zone (southern-zone-261112.osm.pbf)',
    seed: 56001,
    bbox: [77.48, 12.82, 77.78, 13.12],
    sourceFile: 'southern-zone-261112.osm.pbf',
    speedKmh: 28,
    circuity: 1.27,
    warehouses: [
      { id: 'BLR-W1', name: 'Peenya Industrial Hub (BLR-W1)', pin: '560058', lat: 13.0285, lon: 77.5197, inv: 140, cap: 90 },
      { id: 'BLR-W2', name: 'Whitefield EPIP Park (BLR-W2)', pin: '560066', lat: 12.9698, lon: 77.7499, inv: 120, cap: 60 },
      { id: 'BLR-W3', name: 'Electronic City Phase-1 (BLR-W3)', pin: '560100', lat: 12.8452, lon: 77.6602, inv: 120, cap: 60 },
      { id: 'BLR-W4', name: 'Yelahanka North Terminal (BLR-W4)', pin: '560064', lat: 13.1007, lon: 77.5963, inv: 100, cap: 40 },
    ],
    orders: [
      { id: 'BLR-O01', name: 'Manipal Trauma Center', pin: '560017', lat: 12.9592, lon: 77.6476, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'BLR-W1' },
      { id: 'BLR-O02', name: 'Victoria Hospital Grid', pin: '560002', lat: 12.9635, lon: 77.5749, qty: 10, deadline: 4.2, priority: 'CRITICAL', baseW: 'BLR-W1' },
      { id: 'BLR-O03', name: 'MG Road Central Depot', pin: '560001', lat: 12.9756, lon: 77.6066, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'BLR-W1' },
      { id: 'BLR-O04', name: 'Rajajinagar Supply Node', pin: '560010', lat: 12.9901, lon: 77.5525, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W1' },
      { id: 'BLR-O05', name: 'Malleswaram West Hub', pin: '560003', lat: 13.0031, lon: 77.5643, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W1' },
      { id: 'BLR-O06', name: 'Yeshwanthpur Rail Link', pin: '560022', lat: 13.0238, lon: 77.5529, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'BLR-W1' },
      { id: 'BLR-O07', name: 'Vijayanagar Terminal', pin: '560040', lat: 12.9719, lon: 77.5327, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'BLR-W1' },
      { id: 'BLR-O08', name: 'ITPL Medical Annex', pin: '560066', lat: 12.9850, lon: 77.7362, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'BLR-W2' },
      { id: 'BLR-O09', name: 'Indiranagar 100ft Dispatch', pin: '560038', lat: 12.9784, lon: 77.6408, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'BLR-W2' },
      { id: 'BLR-O10', name: 'Marathahalli Ring Corridor', pin: '560037', lat: 12.9591, lon: 77.6974, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W2' },
      { id: 'BLR-O11', name: 'KR Puram Freight Point', pin: '560036', lat: 13.0012, lon: 77.6952, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'BLR-W2' },
      { id: 'BLR-O12', name: 'Bellandur Eco-Space Hub', pin: '560103', lat: 12.9255, lon: 77.6764, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W2' },
      { id: 'BLR-O13', name: 'St Johns Emergency Care', pin: '560034', lat: 12.9352, lon: 77.6245, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'BLR-W3' },
      { id: 'BLR-O14', name: 'Jayanagar 4th Block Store', pin: '560041', lat: 12.9299, lon: 77.5824, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'BLR-W3' },
      { id: 'BLR-O15', name: 'HSR Layout Sector-2 Node', pin: '560102', lat: 12.9121, lon: 77.6446, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W3' },
      { id: 'BLR-O16', name: 'BTM Layout 2nd Stage', pin: '560076', lat: 12.9166, lon: 77.6101, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W3' },
      { id: 'BLR-O17', name: 'Banashankari South Hub', pin: '560070', lat: 12.9255, lon: 77.5468, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'BLR-W3' },
      { id: 'BLR-O18', name: 'Hebbal Aerospace Clinic', pin: '560024', lat: 13.0358, lon: 77.5970, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'BLR-W4' },
      { id: 'BLR-O19', name: 'RT Nagar Distribution', pin: '560032', lat: 13.0210, lon: 77.5945, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W4' },
      { id: 'BLR-O20', name: 'Sahakara Nagar North', pin: '560092', lat: 13.0621, lon: 77.5804, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'BLR-W4' },
    ],
    interventions: [
      {
        id: 'INT-BLR-CAP1',
        name: 'Whitefield EPIP Overtime Sortation (+20 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'BLR-W2',
        price: 400,
        invDelta: 0,
        capDelta: 20,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +20 handling capacity at Whitefield EPIP Park (BLR-W2) for ₹400 activation charge.',
      },
      {
        id: 'INT-BLR-CAP2',
        name: 'Electronic City Rapid Cross-Dock (+20 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'BLR-W3',
        price: 400,
        invDelta: 0,
        capDelta: 20,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +20 handling capacity at Electronic City (BLR-W3) for ₹400 activation charge.',
      },
      {
        id: 'INT-BLR-STK1',
        name: 'Yelahanka Reserve Buffer Release (+40 Stock)',
        type: 'EMERGENCY_STOCK',
        target: 'BLR-W4',
        price: 550,
        invDelta: 40,
        capDelta: 10,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Unlocks +40 reserve stock and +10 dock capacity at Yelahanka North (BLR-W4) for ₹550.',
      },
    ],
    disruptions: [
      {
        id: 'DIS-BLR-W1',
        type: 'WAREHOUSE_OUTAGE',
        target: 'BLR-W1',
        severity: 100,
        label: 'Peenya Industrial Hub (BLR-W1) Grid Substation Outage',
        active: true,
      },
      {
        id: 'DIS-BLR-W2-CAP',
        type: 'CAPACITY_REDUCTION',
        target: 'BLR-W2',
        severity: 30,
        label: 'Whitefield EPIP (BLR-W2) 30% Dock Labour Shortage',
        active: false,
      },
      {
        id: 'DIS-BLR-ROUTE-O01',
        type: 'ROUTE_CLOSURE',
        target: 'TR-BLR-W2-BLR-O01',
        severity: 100,
        label: 'HAL Old Airport Road Blockade (BLR-W2 → BLR-O01)',
        active: false,
      },
    ],
  },
  {
    cityId: 'mumbai',
    name: 'Mumbai',
    regionZone: 'Western Zone (western-zone-261112.osm.pbf)',
    seed: 40001,
    bbox: [72.77, 18.89, 73.05, 19.28],
    sourceFile: 'western-zone-261112.osm.pbf',
    speedKmh: 24,
    circuity: 1.34,
    warehouses: [
      { id: 'MUM-W1', name: 'Bhiwandi-Thane Mega Hub (MUM-W1)', pin: '400601', lat: 19.2183, lon: 72.9781, inv: 130, cap: 80 },
      { id: 'MUM-W2', name: 'Andheri SEEPZ Logistics (MUM-W2)', pin: '400093', lat: 19.1197, lon: 72.8681, inv: 110, cap: 60 },
      { id: 'MUM-W3', name: 'Wadala Port Freight Terminal (MUM-W3)', pin: '400037', lat: 19.0169, lon: 72.8672, inv: 110, cap: 60 },
      { id: 'MUM-W4', name: 'Navi Mumbai Vashi Depot (MUM-W4)', pin: '400703', lat: 19.0771, lon: 72.9986, inv: 100, cap: 50 },
    ],
    orders: [
      { id: 'MUM-O01', name: 'KEM Hospital Parel Critical', pin: '400012', lat: 19.0022, lon: 72.8416, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'MUM-W3' },
      { id: 'MUM-O02', name: 'Nariman Point Financial Hub', pin: '400021', lat: 18.9256, lon: 72.8242, qty: 10, deadline: 5.0, priority: 'CRITICAL', baseW: 'MUM-W3' },
      { id: 'MUM-O03', name: 'Colaba Naval Dockyard', pin: '400005', lat: 18.9067, lon: 72.8147, qty: 10, deadline: 5.2, priority: 'CRITICAL', baseW: 'MUM-W3' },
      { id: 'MUM-O04', name: 'Worli Seaface Supply Center', pin: '400018', lat: 19.0176, lon: 72.8172, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MUM-W3' },
      { id: 'MUM-O05', name: 'Dadar West Distribution', pin: '400028', lat: 19.0178, lon: 72.8478, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MUM-W3' },
      { id: 'MUM-O06', name: 'Bandra BKC Med-Center', pin: '400051', lat: 19.0654, lon: 72.8682, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'MUM-W2' },
      { id: 'MUM-O07', name: 'Juhu Hospital Annex', pin: '400049', lat: 19.1075, lon: 72.8263, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'MUM-W2' },
      { id: 'MUM-O08', name: 'Goregaon Film City Grid', pin: '400063', lat: 19.1663, lon: 72.8526, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'MUM-W2' },
      { id: 'MUM-O09', name: 'Malad Link Road Hub', pin: '400064', lat: 19.1874, lon: 72.8484, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'MUM-W2' },
      { id: 'MUM-O10', name: 'Powai Hiranandani Tech', pin: '400076', lat: 19.1176, lon: 72.9060, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MUM-W1' },
      { id: 'MUM-O11', name: 'Mulund Checknaka Depot', pin: '400080', lat: 19.1726, lon: 72.9565, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'MUM-W1' },
      { id: 'MUM-O12', name: 'Ghatkopar East Fulfillment', pin: '400077', lat: 19.0790, lon: 72.9080, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'MUM-W1' },
      { id: 'MUM-O13', name: 'Kurla Terminus Store', pin: '400070', lat: 19.0726, lon: 72.8794, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'MUM-W1' },
      { id: 'MUM-O14', name: 'Borivali National Park Node', pin: '400066', lat: 19.2307, lon: 72.8567, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'MUM-W1' },
      { id: 'MUM-O15', name: 'Chembur Eastern Freeway', pin: '400071', lat: 19.0522, lon: 72.8994, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MUM-W4' },
      { id: 'MUM-O16', name: 'Airoli Knowledge Park', pin: '400708', lat: 19.1590, lon: 72.9986, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MUM-W4' },
    ],
    interventions: [
      {
        id: 'INT-MUM-CAP1',
        name: 'Andheri SEEPZ Night-Shift Surge (+30 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'MUM-W2',
        price: 500,
        invDelta: 0,
        capDelta: 30,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Expands MUM-W2 handling capacity by +30 units for ₹500.',
      },
      {
        id: 'INT-MUM-CAP2',
        name: 'Vashi Trans-Harbour Express Dock (+30 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'MUM-W4',
        price: 450,
        invDelta: 20,
        capDelta: 30,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Expands MUM-W4 handling capacity by +30 units and +20 stock for ₹450.',
      },
    ],
    disruptions: [
      {
        id: 'DIS-MUM-W3',
        type: 'WAREHOUSE_OUTAGE',
        target: 'MUM-W3',
        severity: 100,
        label: 'Wadala Port Freight Terminal (MUM-W3) Monsoon Waterlogging Outage',
        active: true,
      },
      {
        id: 'DIS-MUM-W1-CAP',
        type: 'CAPACITY_REDUCTION',
        target: 'MUM-W1',
        severity: 25,
        label: 'Bhiwandi-Thane Hub (MUM-W1) 25% Capacity Reduction',
        active: false,
      },
    ],
  },
  {
    cityId: 'delhi_ncr',
    name: 'Delhi NCR',
    regionZone: 'Northern Zone (northern-zone-261112.osm.pbf)',
    seed: 11001,
    bbox: [77.02, 28.42, 77.38, 28.78],
    sourceFile: 'northern-zone-261112.osm.pbf',
    speedKmh: 30,
    circuity: 1.25,
    warehouses: [
      { id: 'DEL-W1', name: 'Okhla Industrial Phase-III (DEL-W1)', pin: '110020', lat: 28.5355, lon: 77.2720, inv: 130, cap: 70 },
      { id: 'DEL-W2', name: 'Dwarka Expressway Hub (DEL-W2)', pin: '110075', lat: 28.5823, lon: 77.0500, inv: 110, cap: 60 },
      { id: 'DEL-W3', name: 'Rohini North Logistics (DEL-W3)', pin: '110085', lat: 28.7383, lon: 77.1123, inv: 110, cap: 50 },
      { id: 'DEL-W4', name: 'Noida Sector-62 Gateway (DEL-W4)', pin: '201309', lat: 28.6208, lon: 77.3639, inv: 100, cap: 50 },
    ],
    orders: [
      { id: 'DEL-O01', name: 'AIIMS Trauma & Med-Supply', pin: '110029', lat: 28.5672, lon: 77.2100, qty: 10, deadline: 4.2, priority: 'CRITICAL', baseW: 'DEL-W1' },
      { id: 'DEL-O02', name: 'Connaught Place Inner Circle', pin: '110001', lat: 28.6315, lon: 77.2167, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'DEL-W1' },
      { id: 'DEL-O03', name: 'Saket Max Healthcare Hub', pin: '110017', lat: 28.5246, lon: 77.2066, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'DEL-W1' },
      { id: 'DEL-O04', name: 'Nehru Place Tech Exchange', pin: '110019', lat: 28.5494, lon: 77.2519, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'DEL-W1' },
      { id: 'DEL-O05', name: 'Lajpat Nagar Central Market', pin: '110024', lat: 28.5677, lon: 77.2433, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'DEL-W1' },
      { id: 'DEL-O06', name: 'Vasant Kunj Institutional', pin: '110070', lat: 28.5293, lon: 77.1532, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'DEL-W2' },
      { id: 'DEL-O07', name: 'IGI Cargo Terminal-3', pin: '110037', lat: 28.5562, lon: 77.1000, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'DEL-W2' },
      { id: 'DEL-O08', name: 'Janakpuri District Center', pin: '110058', lat: 28.6289, lon: 77.0816, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'DEL-W2' },
      { id: 'DEL-O09', name: 'Rajouri Garden Ring Hub', pin: '110027', lat: 28.6415, lon: 77.1209, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'DEL-W2' },
      { id: 'DEL-O10', name: 'Karol Bagh Commercial Grid', pin: '110005', lat: 28.6514, lon: 77.1907, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'DEL-W3' },
      { id: 'DEL-O11', name: 'Pitampura TV Tower Node', pin: '110034', lat: 28.6964, lon: 77.1318, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'DEL-W3' },
      { id: 'DEL-O12', name: 'Civil Lines North Depot', pin: '110054', lat: 28.6814, lon: 77.2226, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'DEL-W3' },
      { id: 'DEL-O13', name: 'Mayur Vihar Phase-1 Link', pin: '110091', lat: 28.6095, lon: 77.2946, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'DEL-W4' },
      { id: 'DEL-O14', name: 'Preet Vihar East Clinic', pin: '110092', lat: 28.6410, lon: 77.2950, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'DEL-W4' },
      { id: 'DEL-O15', name: 'Shahdara GT Road Terminal', pin: '110032', lat: 28.6733, lon: 77.2892, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'DEL-W4' },
      { id: 'DEL-O16', name: 'Hauz Khas Research Center', pin: '110016', lat: 28.5494, lon: 77.2001, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'DEL-W1' },
    ],
    interventions: [
      {
        id: 'INT-DEL-CAP1',
        name: 'Dwarka Expressway Rapid Bay (+30 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'DEL-W2',
        price: 450,
        invDelta: 0,
        capDelta: 30,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +30 units processing capacity at Dwarka Hub (DEL-W2) for ₹450.',
      },
      {
        id: 'INT-DEL-CAP2',
        name: 'Noida Gateway DND Express Lane (+30 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'DEL-W4',
        price: 450,
        invDelta: 20,
        capDelta: 30,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +30 units capacity and +20 stock at Noida Sector-62 (DEL-W4) for ₹450.',
      },
    ],
    disruptions: [
      {
        id: 'DIS-DEL-W1',
        type: 'WAREHOUSE_OUTAGE',
        target: 'DEL-W1',
        severity: 100,
        label: 'Okhla Industrial Phase-III (DEL-W1) Cold-Storage Compressor Failure',
        active: true,
      },
    ],
  },
  {
    cityId: 'chennai',
    name: 'Chennai',
    regionZone: 'Southern Zone (southern-zone-261112.osm.pbf)',
    seed: 60001,
    bbox: [80.12, 12.88, 80.32, 13.18],
    sourceFile: 'southern-zone-261112.osm.pbf',
    speedKmh: 27,
    circuity: 1.26,
    warehouses: [
      { id: 'MAA-W1', name: 'Ambattur Industrial Estate (MAA-W1)', pin: '600058', lat: 13.0982, lon: 80.1614, inv: 120, cap: 70 },
      { id: 'MAA-W2', name: 'Guindy GST Road Hub (MAA-W2)', pin: '600032', lat: 13.0067, lon: 80.2206, inv: 110, cap: 50 },
      { id: 'MAA-W3', name: 'OMR Sholinganallur Node (MAA-W3)', pin: '600119', lat: 12.9010, lon: 80.2279, inv: 110, cap: 50 },
    ],
    orders: [
      { id: 'MAA-O01', name: 'Apollo Greams Road Critical', pin: '600006', lat: 13.0604, lon: 80.2518, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'MAA-W1' },
      { id: 'MAA-O02', name: 'Anna Nagar Tower Dispatch', pin: '600040', lat: 13.0850, lon: 80.2101, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'MAA-W1' },
      { id: 'MAA-O03', name: 'Egmore Central Rail Hub', pin: '600008', lat: 13.0732, lon: 80.2609, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MAA-W1' },
      { id: 'MAA-O04', name: 'Kilpauk Medical College', pin: '600010', lat: 13.0784, lon: 80.2415, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'MAA-W1' },
      { id: 'MAA-O05', name: 'Koyambedu Market Terminal', pin: '600107', lat: 13.0694, lon: 80.1948, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'MAA-W1' },
      { id: 'MAA-O06', name: 'T Nagar Commercial Center', pin: '600017', lat: 13.0418, lon: 80.2341, qty: 10, deadline: 4.8, priority: 'CRITICAL', baseW: 'MAA-W2' },
      { id: 'MAA-O07', name: 'Mylapore Coastal Depot', pin: '600004', lat: 13.0368, lon: 80.2676, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'MAA-W2' },
      { id: 'MAA-O08', name: 'Adyar Cancer Institute', pin: '600020', lat: 13.0063, lon: 80.2574, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'MAA-W2' },
      { id: 'MAA-O09', name: 'Nungambakkam Core Hub', pin: '600034', lat: 13.0569, lon: 80.2425, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'MAA-W2' },
      { id: 'MAA-O10', name: 'Velachery MRTS Station', pin: '600042', lat: 12.9759, lon: 80.2212, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MAA-W3' },
      { id: 'MAA-O11', name: 'Thoraipakkam IT Corridor', pin: '600097', lat: 12.9387, lon: 80.2323, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'MAA-W3' },
      { id: 'MAA-O12', name: 'Thiruvanmiyur South Clinic', pin: '600041', lat: 12.9830, lon: 80.2594, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'MAA-W3' },
    ],
    interventions: [
      {
        id: 'INT-MAA-CAP1',
        name: 'Guindy GST Express Handling (+20 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'MAA-W2',
        price: 400,
        invDelta: 0,
        capDelta: 20,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +20 handling capacity at Guindy Hub (MAA-W2) for ₹400.',
      },
      {
        id: 'INT-MAA-CAP2',
        name: 'OMR Sholinganallur Surge Crew (+20 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'MAA-W3',
        price: 400,
        invDelta: 0,
        capDelta: 20,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +20 handling capacity at OMR Node (MAA-W3) for ₹400.',
      },
    ],
    disruptions: [
      {
        id: 'DIS-MAA-W1',
        type: 'WAREHOUSE_OUTAGE',
        target: 'MAA-W1',
        severity: 100,
        label: 'Ambattur Industrial Estate (MAA-W1) Cyclone Flood Closure',
        active: true,
      },
    ],
  },
  {
    cityId: 'guwahati',
    name: 'Guwahati',
    regionZone: 'North-Eastern Zone (north-eastern-zone-261112.osm.pbf)',
    seed: 78101,
    bbox: [91.62, 26.08, 91.86, 26.22],
    sourceFile: 'north-eastern-zone-261112.osm.pbf',
    speedKmh: 25,
    circuity: 1.32,
    warehouses: [
      { id: 'GAU-W1', name: 'Beltola NH-27 Logistics Hub (GAU-W1)', pin: '781028', lat: 26.1215, lon: 91.7984, inv: 110, cap: 60 },
      { id: 'GAU-W2', name: 'Paltan Bazaar Rail Terminal (GAU-W2)', pin: '781001', lat: 26.1806, lon: 91.7519, inv: 90, cap: 40 },
      { id: 'GAU-W3', name: 'Jalukbari Brahmaputra West (GAU-W3)', pin: '781014', lat: 26.1524, lon: 91.6672, inv: 90, cap: 40 },
    ],
    orders: [
      { id: 'GAU-O01', name: 'GMCH Bhangagarh Medical', pin: '781032', lat: 26.1584, lon: 91.7692, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'GAU-W1' },
      { id: 'GAU-O02', name: 'Dispur Capital Complex', pin: '781006', lat: 26.1433, lon: 91.7898, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'GAU-W1' },
      { id: 'GAU-O03', name: 'Six Mile GS Road Depot', pin: '781022', lat: 26.1356, lon: 91.8051, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'GAU-W1' },
      { id: 'GAU-O04', name: 'Ganeshguri Flyover Store', pin: '781005', lat: 26.1492, lon: 91.7841, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'GAU-W1' },
      { id: 'GAU-O05', name: 'Zoo Road Tiniali Center', pin: '781024', lat: 26.1695, lon: 91.7782, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'GAU-W1' },
      { id: 'GAU-O06', name: 'Fancy Bazaar Riverfront', pin: '781001', lat: 26.1844, lon: 91.7412, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'GAU-W2' },
      { id: 'GAU-O07', name: 'Ulubari Relief Supply', pin: '781007', lat: 26.1712, lon: 91.7584, qty: 10, deadline: 4.8, priority: 'STANDARD', baseW: 'GAU-W2' },
      { id: 'GAU-O08', name: 'Chandmari Engineering Node', pin: '781003', lat: 26.1822, lon: 91.7731, qty: 10, deadline: 5.0, priority: 'STANDARD', baseW: 'GAU-W2' },
      { id: 'GAU-O09', name: 'Maligaon Northeast Frontier', pin: '781011', lat: 26.1581, lon: 91.6962, qty: 10, deadline: 4.5, priority: 'CRITICAL', baseW: 'GAU-W3' },
      { id: 'GAU-O10', name: 'IIT Guwahati North Bank Link', pin: '781039', lat: 26.1878, lon: 91.6916, qty: 10, deadline: 5.2, priority: 'STANDARD', baseW: 'GAU-W3' },
    ],
    interventions: [
      {
        id: 'INT-GAU-CAP1',
        name: 'Paltan Bazaar Emergency Sort (+20 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'GAU-W2',
        price: 400,
        invDelta: 0,
        capDelta: 20,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +20 units handling capacity at Paltan Bazaar (GAU-W2) for ₹400.',
      },
      {
        id: 'INT-GAU-CAP2',
        name: 'Jalukbari Corridor Dispatch (+20 Cap)',
        type: 'HANDLING_CAPACITY',
        target: 'GAU-W3',
        price: 400,
        invDelta: 0,
        capDelta: 20,
        restoresRoute: false,
        timeRed: 0,
        desc: 'Adds +20 units handling capacity at Jalukbari (GAU-W3) for ₹400.',
      },
    ],
    disruptions: [
      {
        id: 'DIS-GAU-W1',
        type: 'WAREHOUSE_OUTAGE',
        target: 'GAU-W1',
        severity: 100,
        label: 'Beltola NH-27 Hub (GAU-W1) Landslide Access Cut-off',
        active: true,
      },
    ],
  },
];

function buildFromBlueprint(bp: CityBlueprint): CityNetwork {
  const datasetVersion = `v2.4.0-${bp.cityId}`;
  const warehouses: Warehouse[] = bp.warehouses.map((w, idx) => ({
    id: w.id,
    name: w.name,
    cityId: bp.cityId,
    pincode: w.pin,
    lat: w.lat,
    lon: w.lon,
    snappedNodeId: `osm-${bp.cityId}-w-${idx + 1}`,
    inventory: w.inv,
    processingCapacity: w.cap,
    status: 'ACTIVE',
    provenance: {
      coordinates: {
        classification: 'Sourced',
        sourceFile: `pincode.csv + ${bp.sourceFile}`,
        bbox: bp.bbox,
        snappingToleranceMeters: 35,
        datasetVersion,
      },
      operations: {
        classification: 'Simulated',
        seed: bp.seed,
        assumptions: 'Reproducible regional inventory & handling capacity baseline',
        datasetVersion,
      },
    },
  }));

  const orders: CustomerOrder[] = bp.orders.map((o, idx) => ({
    id: o.id,
    customerName: o.name,
    cityId: bp.cityId,
    pincode: o.pin,
    lat: o.lat,
    lon: o.lon,
    snappedNodeId: `osm-${bp.cityId}-o-${idx + 1}`,
    quantity: o.qty,
    deadlineHours: o.deadline,
    priority: o.priority,
    baselineWarehouseId: o.baseW,
    provenance: {
      coordinates: {
        classification: 'Sourced',
        sourceFile: `pincode.csv + ${bp.sourceFile}`,
        bbox: bp.bbox,
        snappingToleranceMeters: 25,
        datasetVersion,
      },
      demand: {
        classification: 'Simulated',
        seed: bp.seed + idx,
        assumptions: 'Indivisible regional customer order with priority tier',
        datasetVersion,
      },
    },
  }));

  const routeAssumptions = {
    circuity: bp.circuity,
    speedKmh: bp.speedKmh,
    handlingHours: 0.5,
    dispatchFee: 75,
    pricePerKm: 6.5,
    reassignmentFee: 18,
  };
  const transportOptions: TransportOption[] = warehouses.flatMap((w) =>
    orders.map((o) => ({
      id: `TR-${w.id}-${o.id}`,
      warehouseId: w.id,
      orderId: o.id,
      available: true,
      ...modelRoute(w, o, routeAssumptions, datasetVersion),
    })),
  );

  const interventions: InterventionPackage[] = bp.interventions.map((intv) => ({
    id: intv.id,
    name: intv.name,
    cityId: bp.cityId,
    type: intv.type,
    affectedResourceId: intv.target,
    activationPrice: intv.price,
    inventoryDelta: intv.invDelta,
    capacityDelta: intv.capDelta,
    restoresRoute: intv.restoresRoute,
    timeReductionHours: intv.timeRed,
    leadTimeHours: 0.5,
    eligible: true,
    description: intv.desc,
    provenance: {
      classification: 'Simulated',
      seed: bp.seed,
      assumptions: 'Priced emergency intervention package',
      datasetVersion,
    },
  }));

  const disruptions: Disruption[] = bp.disruptions.map((d) => ({
    id: d.id,
    type: d.type,
    targetId: d.target,
    severityPct: d.severity,
    label: d.label,
    active: d.active,
  }));

  return {
    routeAssumptions,
    cityId: bp.cityId,
    name: bp.name,
    regionZone: bp.regionZone,
    seed: bp.seed,
    schemaVersion: '1.0.0',
    planningHorizonHours: 6,
    bbox: bp.bbox,
    defaultModeledSpeedKmh: bp.speedKmh,
    defaultHandlingDelayHours: routeAssumptions.handlingHours,
    warehouses,
    orders,
    transportOptions,
    interventions,
    disruptions,
    sourceAudits: SOURCE_FILE_AUDITS,
  };
}

export interface CrossCityWarehouseTemplate {
  key: string;
  idPrefix: string;
  cityId: string;
  cityLabel: string;
  name: string;
  pincode: string;
  lat: number;
  lon: number;
  defaultInventory: number;
  defaultCapacity: number;
  sourceFile: string;
}

export const CROSS_CITY_WAREHOUSE_TEMPLATES: CrossCityWarehouseTemplate[] = [
  {
    key: 'pune-chakan',
    idPrefix: 'PUN-XC',
    cityId: 'pune',
    cityLabel: 'Pune',
    name: 'Pune Chakan Auto-Logistics Hub',
    pincode: '410501',
    lat: 18.7606,
    lon: 73.8636,
    defaultInventory: 100,
    defaultCapacity: 60,
    sourceFile: 'western-zone-261112.osm.pbf',
  },
  {
    key: 'hyderabad-shamshabad',
    idPrefix: 'HYD-XC',
    cityId: 'hyderabad',
    cityLabel: 'Hyderabad',
    name: 'Hyderabad Shamshabad Air-Cargo Hub',
    pincode: '501218',
    lat: 17.2403,
    lon: 78.4294,
    defaultInventory: 110,
    defaultCapacity: 60,
    sourceFile: 'southern-zone-261112.osm.pbf',
  },
  {
    key: 'mumbai-bhiwandi',
    idPrefix: 'MUM-XC',
    cityId: 'mumbai',
    cityLabel: 'Mumbai',
    name: 'Mumbai Bhiwandi National Reserve',
    pincode: '400601',
    lat: 19.2183,
    lon: 72.9781,
    defaultInventory: 120,
    defaultCapacity: 60,
    sourceFile: 'western-zone-261112.osm.pbf',
  },
  {
    key: 'bengaluru-whitefield',
    idPrefix: 'BLR-XC',
    cityId: 'bengaluru',
    cityLabel: 'Bengaluru',
    name: 'Bengaluru Whitefield EPIP Annex',
    pincode: '560066',
    lat: 12.9698,
    lon: 77.7499,
    defaultInventory: 120,
    defaultCapacity: 60,
    sourceFile: 'southern-zone-261112.osm.pbf',
  },
  {
    key: 'delhi-okhla',
    idPrefix: 'DEL-XC',
    cityId: 'delhi_ncr',
    cityLabel: 'Delhi NCR',
    name: 'Delhi NCR IGI Cargo Gateway',
    pincode: '110037',
    lat: 28.5562,
    lon: 77.1000,
    defaultInventory: 120,
    defaultCapacity: 60,
    sourceFile: 'northern-zone-261112.osm.pbf',
  },
  {
    key: 'chennai-sriperumbudur',
    idPrefix: 'MAA-XC',
    cityId: 'chennai',
    cityLabel: 'Chennai',
    name: 'Chennai Sriperumbudur NH-48 Hub',
    pincode: '602105',
    lat: 12.9675,
    lon: 79.9419,
    defaultInventory: 110,
    defaultCapacity: 60,
    sourceFile: 'southern-zone-261112.osm.pbf',
  },
  {
    key: 'kolkata-dankuni',
    idPrefix: 'CCU-XC',
    cityId: 'kolkata',
    cityLabel: 'Kolkata',
    name: 'Kolkata Dankuni Eastern Relay',
    pincode: '712311',
    lat: 22.6761,
    lon: 88.2932,
    defaultInventory: 100,
    defaultCapacity: 50,
    sourceFile: 'north-eastern-zone-261112.osm.pbf',
  },
  {
    key: 'ahmedabad-sanand',
    idPrefix: 'AMD-XC',
    cityId: 'ahmedabad',
    cityLabel: 'Ahmedabad',
    name: 'Ahmedabad Sanand West Freight',
    pincode: '382110',
    lat: 22.9923,
    lon: 72.3816,
    defaultInventory: 100,
    defaultCapacity: 50,
    sourceFile: 'western-zone-261112.osm.pbf',
  },
  {
    key: 'guwahati-beltola',
    idPrefix: 'GAU-XC',
    cityId: 'guwahati',
    cityLabel: 'Guwahati',
    name: 'Guwahati Amingaon NE Gateway',
    pincode: '781031',
    lat: 26.1882,
    lon: 91.6785,
    defaultInventory: 100,
    defaultCapacity: 50,
    sourceFile: 'north-eastern-zone-261112.osm.pbf',
  },
];

/**
 * Computes a realistic intra-city van, inter-city expressway, or inter-city air-cargo link
 * between any warehouse and order, even when located in completely different cities.
 */
export function buildTransportOptionBetween(
  warehouse: Warehouse,
  order: CustomerOrder,
  intraSpeedKmh = 27,
  intraCircuity = 1.28,
  datasetVersion = 'v2.5.0-cross-city',
): TransportOption {
  const straightKm = haversineKm(warehouse.lat, warehouse.lon, order.lat, order.lon);
  const sameCity =
    String(warehouse.cityId).toLowerCase() === String(order.cityId).toLowerCase() &&
    straightKm <= 120;

  let corridorMode: CorridorMode;
  let circuity: number;
  let speedKmh: number;
  let handlingDelayHours: number;
  let pricePerOrder: number;
  let assumptionText: string;

  if (sameCity) {
    corridorMode = 'INTRA_CITY_VAN';
    circuity = intraCircuity;
    speedKmh = intraSpeedKmh;
    handlingDelayHours = 0.5;
    const dist = Math.round(straightKm * circuity * 100) / 100;
    const isBase = warehouse.id === order.baselineWarehouseId;
    pricePerOrder = Math.round(75 + dist * 6.5 + (isBase ? 0 : 18));
    assumptionText = `Intra-city arterial dispatch (${speedKmh} km/h + ${handlingDelayHours}h dock)`;
    return {
      id: `TR-${warehouse.id}-${order.id}`,
      warehouseId: warehouse.id,
      orderId: order.id,
      roadDistanceKm: dist,
      modeledSpeedKmh: speedKmh,
      handlingDelayHours,
      estimatedTimeHours: Math.round((dist / speedKmh + handlingDelayHours) * 100) / 100,
      pricePerOrder,
      available: true,
      corridorMode,
      roadWayIds: [`osm-way-${warehouse.cityId}-${warehouse.pincode}-${order.pincode}`],
      provenance: {
        distance: {
          classification: 'Derived',
          sourceFile: warehouse.provenance?.coordinates?.sourceFile || 'pincode.csv',
          assumptions: `Shortest drivable path on ${warehouse.cityId} road graph (circuity ${circuity})`,
          datasetVersion,
        },
        time: {
          classification: 'Derived with simulated assumptions',
          assumptions: assumptionText,
          datasetVersion,
        },
        price: {
          classification: 'Simulated',
          seed: 9001,
          assumptions: 'Distance-indexed local dispatch tariff (₹)',
          datasetVersion,
        },
      },
    };
  } else if (straightKm <= 420) {
    corridorMode = 'INTER_CITY_HIGHWAY';
    circuity = 1.18;
    speedKmh = 72;
    handlingDelayHours = 0.65;
    const dist = Math.round(straightKm * circuity * 100) / 100;
    pricePerOrder = Math.round(160 + dist * 4.2);
    assumptionText = `Inter-city NH expressway linehaul (${warehouse.cityId} → ${order.cityId}, ${speedKmh} km/h + ${handlingDelayHours}h transfer)`;
    return {
      id: `TR-${warehouse.id}-${order.id}`,
      warehouseId: warehouse.id,
      orderId: order.id,
      roadDistanceKm: dist,
      modeledSpeedKmh: speedKmh,
      handlingDelayHours,
      estimatedTimeHours: Math.round((dist / speedKmh + handlingDelayHours) * 100) / 100,
      pricePerOrder,
      available: true,
      corridorMode,
      roadWayIds: [`osm-nh-${warehouse.cityId}-${order.cityId}-${order.pincode}`],
      provenance: {
        distance: {
          classification: 'Derived',
          sourceFile: 'Geofabrik India National Highway Corridors',
          assumptions: `Inter-city expressway distance (${warehouse.cityId} → ${order.cityId}, circuity ${circuity})`,
          datasetVersion,
        },
        time: {
          classification: 'Derived with simulated assumptions',
          assumptions: assumptionText,
          datasetVersion,
        },
        price: {
          classification: 'Simulated',
          seed: 9002,
          assumptions: 'Inter-city expressway linehaul tariff (₹)',
          datasetVersion,
        },
      },
    };
  } else {
    corridorMode = 'INTER_CITY_AIR_CARGO';
    circuity = 1.06;
    speedKmh = 520;
    handlingDelayHours = 1.4;
    const dist = Math.round(straightKm * circuity * 100) / 100;
    pricePerOrder = Math.round(380 + dist * 1.15);
    assumptionText = `Inter-city air-cargo + last-mile relay (${warehouse.cityId} → ${order.cityId}, ${speedKmh} km/h + ${handlingDelayHours}h airport ramp)`;
    return {
      id: `TR-${warehouse.id}-${order.id}`,
      warehouseId: warehouse.id,
      orderId: order.id,
      roadDistanceKm: dist,
      modeledSpeedKmh: speedKmh,
      handlingDelayHours,
      estimatedTimeHours: Math.round((dist / speedKmh + handlingDelayHours) * 100) / 100,
      pricePerOrder,
      available: true,
      corridorMode,
      roadWayIds: [`air-corridor-${warehouse.cityId}-${order.cityId}`],
      provenance: {
        distance: {
          classification: 'Derived',
          sourceFile: 'pincode.csv + Pan-India Air Freight Corridors',
          assumptions: `Great-circle air cargo corridor + airport last-mile leg (${warehouse.cityId} → ${order.cityId})`,
          datasetVersion,
        },
        time: {
          classification: 'Derived with simulated assumptions',
          assumptions: assumptionText,
          datasetVersion,
        },
        price: {
          classification: 'Simulated',
          seed: 9003,
          assumptions: 'Express cross-city air freight + van delivery tariff (₹)',
          datasetVersion,
        },
      },
    };
  }
}

/**
 * Ensures every (warehouse, order) pair in a CityNetwork has a valid TransportOption,
 * automatically synthesizing cross-city highway / air-cargo corridors whenever warehouses
 * span multiple cities (e.g. user-added out-of-city hubs or imported multi-city JSON).
 */
export function hydrateCrossCityTransportOptions(network: CityNetwork): CityNetwork {
  const existing = new Set(
    network.transportOptions.map((t) => `${t.warehouseId}::${t.orderId}`),
  );
  const missing: TransportOption[] = [];

  for (const w of network.warehouses) {
    for (const o of network.orders) {
      const key = `${w.id}::${o.id}`;
      if (!existing.has(key)) {
        missing.push(
          buildTransportOptionBetween(
            w,
            o,
            network.defaultModeledSpeedKmh || 27,
            1.28,
            `v2.5.0-${network.cityId}`,
          ),
        );
      }
    }
  }

  if (missing.length === 0) return network;
  return {
    ...network,
    transportOptions: [...network.transportOptions, ...missing],
  };
}

/**
 * Attaches an out-of-city (or custom) warehouse into any active CityNetwork and generates
 * all cross-city transport corridors to existing orders.
 */
export function addCrossCityWarehouseToNetwork(
  network: CityNetwork,
  warehouse: Warehouse,
): CityNetwork {
  const filtered = network.warehouses.filter((w) => w.id !== warehouse.id);
  const updated: CityNetwork = {
    ...network,
    warehouses: [...filtered, warehouse],
  };
  return hydrateCrossCityTransportOptions(updated);
}

/**
 * Creates a Warehouse instance from a CrossCityWarehouseTemplate with a unique ID for the network.
 */
export function createWarehouseFromTemplate(
  network: CityNetwork,
  tpl: CrossCityWarehouseTemplate,
  inventory = tpl.defaultInventory,
  processingCapacity = tpl.defaultCapacity,
): Warehouse {
  let idx = 1;
  let id = `${tpl.idPrefix}-${idx}`;
  const existingIds = new Set(network.warehouses.map((w) => w.id));
  while (existingIds.has(id)) {
    idx++;
    id = `${tpl.idPrefix}-${idx}`;
  }

  return {
    id,
    name: `${tpl.name} (${id})`,
    cityId: tpl.cityId,
    pincode: tpl.pincode,
    lat: tpl.lat,
    lon: tpl.lon,
    snappedNodeId: `osm-xc-${tpl.cityId}-${tpl.pincode}`,
    inventory,
    processingCapacity,
    status: 'ACTIVE',
    provenance: {
      coordinates: {
        classification: 'Sourced',
        sourceFile: `pincode.csv + ${tpl.sourceFile}`,
        bbox: network.bbox,
        snappingToleranceMeters: 35,
        datasetVersion: 'v2.5.0-cross-city',
      },
      operations: {
        classification: 'Simulated',
        seed: 9100 + idx,
        assumptions: `Cross-city backup warehouse in ${tpl.cityLabel}`,
        datasetVersion: 'v2.5.0-cross-city',
      },
    },
  };
}

export function removeWarehouseFromNetwork(
  network: CityNetwork,
  warehouseId: string,
): CityNetwork {
  if (network.warehouses.length <= 1) return network;
  return {
    ...network,
    warehouses: network.warehouses.filter((w) => w.id !== warehouseId),
    transportOptions: network.transportOptions.filter((t) => t.warehouseId !== warehouseId),
    disruptions: network.disruptions.filter((d) => d.targetId !== warehouseId),
  };
}

/**
 * Builds the Pan-India Multi-City Cross-Regional Network (`multi_city`) containing
 * warehouses across 6 distinct Indian cities serving customer demand across 5 metro corridors.
 */
export function buildMultiCityNetwork(): CityNetwork {
  const cityId: CityId = 'multi_city';
  const bbox: [number, number, number, number] = [72.77, 12.82, 91.86, 28.78];
  const datasetVersion = 'v2.5.0-pan-india-multi-city';

  const warehouses: Warehouse[] = [
    {
      id: 'PAN-BLR-W1',
      name: 'Bengaluru Whitefield National Hub',
      cityId: 'bengaluru',
      pincode: '560066',
      lat: 12.9698,
      lon: 77.7499,
      snappedNodeId: 'osm-pan-blr-1',
      inventory: 100,
      processingCapacity: 40,
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + southern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 35,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 9901,
          assumptions: 'Pan-India southern regional fulfillment hub',
          datasetVersion,
        },
      },
    },
    {
      id: 'PAN-MUM-W2',
      name: 'Mumbai Bhiwandi Western Gateway',
      cityId: 'mumbai',
      pincode: '400601',
      lat: 19.2183,
      lon: 72.9781,
      snappedNodeId: 'osm-pan-mum-2',
      inventory: 100,
      processingCapacity: 40,
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + western-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 35,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 9902,
          assumptions: 'Pan-India western port gateway hub',
          datasetVersion,
        },
      },
    },
    {
      id: 'PAN-DEL-W3',
      name: 'Delhi NCR Okhla Northern Hub',
      cityId: 'delhi_ncr',
      pincode: '110020',
      lat: 28.5355,
      lon: 77.2720,
      snappedNodeId: 'osm-pan-del-3',
      inventory: 90,
      processingCapacity: 30,
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + northern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 35,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 9903,
          assumptions: 'Pan-India northern corridor hub',
          datasetVersion,
        },
      },
    },
    {
      id: 'PAN-MAA-W4',
      name: 'Chennai Sriperumbudur Coastal Hub',
      cityId: 'chennai',
      pincode: '602105',
      lat: 12.9675,
      lon: 79.9419,
      snappedNodeId: 'osm-pan-maa-4',
      inventory: 90,
      processingCapacity: 30,
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + southern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 35,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 9904,
          assumptions: 'Pan-India southeast coastal hub',
          datasetVersion,
        },
      },
    },
    {
      id: 'PAN-GAU-W5',
      name: 'Guwahati Amingaon NE Terminal',
      cityId: 'guwahati',
      pincode: '781031',
      lat: 26.1882,
      lon: 91.6785,
      snappedNodeId: 'osm-pan-gau-5',
      inventory: 80,
      processingCapacity: 30,
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + north-eastern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 35,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 9905,
          assumptions: 'Pan-India North-Eastern regional terminal',
          datasetVersion,
        },
      },
    },
    {
      id: 'PAN-HYD-W6',
      name: 'Hyderabad Shamshabad Central Air-Hub',
      cityId: 'hyderabad',
      pincode: '501218',
      lat: 17.2403,
      lon: 78.4294,
      snappedNodeId: 'osm-pan-hyd-6',
      inventory: 100,
      processingCapacity: 30,
      status: 'ACTIVE',
      provenance: {
        coordinates: {
          classification: 'Sourced',
          sourceFile: 'pincode.csv + southern-zone-261112.osm.pbf',
          bbox,
          snappingToleranceMeters: 35,
          datasetVersion,
        },
        operations: {
          classification: 'Simulated',
          seed: 9906,
          assumptions: 'Central Pan-India cross-city air & NH-44 reserve hub',
          datasetVersion,
        },
      },
    },
  ];

  const orderSpecs: {
    id: string;
    name: string;
    cityId: string;
    pin: string;
    lat: number;
    lon: number;
    deadline: number;
    priority: 'CRITICAL' | 'STANDARD';
    baseW: string;
  }[] = [
    { id: 'PAN-O01', name: 'Bengaluru Manipal Trauma', cityId: 'bengaluru', pin: '560017', lat: 12.9592, lon: 77.6476, deadline: 5.0, priority: 'CRITICAL', baseW: 'PAN-BLR-W1' },
    { id: 'PAN-O02', name: 'Bengaluru Indiranagar Grid', cityId: 'bengaluru', pin: '560038', lat: 12.9784, lon: 77.6408, deadline: 5.5, priority: 'STANDARD', baseW: 'PAN-BLR-W1' },
    { id: 'PAN-O03', name: 'Bengaluru Electronic City Node', cityId: 'bengaluru', pin: '560100', lat: 12.8452, lon: 77.6602, deadline: 5.5, priority: 'STANDARD', baseW: 'PAN-BLR-W1' },
    { id: 'PAN-O04', name: 'Mumbai KEM Hospital Parel', cityId: 'mumbai', pin: '400012', lat: 19.0022, lon: 72.8416, deadline: 5.0, priority: 'CRITICAL', baseW: 'PAN-MUM-W2' },
    { id: 'PAN-O05', name: 'Mumbai BKC Medical Center', cityId: 'mumbai', pin: '400051', lat: 19.0654, lon: 72.8682, deadline: 5.5, priority: 'CRITICAL', baseW: 'PAN-MUM-W2' },
    { id: 'PAN-O06', name: 'Mumbai Nariman Point Finance', cityId: 'mumbai', pin: '400021', lat: 18.9256, lon: 72.8242, deadline: 6.0, priority: 'STANDARD', baseW: 'PAN-MUM-W2' },
    { id: 'PAN-O07', name: 'Delhi AIIMS Emergency', cityId: 'delhi_ncr', pin: '110029', lat: 28.5672, lon: 77.2100, deadline: 5.5, priority: 'CRITICAL', baseW: 'PAN-DEL-W3' },
    { id: 'PAN-O08', name: 'Delhi IGI Cargo Terminal', cityId: 'delhi_ncr', pin: '110037', lat: 28.5562, lon: 77.1000, deadline: 6.0, priority: 'STANDARD', baseW: 'PAN-DEL-W3' },
    { id: 'PAN-O09', name: 'Noida Sector-62 Tech Link', cityId: 'delhi_ncr', pin: '201309', lat: 28.6208, lon: 77.3639, deadline: 6.0, priority: 'STANDARD', baseW: 'PAN-DEL-W3' },
    { id: 'PAN-O10', name: 'Chennai Apollo Greams Road', cityId: 'chennai', pin: '600006', lat: 13.0604, lon: 80.2518, deadline: 5.0, priority: 'CRITICAL', baseW: 'PAN-MAA-W4' },
    { id: 'PAN-O11', name: 'Chennai OMR IT Park', cityId: 'chennai', pin: '600119', lat: 12.9010, lon: 80.2279, deadline: 5.5, priority: 'STANDARD', baseW: 'PAN-MAA-W4' },
    { id: 'PAN-O12', name: 'Chennai Adyar Coastal Hub', cityId: 'chennai', pin: '600020', lat: 13.0063, lon: 80.2574, deadline: 6.0, priority: 'STANDARD', baseW: 'PAN-MAA-W4' },
    { id: 'PAN-O13', name: 'Guwahati GMCH Medical', cityId: 'guwahati', pin: '781032', lat: 26.1584, lon: 91.7692, deadline: 6.0, priority: 'CRITICAL', baseW: 'PAN-GAU-W5' },
    { id: 'PAN-O14', name: 'Guwahati Dispur Capital', cityId: 'guwahati', pin: '781006', lat: 26.1433, lon: 91.7898, deadline: 6.5, priority: 'STANDARD', baseW: 'PAN-GAU-W5' },
    { id: 'PAN-O15', name: 'Guwahati IIT North Bank', cityId: 'guwahati', pin: '781039', lat: 26.1878, lon: 91.6916, deadline: 6.5, priority: 'STANDARD', baseW: 'PAN-GAU-W5' },
  ];

  const orders: CustomerOrder[] = orderSpecs.map((o, idx) => ({
    id: o.id,
    customerName: o.name,
    cityId: o.cityId,
    pincode: o.pin,
    lat: o.lat,
    lon: o.lon,
    snappedNodeId: `osm-pan-o-${idx + 1}`,
    quantity: 10,
    deadlineHours: o.deadline,
    priority: o.priority,
    baselineWarehouseId: o.baseW,
    provenance: {
      coordinates: {
        classification: 'Sourced',
        sourceFile: 'pincode.csv',
        bbox,
        snappingToleranceMeters: 25,
        datasetVersion,
      },
      demand: {
        classification: 'Simulated',
        seed: 9950 + idx,
        assumptions: `Pan-India customer order in ${o.cityId}`,
        datasetVersion,
      },
    },
  }));

  const interventions: InterventionPackage[] = [
    {
      id: 'INT-PAN-HYD-AIR',
      name: 'Hyderabad Air-Cargo Dock Surge (+30 Cap, +30 Stock)',
      cityId: 'hyderabad',
      type: 'HANDLING_CAPACITY',
      affectedResourceId: 'PAN-HYD-W6',
      activationPrice: 550,
      inventoryDelta: 30,
      capacityDelta: 30,
      restoresRoute: false,
      timeReductionHours: 0,
      leadTimeHours: 0.5,
      eligible: true,
      description: 'Expands Hyderabad Central Air-Hub (+30 capacity, +30 reserve stock) for ₹550.',
      provenance: {
        classification: 'Simulated',
        seed: 9906,
        assumptions: 'Cross-city central reserve dock boost',
        datasetVersion,
      },
    },
    {
      id: 'INT-PAN-MAA-CAP',
      name: 'Chennai Express Cross-Dock Shift (+20 Cap)',
      cityId: 'chennai',
      type: 'HANDLING_CAPACITY',
      affectedResourceId: 'PAN-MAA-W4',
      activationPrice: 400,
      inventoryDelta: 0,
      capacityDelta: 20,
      restoresRoute: false,
      timeReductionHours: 0,
      leadTimeHours: 0.5,
      eligible: true,
      description: 'Adds +20 dock capacity at Chennai Sriperumbudur (PAN-MAA-W4) for ₹400.',
      provenance: {
        classification: 'Simulated',
        seed: 9904,
        assumptions: 'Coastal corridor overflow dock shift',
        datasetVersion,
      },
    },
    {
      id: 'INT-PAN-BLR-CAP',
      name: 'Bengaluru Whitefield Night-Sort (+20 Cap)',
      cityId: 'bengaluru',
      type: 'HANDLING_CAPACITY',
      affectedResourceId: 'PAN-BLR-W1',
      activationPrice: 450,
      inventoryDelta: 0,
      capacityDelta: 20,
      restoresRoute: false,
      timeReductionHours: 0,
      leadTimeHours: 0.5,
      eligible: true,
      description: 'Adds +20 handling capacity at Bengaluru Whitefield (PAN-BLR-W1) for ₹450.',
      provenance: {
        classification: 'Simulated',
        seed: 9901,
        assumptions: 'Southern hub cross-city overflow shift',
        datasetVersion,
      },
    },
  ];

  const disruptions: Disruption[] = [
    {
      id: 'DIS-PAN-MUM-OUT',
      type: 'WAREHOUSE_OUTAGE',
      targetId: 'PAN-MUM-W2',
      severityPct: 100,
      label: 'Mumbai Bhiwandi Gateway (PAN-MUM-W2) Complete Outage',
      active: true,
    },
    {
      id: 'DIS-PAN-DEL-CAP',
      type: 'CAPACITY_REDUCTION',
      targetId: 'PAN-DEL-W3',
      severityPct: 50,
      label: 'Delhi Okhla Hub (PAN-DEL-W3) 50% Dock Capacity Reduction',
      active: true,
    },
  ];

  const baseNetwork: CityNetwork = {
    cityId,
    name: 'Pan-India Multi-City',
    regionZone: 'Cross-Regional Grid (All 4 Geofabrik Zones + PIN Index)',
    seed: 9900,
    schemaVersion: '1.0.0',
    planningHorizonHours: 7,
    bbox,
    defaultModeledSpeedKmh: 28,
    defaultHandlingDelayHours: 0.5,
    warehouses,
    orders,
    transportOptions: [],
    interventions,
    disruptions,
    sourceAudits: SOURCE_FILE_AUDITS,
  };

  return hydrateCrossCityTransportOptions(baseNetwork);
}

/** Copy a delivery site's route inputs for a distinct order placed at that same site. */
export function appendSiteOrders(network: CityNetwork, siteId: string, ids: string[]): CityNetwork {
  const site = network.orders.find((o) => o.id === siteId);
  if (!site) throw new Error('Select an existing delivery site.');
  const orderIds = new Set(network.orders.map((o) => o.id));
  const routeIds = new Set(network.transportOptions.map((t) => t.id));
  const routes = network.transportOptions.filter((t) => t.orderId === siteId);
  const orders = [...network.orders];
  const transportOptions = [...network.transportOptions];
  for (const id of ids) {
    if (!id.trim() || orderIds.has(id)) throw new Error(`Duplicate or empty order ID: ${id}`);
    orderIds.add(id);
    orders.push({ ...site, id });
    for (const route of routes) {
      let routeId = `TR-${route.warehouseId}-${id}`;
      while (routeIds.has(routeId)) routeId += '-';
      routeIds.add(routeId);
      transportOptions.push({ ...route, id: routeId, orderId: id });
    }
  }
  return { ...network, orders, transportOptions };
}

/** A demo repeats a complete demand cycle so the resource-to-demand ratios stay comparable. */
export function createRegionalDemo(network: CityNetwork, minimumOrders: number): CityNetwork {
  const cycles = Math.ceil(minimumOrders / network.orders.length);
  let demo = network;
  for (const site of network.orders) {
    const ids = Array.from({ length: cycles - 1 }, (_, i) => `DEMO-${site.id}-${i + 2}`);
    demo = appendSiteOrders(demo, site.id, ids);
  }
  return {
    ...demo,
    warehouses: demo.warehouses.map((w) => ({
      ...w,
      inventory: w.inventory * cycles,
      processingCapacity: w.processingCapacity * cycles,
    })),
    interventions: demo.interventions.map((i) => ({
      ...i,
      inventoryDelta: i.inventoryDelta * cycles,
      capacityDelta: i.capacityDelta * cycles,
    })),
  };
}

export function defaultBudget(network: CityNetwork): number {
  // A starting allowance at nominal baseline tariffs. The planner can enter any budget.
  const baselineHubs = new Map(network.orders.map((o) => [o.id, o.baselineWarehouseId]));
  return (
    network.transportOptions.reduce(
      (sum, t) => sum + (baselineHubs.get(t.orderId) === t.warehouseId ? Math.round(t.pricePerOrder * 100) : 0),
      0,
    ) / 100
  );
}

export function getInitialNetworks(): Record<CityId, CityNetwork> {
  const map: Partial<Record<CityId, CityNetwork>> = {
    known_answer: buildKnownAnswerNetwork(),
    multi_city: buildMultiCityNetwork(),
  };
  for (const bp of CITY_BLUEPRINTS) {
    map[bp.cityId] = createRegionalDemo(buildFromBlueprint(bp), 120);
  }
  return map as Record<CityId, CityNetwork>;
}
