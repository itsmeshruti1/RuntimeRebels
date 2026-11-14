import type { CityNetwork, PlannerConfig } from '../types/recovery';
import { validateConfig, validateNetwork } from './validation';

export interface Scenario {
  network: CityNetwork;
  config: PlannerConfig;
  defaultDisruptions: CityNetwork['disruptions'];
}

export function readScenario(value: unknown): Scenario {
  if (!value || typeof value !== 'object' || !('network' in value) || !('config' in value)) {
    throw new Error('Expected scenario network and planner settings.');
  }
  const { network, config } = value;
  validateNetwork(network);
  if (!config || typeof config !== 'object') throw new Error('Invalid planner settings.');
  validateConfig(config as PlannerConfig, network);
  const defaultDisruptions = 'defaultDisruptions' in value ? value.defaultDisruptions : network.disruptions;
  validateNetwork({ ...network, disruptions: defaultDisruptions });
  return {
    network,
    config: config as PlannerConfig,
    defaultDisruptions: defaultDisruptions as CityNetwork['disruptions'],
  };
}

let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ReverseResilia scenarios', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('scenarios');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function loadSaved(): Promise<Scenario[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('scenarios').objectStore('scenarios').getAll();
    request.onsuccess = () => {
      try {
        resolve(request.result.map(readScenario));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveScenario(scenario: Scenario) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('scenarios', 'readwrite');
    tx.objectStore('scenarios').put(scenario, scenario.network.cityId);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export function downloadFile(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
