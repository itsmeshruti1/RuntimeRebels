import type { CityNetwork, CustomerOrder, Warehouse, TransportOption } from '../types/recovery';

export interface RouteAssumptions {
  circuity: number;
  speedKmh: number;
  handlingHours: number;
  dispatchFee: number;
  pricePerKm: number;
  reassignmentFee: number;
}

export function computeRoadNetworkDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  circuity = 1.28,
) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(Math.min(1, a))) * circuity * 100) / 100;
}

export function modelRoute(
  w: Warehouse,
  o: CustomerOrder,
  params: RouteAssumptions,
  datasetVersion: string,
): Pick<
  TransportOption,
  | 'roadDistanceKm'
  | 'modeledSpeedKmh'
  | 'handlingDelayHours'
  | 'estimatedTimeHours'
  | 'pricePerOrder'
  | 'roadWayIds'
  | 'provenance'
> {
  const roadDistanceKm = computeRoadNetworkDistanceKm(w.lat, w.lon, o.lat, o.lon, params.circuity);
  return {
    roadDistanceKm,
    modeledSpeedKmh: params.speedKmh,
    handlingDelayHours: params.handlingHours,
    estimatedTimeHours: roadDistanceKm / params.speedKmh + params.handlingHours,
    pricePerOrder:
      Math.round(
        100 *
          (params.dispatchFee +
            roadDistanceKm * params.pricePerKm +
            (o.baselineWarehouseId === w.id ? 0 : params.reassignmentFee)),
      ) / 100,
    roadWayIds: [],
    provenance: {
      distance: {
        classification: 'Derived with simulated assumptions' as const,
        assumptions: `Great-circle distance × ${params.circuity}`,
        datasetVersion,
      },
      time: {
        classification: 'Derived with simulated assumptions' as const,
        assumptions: 'Modeled distance / speed + handling delay',
        datasetVersion,
      },
      price: {
        classification: 'Derived with simulated assumptions' as const,
        assumptions: 'Dispatch fee + distance tariff + reassignment fee where applicable',
        datasetVersion,
      },
    },
  };
}

export function applyRouteAssumptions(network: CityNetwork, params: RouteAssumptions): CityNetwork {
  if (
    Object.values(params).some((v) => !Number.isFinite(v) || v < 0) ||
    params.speedKmh <= 0 ||
    params.circuity < 1
  ) {
    throw new Error('Speed must be positive, circuity at least one, and fees and delays nonnegative.');
  }
  const orders = new Map(network.orders.map((o) => [o.id, o]));
  const hubs = new Map(network.warehouses.map((w) => [w.id, w]));
  const transportOptions = network.transportOptions.map((route) => {
    const o = orders.get(route.orderId)!;
    const w = hubs.get(route.warehouseId)!;
    return { ...route, ...modelRoute(w, o, params, network.schemaVersion) };
  });
  return {
    ...network,
    routeAssumptions: { ...params },
    defaultModeledSpeedKmh: params.speedKmh,
    defaultHandlingDelayHours: params.handlingHours,
    transportOptions,
  };
}
