/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CityId,
  CityNetwork,
  Disruption,
  PlannerConfig,
  WorkbenchViewId,
} from './types/recovery';
import { defaultBudget, getInitialNetworks, hydrateCrossCityTransportOptions } from './data/networks';
import { loadSaved, saveScenario, type Scenario } from './engine/scenario';
import type { PlannerResults } from './engine/planner.worker';
import { HerasymenkoLanding } from './components/HerasymenkoLanding';
import { AurenHomePage } from './components/AurenHomePage';
import { CustomCursor } from './components/CustomCursor';

const HASH_CITY_MAP: Record<string, { city: CityId; defaultView: WorkbenchViewId }> = {
  bengaluru: { city: 'bengaluru', defaultView: 'overview' },
  mumbai: { city: 'mumbai', defaultView: 'simulator' },
  'delhi-ncr': { city: 'delhi_ncr', defaultView: 'planner' },
  delhi_ncr: { city: 'delhi_ncr', defaultView: 'planner' },
  chennai: { city: 'chennai', defaultView: 'comparison' },
  guwahati: { city: 'guwahati', defaultView: 'actionsheet' },
  'multi-city': { city: 'multi_city', defaultView: 'overview' },
  multi_city: { city: 'multi_city', defaultView: 'overview' },
};

const HASH_VIEW_MAP: Record<string, WorkbenchViewId> = {
  overview: 'overview',
  simulator: 'simulator',
  planner: 'planner',
  comparison: 'comparison',
  'action-sheet': 'actionsheet',
  actionsheet: 'actionsheet',
};

const VALID_CITY_IDS = new Set<CityId>([
  'bengaluru',
  'mumbai',
  'delhi_ncr',
  'chennai',
  'guwahati',
  'multi_city',
  'known_answer',
]);

function parseRouteFromUrl(href: string = window.location.href): {
  page: 'landing' | 'home' | 'engine';
  view?: WorkbenchViewId;
  city?: CityId;
  hashTarget?: string;
} {
  const url = new URL(href, window.location.origin);
  const path = url.pathname.replace(/\/$/, '');
  const params = url.searchParams;
  const rawHash = url.hash.replace(/^#/, '').trim().toLowerCase();

  const viewParam = params.get('view') as WorkbenchViewId | null;
  const cityParam = params.get('city') as CityId | null;
  const pageParam = params.get('page');

  const hashCity = Object.hasOwn(HASH_CITY_MAP, rawHash) ? HASH_CITY_MAP[rawHash] : undefined;
  const hashView = Object.hasOwn(HASH_VIEW_MAP, rawHash) ? HASH_VIEW_MAP[rawHash] : undefined;

  const resolvedCity =
    cityParam && VALID_CITY_IDS.has(cityParam) ? cityParam : hashCity?.city;
  const pathView = path.startsWith('/workbench/') ? path.slice(11) : '';
  const featureView = Object.hasOwn(HASH_VIEW_MAP, pathView) ? HASH_VIEW_MAP[pathView] : undefined;
  const resolvedView = featureView ?? (
    viewParam && Object.values(HASH_VIEW_MAP).includes(viewParam)
      ? viewParam
      : hashView || hashCity?.defaultView);

  const isWorkbenchDeepLink = path === '/workbench' || path.startsWith('/workbench/');
  const isHome =
    path.startsWith('/home') ||
    isWorkbenchDeepLink ||
    pageParam === 'home' ||
    Boolean(resolvedView) ||
    Boolean(resolvedCity) ||
    Boolean(rawHash);

  const hashTarget =
    rawHash ||
    (isWorkbenchDeepLink
      ? resolvedView === 'actionsheet'
        ? 'action-sheet'
        : resolvedView || 'reverseresilia-workbench'
      : undefined);

  return {
    page: isWorkbenchDeepLink || (!hashCity && (resolvedView || rawHash === 'reverseresilia-workbench'))
      ? 'engine' : isHome ? 'home' : 'landing',
    view: resolvedView || undefined,
    city: resolvedCity || undefined,
    hashTarget,
  };
}

function scrollToTargetSection(hashTarget?: string, view?: WorkbenchViewId) {
  if (!hashTarget && !view) return;
  const targetId =
    hashTarget === 'actionsheet'
      ? 'action-sheet'
      : hashTarget ||
        (view === 'actionsheet'
          ? 'action-sheet'
          : view || 'reverseresilia-workbench');

  const attemptScroll = (triesLeft: number) => {
    const el =
      document.getElementById(targetId) ||
      (view ? document.getElementById('reverseresilia-workbench') : null);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (triesLeft > 0) {
      setTimeout(() => attemptScroll(triesLeft - 1), 60);
    }
  };

  setTimeout(() => attemptScroll(6), 80);
}

export default function App() {
  const initialRoute = parseRouteFromUrl();
  const [saved, setSaved] = useState<Scenario[] | null>(null);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    let live = true;
    loadSaved()
      .then((rows) => {
        if (live) setSaved(rows);
      })
      .catch(() => {
        if (live) {
          setStorageError('Saved scenarios could not be read. Export JSON to keep your work.');
          setSaved([]);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  if (!saved) {
    if (initialRoute.page === 'landing') {
      return (
        <>
          <HerasymenkoLanding isLanding={true} />
          <div className="veil" data-veil="" aria-hidden="true"></div>
          <CustomCursor page="landing" />
        </>
      );
    }
    return (
      <div
        role="status"
        className="min-h-screen bg-[#F5F4F0] text-[#0D0D0D] flex items-center justify-center font-auren-mono text-xs uppercase tracking-[0.14em]"
      >
        Opening saved scenarios…
      </div>
    );
  }

  return (
    <Workspace
      saved={saved}
      storageError={storageError}
      onStorageError={setStorageError}
    />
  );
}

function Workspace({
  saved,
  storageError,
  onStorageError,
}: {
  saved: Scenario[];
  storageError: string;
  onStorageError: (s: string) => void;
}) {
  const initialRoute = parseRouteFromUrl();
  const [page, setPage] = useState<'landing' | 'home' | 'engine'>(initialRoute.page);
  const [networks, setNetworks] = useState<Record<CityId, CityNetwork>>(() => ({
    ...getInitialNetworks(),
    ...Object.fromEntries(
      saved.map((s) => [s.network.cityId, hydrateCrossCityTransportOptions(s.network)]),
    ),
  }));
  const [activeCityId, setActiveCityId] = useState<CityId>(
    initialRoute.city || 'bengaluru',
  );
  const [activeView, setActiveView] = useState<WorkbenchViewId>(
    initialRoute.view || 'overview',
  );

  const activeNetwork = networks[activeCityId] || networks.bengaluru;

  const settings = useRef<Map<CityId, PlannerConfig>>(
    new Map(saved.map((s) => [s.network.cityId, s.config])),
  );
  const initialDisruptions = useRef<Map<CityId, Disruption[]>>(
    new Map(saved.map((s) => [s.network.cityId, s.defaultDisruptions])),
  );

  const [targetServicePct, setTargetServicePct] = useState<number>(
    settings.current.get(activeCityId)?.targetServicePct ?? 100,
  );
  const [availableBudget, setAvailableBudget] = useState<number>(
    settings.current.get(activeCityId)?.availableBudget ?? defaultBudget(activeNetwork),
  );
  const [protectCritical, setProtectCritical] = useState<boolean>(
    settings.current.get(activeCityId)?.protectCriticalOrders ?? true,
  );
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ request: object; data: PlannerResults } | null>(null);
  const [workerError, setWorkerError] = useState('');

  const request = useMemo(
    () => ({
      network: activeNetwork,
      config: {
        targetServicePct,
        availableBudget,
        protectCriticalOrders: protectCritical,
        permittedInterventionIds: activeNetwork.interventions
          .filter((i) => i.eligible)
          .map((i) => i.id),
      },
      revision,
    }),
    [activeNetwork, targetServicePct, availableBudget, protectCritical, revision],
  );

  const workerInput = useMemo(
    () => ({ network: request.network, config: request.config }),
    [request],
  );

  const computedState = result?.data;
  const isStale = result?.request !== request || computedState?.stageC.cityId !== activeCityId;
  const defaultDisruptions =
    initialDisruptions.current.get(activeCityId) ?? activeNetwork.disruptions;
  const scenario: Scenario = {
    network: activeNetwork,
    config: request.config,
    defaultDisruptions,
  };

  useEffect(() => {
    settings.current.set(activeCityId, request.config);
    if (!storageError) {
      saveScenario({
        network: activeNetwork,
        config: request.config,
        defaultDisruptions,
      }).catch(() =>
        onStorageError('Local save failed. Export scenario JSON to keep your changes.'),
      );
    }
    let live = true;
    const worker = new Worker(new URL('./engine/planner.worker.ts', import.meta.url), {
      type: 'module',
    });
    setWorkerError('');
    worker.onmessage = (event) => {
      if (live) {
        setResult({ request, data: event.data });
        worker.terminate();
      }
    };
    worker.onerror = (event) => {
      if (live) setWorkerError(event.message || 'Planner could not run.');
    };
    worker.postMessage(workerInput);
    return () => {
      live = false;
      worker.terminate();
    };
  }, [request, workerInput]);

  // Sync <html> class for Herasymenko fixed viewport vs. Auren scrollable home
  useEffect(() => {
    const root = document.documentElement;
    if (page === 'landing') {
      root.classList.add('is-landing');
      root.classList.remove('is-home');
    } else {
      root.classList.add('is-home');
      root.classList.remove('is-landing', 'veil-on', 'veil-in');
    }
  }, [page]);

  // Handle initial anchor scroll if loaded directly with /home#... or /home?view=... or /workbench?...
  useEffect(() => {
    if (
      initialRoute.page === 'home' &&
      (initialRoute.hashTarget || initialRoute.view)
    ) {
      scrollToTargetSection(initialRoute.hashTarget, initialRoute.view);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCity = useCallback(
    (cityId: CityId) => {
      if (cityId === activeCityId) return;
      settings.current.set(activeCityId, request.config);
      if (window.location.pathname.startsWith('/home') || window.location.pathname.startsWith('/workbench')) {
        const url = new URL(window.location.href);
        url.searchParams.set('city', cityId);
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
      setActiveCityId(cityId);
      const net = networks[cityId];
      const nextTarget = settings.current.get(cityId)?.targetServicePct ?? 100;
      const nextBudget = settings.current.get(cityId)?.availableBudget ?? defaultBudget(net);
      setTargetServicePct(nextTarget);
      setAvailableBudget(nextBudget);
      setProtectCritical(settings.current.get(cityId)?.protectCriticalOrders ?? true);
    },
    [networks, activeCityId, request],
  );

  // Listen for custom rr:navigate events, popstate, and hashchange
  useEffect(() => {
    const applyRoute = (href: string, pushHistory: boolean) => {
      const url = new URL(href, window.location.origin);
      if (pushHistory) {
        window.history.pushState({}, '', url.pathname + url.search + url.hash);
      }

      const route = parseRouteFromUrl(url.href);
      if (route.city && networks[route.city]) {
        handleSelectCity(route.city);
      }
      if (route.view || route.page === 'engine') {
        setActiveView(route.view || 'overview');
      }

      if (route.page === 'landing') {
        window.dispatchEvent(new CustomEvent('rr:landing-reset'));
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        setPage('landing');
      } else {
        setPage(route.page);
        if (route.page === 'home' && (route.hashTarget || route.view)) {
          scrollToTargetSection(route.hashTarget, route.view);
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        }
      }
    };

    const onNavigate = (e: Event) => {
      const custom = e as CustomEvent<{ href: string }>;
      const href = custom.detail?.href || '/home';
      applyRoute(href, true);
    };

    const onPopState = () => {
      applyRoute(window.location.href, false);
    };

    const onHashChange = () => {
      applyRoute(window.location.href, false);
    };

    window.addEventListener('rr:navigate', onNavigate);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('rr:navigate', onNavigate);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [networks, handleSelectCity]);

  const handleUpdateNetwork = (
    updated: CityNetwork,
    imported = false,
    restored?: Scenario,
  ) => {
    if (imported || !initialDisruptions.current.has(activeCityId)) {
      initialDisruptions.current.set(
        activeCityId,
        imported ? updated.disruptions : activeNetwork.disruptions,
      );
    }
    if (restored) {
      const permitted = new Set(restored.config.permittedInterventionIds);
      updated = {
        ...updated,
        interventions: updated.interventions.map((i) => ({
          ...i,
          eligible: i.eligible && permitted.has(i.id),
        })),
      };
      setAvailableBudget(restored.config.availableBudget);
      setTargetServicePct(restored.config.targetServicePct);
      setProtectCritical(restored.config.protectCriticalOrders);
      initialDisruptions.current.set(updated.cityId, restored.defaultDisruptions);
    }
    setNetworks((prev) => ({
      ...prev,
      [updated.cityId]: updated,
    }));
  };

  const handleResetNetwork = () => {
    const freshAll = getInitialNetworks();
    const freshCity = JSON.parse(JSON.stringify(freshAll[activeCityId])) as CityNetwork;
    const resetBudget = defaultBudget(freshCity);
    initialDisruptions.current.set(activeCityId, freshCity.disruptions);
    setNetworks((prev) => ({
      ...prev,
      [activeCityId]: freshCity,
    }));
    setTargetServicePct(100);
    setProtectCritical(true);
    setAvailableBudget(resetBudget);
  };

  const handleChangeTargetPct = (pct: number) => {
    const clamped = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
    setTargetServicePct(clamped);
  };

  const handleChangeBudget = (budget: number) => {
    const clean = Number.isFinite(budget) ? Math.max(0, Math.round(budget * 100) / 100) : 0;
    setAvailableBudget(clean);
  };

  const handleChangeProtectCritical = (flag: boolean) => {
    setProtectCritical(flag);
  };

  const handleNavigateLanding = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new CustomEvent('rr:landing-reset'));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setPage('landing');
  };

  return (
    <>
      <HerasymenkoLanding isLanding={page === 'landing'} />

      {page !== 'landing' && storageError && (
        <div
          role="alert"
          className="w-full bg-[#FBF4E4] text-[#4E3204] border-b border-[#8C5A08]/30 px-6 py-2.5 font-auren-mono text-xs text-center"
        >
          {storageError}
        </div>
      )}

      {page !== 'landing' && workerError && (
        <div
          role="alert"
          className="w-full bg-[#FDF5F4] text-[#8E2A1E] border-b border-[#8E2A1E]/30 px-6 py-2.5 font-auren-mono text-xs flex items-center justify-center gap-3"
        >
          <span>{workerError}</span>
          <button
            type="button"
            onClick={() => setRevision((n) => n + 1)}
            className="px-2.5 py-1 bg-[#8E2A1E] text-white uppercase cursor-pointer"
          >
            Retry calculation
          </button>
        </div>
      )}

      {page !== 'landing' && !computedState && (
        <div
          role="status"
          className="min-h-screen bg-[#F5F4F0] text-[#0D0D0D] flex items-center justify-center font-auren-mono text-xs uppercase tracking-[0.14em]"
        >
          Calculating {activeNetwork.name} recovery plans…
        </div>
      )}

      {page !== 'landing' && computedState && (
        <AurenHomePage
          enginePage={page === 'engine'}
          scenario={scenario}
          budgetResult={computedState.budget}
          onNavigateLanding={handleNavigateLanding}
          activeCityId={activeCityId}
          onSelectCity={handleSelectCity}
          activeView={activeView}
          network={activeNetwork}
          onUpdateNetwork={handleUpdateNetwork}
          onResetNetwork={handleResetNetwork}
          onDefaultShock={() =>
            handleUpdateNetwork({
              ...activeNetwork,
              disruptions:
                initialDisruptions.current.get(activeCityId) ?? activeNetwork.disruptions,
            })
          }
          targetServicePct={targetServicePct}
          onChangeTargetServicePct={handleChangeTargetPct}
          availableBudget={availableBudget}
          onChangeAvailableBudget={handleChangeBudget}
          protectCritical={protectCritical}
          onChangeProtectCritical={handleChangeProtectCritical}
          impactResult={computedState.impact}
          stageAResult={computedState.stageA}
          stageBResult={computedState.stageB}
          stageCResult={computedState.stageC}
          isStale={isStale}
          onRunEngines={() => setRevision((n) => n + 1)}
        />
      )}

      <div className="veil" data-veil="" aria-hidden="true"></div>
      <CustomCursor page={page === 'landing' ? 'landing' : 'home'} />
    </>
  );
}
