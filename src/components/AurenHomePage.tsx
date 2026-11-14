import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  LayoutGrid,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import {
  CityId,
  CityNetwork,
  ImpactAnalysisResult,
  RecoveryPlan,
  WorkbenchViewId,
} from '../types/recovery';
import { SpiralRibbonCanvas } from './SpiralRibbonCanvas';
import { ReverseResiliaWorkbench } from './ReverseResiliaWorkbench';
import { MagnificationDock, type DockItemData } from './MagnificationDock';

import type { Scenario } from '../engine/scenario';
import type { BudgetResult } from '../engine/budget';

interface AurenHomePageProps {
  enginePage: boolean;
  onNavigateLanding: () => void;
  activeCityId: CityId;
  onSelectCity: (cityId: CityId) => void;
  activeView: WorkbenchViewId;
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

interface ShowcaseCardItem {
  num: string;
  anchorId: string;
  cityId: CityId;
  viewId: WorkbenchViewId;
  title: string;
  subtitle: string;
  category: string;
  pinRange: string;
  bgImage: string;
  cardImage: string;
  altText: string;
  caption: string;
}

const SHOWCASE_ITEMS: ShowcaseCardItem[] = [
  {
    num: '01',
    anchorId: 'bengaluru',
    cityId: 'bengaluru',
    viewId: 'overview',
    title: 'Bengaluru',
    subtitle: 'Whitefield · Peenya · Electronic City',
    category: 'Network Overview · F01–F04',
    pinRange: 'PIN 560001–560100',
    bgImage: '/media/cities/bengaluru.jpg',
    cardImage: '/media/cities/bengaluru.jpg',
    altText: 'Bengaluru skyline featuring Vidhana Soudha, UB City tower, and Cubbon Park canopy at golden hour',
    caption: 'Electronic City & Peenya industrial corridors across NH-44 and ORR.',
  },
  {
    num: '02',
    anchorId: 'mumbai',
    cityId: 'mumbai',
    viewId: 'simulator',
    title: 'Mumbai',
    subtitle: 'Nhava Sheva · Bhiwandi · Andheri',
    category: 'Disruption Simulator · F05–F07',
    pinRange: 'PIN 400001–400706',
    bgImage: '/media/cities/mumbai.jpg',
    cardImage: '/media/cities/mumbai.jpg',
    altText: 'Mumbai Bandra-Worli Sea Link cable-stayed bridge and South Mumbai skyline at sunset',
    caption: 'JNPT port feeder & Bhiwandi warehouse shock simulation.',
  },
  {
    num: '03',
    anchorId: 'delhi-ncr',
    cityId: 'delhi_ncr',
    viewId: 'planner',
    title: 'Delhi NCR',
    subtitle: 'Okhla · Gurugram · Noida · Kundli',
    category: 'Recovery Planner · F08–F13',
    pinRange: 'PIN 110001–201301',
    bgImage: '/media/cities/delhi-ncr.jpg',
    cardImage: '/media/cities/delhi-ncr.jpg',
    altText: 'Delhi NCR India Gate, Lotus Temple, Gurugram Cyber Hub skyline, and elevated metro corridor',
    caption: 'Cost-optimized Stage C recovery across Gurugram, Kundli, and Noida.',
  },
  {
    num: '04',
    anchorId: 'chennai',
    cityId: 'chennai',
    viewId: 'comparison',
    title: 'Chennai',
    subtitle: 'Sriperumbudur · Ambattur · OMR',
    category: 'Scenario Comparison · F16',
    pinRange: 'PIN 600001–600119',
    bgImage: '/media/cities/chennai.jpg',
    cardImage: '/media/cities/chennai.jpg',
    altText: 'Chennai Marina Beach coastline, Napier Bridge arches, Kapaleeshwarar Temple gopuram, and OMR IT skyline',
    caption: 'Comparative analysis across baseline, shock, and recovered stages.',
  },
  {
    num: '05',
    anchorId: 'guwahati',
    cityId: 'guwahati',
    viewId: 'actionsheet',
    title: 'Guwahati',
    subtitle: 'Amingaon · Beltola · NH-27 Gateway',
    category: 'Verified Action Sheet · F14, F17',
    pinRange: 'PIN 781001–781039',
    bgImage: '/media/cities/guwahati.jpg',
    cardImage: '/media/cities/guwahati.jpg',
    altText: 'Guwahati Saraighat Bridge across the Brahmaputra River with Nilachal Hill and Kamakhya Temple',
    caption: 'Brahmaputra NH-27 gateway recovery with 12-point audit.',
  },
];

const VIEW_TO_ANCHOR: Record<WorkbenchViewId, string> = {
  overview: 'overview',
  simulator: 'simulator',
  planner: 'planner',
  comparison: 'comparison',
  actionsheet: 'action-sheet',
};

export const AurenHomePage: React.FC<AurenHomePageProps> = ({
  enginePage,
  onNavigateLanding,
  activeCityId,
  onSelectCity,
  activeView,
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
  const [revealMode, setRevealMode] = useState<'base' | 'reveal'>('base');

  const navigate = (href: string) =>
    window.dispatchEvent(new CustomEvent('rr:navigate', { detail: { href } }));

  const openWorkbench = (view = activeView, city = activeCityId) =>
    navigate(`/workbench/${VIEW_TO_ANCHOR[view]}?city=${city}`);

  const scrollToCityCorridor = (anchor: string, city: CityId, view: WorkbenchViewId) =>
    navigate(`/home?city=${city}&view=${view}#${anchor}`);

  const dockNavItems: DockItemData[] = useMemo(() => {
    const cityCodes: Record<string, string> = {
      bengaluru: 'BLR',
      mumbai: 'BOM',
      delhi_ncr: 'DEL',
      chennai: 'MAA',
      guwahati: 'GAU',
    };

    const viewItems: DockItemData[] = [
      {
        icon: <LayoutGrid size={15} />,
        label: 'Overview',
        isActive: enginePage && activeView === 'overview',
        onClick: () => openWorkbench('overview'),
      },
      {
        icon: <Zap size={15} />,
        label: 'Simulator',
        isActive: enginePage && activeView === 'simulator',
        onClick: () => openWorkbench('simulator'),
      },
      {
        icon: <SlidersHorizontal size={15} />,
        label: 'Planner',
        isActive: enginePage && activeView === 'planner',
        onClick: () => openWorkbench('planner'),
      },
      {
        icon: <BarChart3 size={15} />,
        label: 'Comparison',
        isActive: enginePage && activeView === 'comparison',
        onClick: () => openWorkbench('comparison'),
      },
      {
        icon: <ClipboardCheck size={15} />,
        label: 'Action Sheet',
        isActive: enginePage && activeView === 'actionsheet',
        onClick: () => openWorkbench('actionsheet'),
      },
    ];

    const cityItems: DockItemData[] = SHOWCASE_ITEMS.map((c, idx) => ({
      icon: (
        <span className="font-auren-mono text-[9px] font-bold tracking-[0.04em]">
          {cityCodes[c.cityId] || c.title.slice(0, 3).toUpperCase()}
        </span>
      ),
      label: c.title,
      ariaLabel: c.title,
      isActive: activeCityId === c.cityId,
      dividerBefore: idx === 0,
      onClick: () => scrollToCityCorridor(c.anchorId, c.cityId, c.viewId),
    }));

    return [...viewItems, ...cityItems];
  }, [activeView, activeCityId, enginePage]);

  return (
    <div
      data-home-root=""
      className="min-h-screen w-full bg-[#F5F5F1] text-[#0b0b0b] font-auren-sans selection:bg-[#cee49f]/30 selection:text-[#101110]"
    >
      {/* =======================================================================
          1. AUREN ARCHITECTURAL NAVIGATION BAR
         ======================================================================= */}
      <header className="sticky top-0 z-40 w-full bg-[#F5F5F1]/90 backdrop-blur-md border-b border-[#101110]/15 px-4 sm:px-10 md:px-14 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
          <button
            type="button"
            onClick={() => enginePage ? navigate(`/home?city=${activeCityId}`) : window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="font-auren-sans text-base sm:text-lg font-bold tracking-[-0.03em] text-[#101110] cursor-pointer flex items-center gap-2 whitespace-nowrap"
          >
            <span>ReverseResilia</span>
          </button>

          <button
            type="button"
            onClick={onNavigateLanding}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 border border-[#101110]/20 bg-white/90 text-[#101110] hover:bg-[#cee49f] hover:text-black transition-colors font-auren-mono text-[10px] uppercase tracking-[0.1em] cursor-pointer whitespace-nowrap"
            title="Return to Herasymenko WebGL Landing Page"
          >
            <span>← Landing (WebGL)</span>
          </button>
        </div>

        <nav
          aria-label="Primary workbench and corridor dock"
          className="hidden lg:flex items-center justify-center"
        >
          <MagnificationDock
            items={dockNavItems}
            panelHeight={44}
            dockHeight={54}
            baseItemSize={32}
            magnification={48}
            distance={130}
            tooltipPosition="bottom"
            ariaLabel="Workbench & corridor magnification dock"
          />
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onNavigateLanding}
            className="sm:hidden px-2 py-1.5 border border-[#101110]/25 text-[#101110] font-auren-mono text-[10px] uppercase cursor-pointer whitespace-nowrap"
          >
            ← WebGL
          </button>
          <button
            type="button"
            onClick={() => openWorkbench('planner')}
            className="auren-btn-pill px-3.5 sm:px-4 py-2 bg-[#101110] text-white hover:bg-[#cee49f] hover:text-black font-auren-sans text-xs font-medium tracking-[-0.01em] cursor-pointer whitespace-nowrap transition-colors shadow-sm"
          >
            Explore Workbench
          </button>
        </div>
      </header>

      {/* =======================================================================
          2. AUREN HERO SECTION (#F5F5F1) WITH 3D FLUTED SPIRAL RIBBON
         ======================================================================= */}
      {enginePage ? (
      <ReverseResiliaWorkbench
        key={activeCityId}
        activeCityId={activeCityId}
        onSelectCity={onSelectCity}
        activeView={activeView}
        onSelectView={openWorkbench}
        network={network}
        scenario={scenario}
        budgetResult={budgetResult}
        onUpdateNetwork={onUpdateNetwork}
        onResetNetwork={onResetNetwork}
        onDefaultShock={onDefaultShock}
        targetServicePct={targetServicePct}
        onChangeTargetServicePct={onChangeTargetServicePct}
        availableBudget={availableBudget}
        onChangeAvailableBudget={onChangeAvailableBudget}
        protectCritical={protectCritical}
        onChangeProtectCritical={onChangeProtectCritical}
        impactResult={impactResult}
        stageAResult={stageAResult}
        stageBResult={stageBResult}
        stageCResult={stageCResult}
        isStale={isStale}
        onRunEngines={onRunEngines}
      />
      ) : (<>
      <section className="relative w-full min-h-[calc(100vh-4rem)] bg-[#F5F5F1] px-5 sm:px-10 md:px-14 pt-8 pb-12 flex flex-col justify-between">
        <div className="max-w-[1440px] w-full mx-auto flex-1 flex flex-col items-center justify-center">
          <SpiralRibbonCanvas
            onClickRibbon={() => openWorkbench('overview')}
            activeCityName={network.name}
            recoveryPct={stageCResult.achievedServicePct}
          />
        </div>

        <div className="max-w-[1440px] w-full mx-auto flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 pt-6">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('auren-editorial');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="font-auren-sans text-xs font-medium tracking-[-0.01em] flex items-center gap-2 text-[#101110]/75 hover:text-black transition-colors cursor-pointer"
          >
            <span>Scroll Down</span>
            <span aria-hidden="true">↓</span>
          </button>

          {/* Quick Interactive Status Bar in Hero */}
          <div className="flex flex-wrap items-center gap-2 font-auren-mono text-[10px] uppercase tracking-[0.12em]">
            <button
              type="button"
              onClick={() => openWorkbench('overview')}
              className="px-3 py-1.5 bg-white/90 border border-[#101110]/20 text-[#101110] hover:border-[#101110] cursor-pointer transition-colors shadow-sm"
            >
              Active: <strong>{network.name}</strong>
            </button>
            <button
              type="button"
              onClick={() => openWorkbench('simulator')}
              className="px-3 py-1.5 bg-white/90 border border-[#cee49f]/40 text-[#101110] hover:border-[#cee49f] cursor-pointer transition-colors shadow-sm"
            >
              Shock: <strong className="text-[#475d2b]">{impactResult.disruptedServicePctBeforeReassignment.toFixed(0)}%</strong>
            </button>
            <button
              type="button"
              onClick={() => openWorkbench('planner')}
              className="px-3 py-1.5 bg-[#101110] text-white hover:bg-[#cee49f] hover:text-black cursor-pointer transition-colors shadow-sm"
            >
              Recovery: <strong>{stageCResult.achievedServicePct.toFixed(0)}%</strong>
            </button>
          </div>

          <div className="text-left sm:text-right max-w-md">
            <h1 className="font-auren-sans text-xl sm:text-2xl md:text-[26px] font-bold leading-[1.08] tracking-[-0.03em] uppercase text-[#101110]">
              ReverseResilia — Resilient Supply Corridors
            </h1>
          </div>
        </div>
      </section>

      {/* =======================================================================
          3. EDITORIAL STATEMENT & QUICK MODULE MATRIX (#FFFFFF)
         ======================================================================= */}
      <section
        id="auren-editorial"
        className="w-full bg-white text-[#0b0b0b] px-5 sm:px-10 md:px-14 py-20 md:py-28 border-t border-[#101110]/15"
      >
        <div className="max-w-[1060px] mx-auto text-center">
          {/* Architectural Monogram */}
          <div className="inline-flex items-center justify-center w-10 h-10 mb-6">
            <svg viewBox="0 0 32 32" className="w-6 h-6 stroke-[#101110]" fill="none" strokeWidth="1.8">
              <path d="M16 4 L6 28 M16 4 L26 28 M9.5 20 Q16 14 22.5 20" />
            </svg>
          </div>

          <p className="font-auren-sans text-2xl sm:text-3xl md:text-[36px] font-medium leading-[1.25] tracking-[-0.025em] text-[#0b0b0b]">
            Our focus is on supply corridors that endure — combining{' '}
            <button
              type="button"
              onClick={() => openWorkbench('overview')}
              className="text-[#101110] underline decoration-[#cee49f]/50 hover:decoration-[#101110] cursor-pointer"
            >
              real PIN precision
            </button>
            ,{' '}
            <button
              type="button"
              onClick={() => openWorkbench('planner')}
              className="text-[#101110] underline decoration-[#cee49f]/50 hover:decoration-[#101110] cursor-pointer"
            >
              two-stage CP-SAT recovery
            </button>
            , and{' '}
            <button
              type="button"
              onClick={() => openWorkbench('actionsheet')}
              className="text-[#101110] underline decoration-[#cee49f]/50 hover:decoration-[#101110] cursor-pointer"
            >
              independent 12-point audits to deliver plans that are effortless to execute.
            </button>
          </p>

          {/* 5 Clickable Feature Pillars mapping directly to Views 01–05 */}
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-5 border border-[#101110]/15 text-left">
            {[
              {
                id: 'overview' as WorkbenchViewId,
                num: '01',
                title: 'Network Overview',
                desc: '5 Indian metros + benchmark with interactive topology.',
              },
              {
                id: 'simulator' as WorkbenchViewId,
                num: '02',
                title: 'Disruption Simulator',
                desc: 'Outages, route closures & zero-intervention recovery.',
              },
              {
                id: 'planner' as WorkbenchViewId,
                num: '03',
                title: 'Recovery Planner',
                desc: 'Target service %, budget cap & CP-SAT solver.',
              },
              {
                id: 'comparison' as WorkbenchViewId,
                num: '04',
                title: 'Scenario Comparison',
                desc: 'Side-by-side Baseline, Shock & Recovered comparisons.',
              },
              {
                id: 'actionsheet' as WorkbenchViewId,
                num: '05',
                title: 'Verified Action Sheet',
                desc: '12-point independent constraint verifier & CSV export.',
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openWorkbench(item.id)}
                className={`p-5 border-b sm:border-b-0 sm:border-r last:border-r-0 border-[#101110]/15 transition-colors cursor-pointer group ${
                  activeView === item.id
                    ? 'bg-[#101110] text-white'
                    : 'bg-[#fafaf7] text-[#0b0b0b] hover:bg-[#f3f4ee]'
                }`}
              >
                <div className={`font-auren-mono text-[10px] uppercase tracking-[0.14em] ${
                  activeView === item.id ? 'text-[#cee49f]' : 'text-[#475d2b]'
                }`}>
                  MODULE {item.num}
                </div>
                <div className="mt-2 font-auren-sans text-base font-bold tracking-[-0.02em]">
                  {item.title}
                </div>
                <p className="mt-1.5 text-xs opacity-80 leading-relaxed">{item.desc}</p>
                <div className="mt-4 font-auren-mono text-[10px] uppercase tracking-[0.12em] flex items-center gap-1">
                  <span>Open View</span>
                  <span className="group-hover:translate-x-1 group-hover:text-[#cee49f] transition-all">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* =======================================================================
          4. SPLIT TYPOGRAPHIC BANNER & BASE/REVEAL HOVER SHOWCASE (#FFFFFF)
         ======================================================================= */}
      <section className="w-full bg-white text-[#0b0b0b] px-5 sm:px-10 md:px-14 pb-24">
        <div className="max-w-[1440px] mx-auto">
          {/* Split Header: CRAFTED WITH CARE / BUILT FOR RECOVERY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-12 items-end">
            <div>
              <h2 className="font-auren-sans text-4xl sm:text-6xl md:text-[72px] font-bold leading-[0.94] tracking-[-0.04em] uppercase text-[#101110]">
                CR<span className="font-auren-serif italic font-light">A</span>FTED W
                <span className="font-auren-serif italic font-light">I</span>TH
                <br />
                C<span className="font-auren-serif italic font-light">A</span>RE
              </h2>
            </div>
            <div className="md:text-right">
              <h2 className="font-auren-sans text-4xl sm:text-6xl md:text-[72px] font-bold leading-[0.94] tracking-[-0.04em] uppercase text-[#101110]">
                BU<span className="font-auren-serif italic font-light">I</span>LT FOR
                <br />
                REC<span className="font-auren-serif italic font-light">O</span>VERY
              </h2>
            </div>
          </div>

          {/* Interactive Base View / Reveal View Image Container */}
          <div
            onMouseEnter={() => setRevealMode('reveal')}
            onMouseLeave={() => setRevealMode('base')}
            className="relative w-full h-[460px] sm:h-[560px] overflow-hidden border border-[#101110]/20 group"
          >
            <img
              src="/media/cities/bengaluru.jpg"
              alt="Bengaluru Baseline Supply Chain Corridor — Vidhana Soudha and UB City Skyline"
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${
                revealMode === 'reveal' ? 'scale-105 opacity-0' : 'scale-100 opacity-100'
              }`}
            />
            <img
              src="/media/cities/mumbai.jpg"
              alt="Mumbai Recovered Corridor Reassignment — Bandra-Worli Sea Link and Port Hub"
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${
                revealMode === 'reveal' ? 'scale-100 opacity-100' : 'scale-105 opacity-0'
              }`}
            />
            <div
              data-media-surface=""
              className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/30"
            />

            {/* Top Center Base View / Reveal View Switcher */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-6 text-white text-xs font-medium">
              <button
                type="button"
                onClick={() => setRevealMode('base')}
                className={`pb-1 cursor-pointer transition-opacity ${
                  revealMode === 'base'
                    ? 'border-b-2 border-[#cee49f] text-white opacity-100 font-semibold'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Base View (Nominal Baseline · {impactResult.baselineServicePct.toFixed(0)}%)
              </button>
              <button
                type="button"
                onClick={() => setRevealMode('reveal')}
                className={`pb-1 cursor-pointer transition-opacity ${
                  revealMode === 'reveal'
                    ? 'border-b-2 border-[#cee49f] text-white opacity-100 font-semibold'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Reveal View (Stage C Recovered · {stageCResult.achievedServicePct.toFixed(0)}%)
              </button>
            </div>

            {/* Bottom Content Overlay */}
            <div className="absolute inset-x-6 sm:inset-x-10 bottom-8 z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6 text-white">
              <div className="max-w-md">
                <div className="font-auren-mono text-[10px] uppercase tracking-[0.16em] text-[#cee49f] mb-2 font-bold">
                  {revealMode === 'base'
                    ? 'STAGE 00 // PRE-DISRUPTION BASELINE TOPOLOGY'
                    : 'STAGE C // GOAL-DRIVEN REASSIGNMENT'}
                </div>
                <p className="text-sm sm:text-base text-white/90 leading-relaxed">
                  {revealMode === 'base'
                    ? 'Anchored in real PIN centroids and OSM highway corridors before disruption.'
                    : `Stage C restores ${stageCResult.achievedServicePct.toFixed(1)}% service at ₹${stageCResult.totalRecoveryCost.toLocaleString('en-IN')} total cost.`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openWorkbench('simulator')}
                className="auren-btn-pill px-5 py-2.5 bg-white text-[#101110] hover:bg-[#cee49f] hover:text-black font-auren-sans text-xs font-semibold tracking-[-0.01em] cursor-pointer self-start sm:self-auto transition-colors shadow-sm"
              >
                Discover Simulator →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =======================================================================
          5. FULL-BLEED BLURRED-BACKDROP CORRIDOR SHOWCASE CARDS (#bengaluru, etc.)
         ======================================================================= */}
      <section id="auren-corridors" className="w-full">
        {SHOWCASE_ITEMS.map((item) => {
          const isSelectedCity = activeCityId === item.cityId;
          return (
            <div
              key={item.num}
              id={item.anchorId}
              onClick={() => openWorkbench(item.viewId, item.cityId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  openWorkbench(item.viewId, item.cityId);
                }
              }}
              className="scroll-mt-16 relative w-full min-h-[680px] sm:min-h-[760px] flex items-center justify-center px-5 sm:px-10 py-16 overflow-hidden cursor-pointer group border-t border-white/15"
            >
              {/* Full-bleed blurred background image */}
              <img
                src={item.bgImage}
                alt={`${item.title} — ${item.subtitle} blurred backdrop`}
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-[14px] brightness-[0.68] transition-transform duration-1000 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/25" />

              {/* Centered Vertical Portrait Card (Exact Auren Layout) */}
              <div className="relative z-10 w-full max-w-[430px] h-[540px] sm:h-[580px] overflow-hidden shadow-2xl auren-card-zoom border border-white/20">
                <img
                  src={item.cardImage}
                  alt={item.altText}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-black/65" />

                <div className="relative z-10 h-full p-7 sm:p-8 flex flex-col justify-between text-white">
                  {/* Top Row: Number & Category */}
                  <div className="flex items-center justify-between text-xs font-medium tracking-[-0.01em]">
                    <span className="font-auren-mono">{item.num}</span>
                    <span className="font-auren-mono text-[11px] uppercase tracking-[0.08em] text-white/85">
                      {item.category}
                    </span>
                  </div>

                  {/* Center Title & Subtitle */}
                  <div className="text-center my-auto">
                    <div className="font-auren-mono text-[10px] uppercase tracking-[0.18em] text-white/75 mb-2">
                      {item.subtitle} · {item.pinRange}
                    </div>
                    <h3 className="font-auren-sans text-4xl sm:text-5xl font-bold tracking-[-0.03em]">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-xs text-white/85 max-w-xs mx-auto leading-relaxed">
                      {item.caption}
                    </p>
                    {isSelectedCity && (
                      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-[#cee49f] text-[#0b0b0b] font-auren-mono text-[10px] uppercase font-bold tracking-[0.12em] rounded-full shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#cee49f] animate-pulse" />
                        Active in Workbench
                      </div>
                    )}
                  </div>

                  {/* Bottom View → Link */}
                  <div className="text-center">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[-0.01em] border-b border-white/60 pb-0.5 group-hover:border-[#cee49f] group-hover:text-[#cee49f] transition-colors">
                      <span>View {item.title} in Workbench</span>
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* =======================================================================
          6. DARK OBSIDIAN METRICS & PROVENANCE GRID (Walnut Base #0b0b0b)
         ======================================================================= */}
      <section className="w-full bg-[#0b0b0b] text-[#F5F4F0] px-5 sm:px-10 md:px-14 py-20 md:py-28 border-t border-[#101110]/30">
        <div className="max-w-[1440px] mx-auto">
          {/* 3-Column Architectural Odometer Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 border-b border-[#101110]/40 pb-12 gap-8">
            <div
              onClick={() => openWorkbench('overview')}
              className="md:border-r border-[#101110]/40 md:pr-8 cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs text-[#cee49f] mb-4">
                <span>Regional Networks</span>
                <span className="font-auren-mono">01</span>
              </div>
              <div className="font-auren-sans text-6xl sm:text-7xl md:text-[80px] font-bold tracking-[-0.04em] leading-none group-hover:text-[#cee49f] group-hover:translate-x-1 transition-all">
                6+1
              </div>
              <p className="mt-3 text-xs text-[#F5F4F0]/70 leading-relaxed">
                5 Indian metros + pan-India and benchmark corridors.
              </p>
            </div>

            <div
              onClick={() => openWorkbench('planner')}
              className="md:border-r border-[#101110]/40 md:px-4 cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs text-[#cee49f] mb-4">
                <span>Two-Stage Solver</span>
                <span className="font-auren-mono">02</span>
              </div>
              <div className="font-auren-sans text-6xl sm:text-7xl md:text-[80px] font-bold tracking-[-0.04em] leading-none group-hover:text-[#cee49f] group-hover:translate-x-1 transition-all">
                {stageCResult.achievedServicePct.toFixed(0)}%
              </div>
              <p className="mt-3 text-xs text-[#F5F4F0]/70 leading-relaxed">
                Stage C recovery for {network.name} solved in {stageCResult.solveTimeMs.toFixed(1)}ms.
              </p>
            </div>

            <div
              onClick={() => openWorkbench('actionsheet')}
              className="md:pl-4 cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs text-[#cee49f] mb-4">
                <span>Independent Verification</span>
                <span className="font-auren-mono">03</span>
              </div>
              <div className="font-auren-sans text-6xl sm:text-7xl md:text-[80px] font-bold tracking-[-0.04em] leading-none group-hover:text-[#cee49f] group-hover:translate-x-1 transition-all">
                {stageCResult.verification.passedCount}/{stageCResult.verification.totalChecks}
              </div>
              <p className="mt-3 text-xs text-[#F5F4F0]/70 leading-relaxed">
                Auditor validating inventory, SLA deadlines, and budget caps.
              </p>
            </div>
          </div>

          {/* 6-Cell Architectural Provenance & Benchmark Grid (3x2) */}
          <div className="pt-16">
            <p className="text-xs text-[#cee49f] mb-8 font-medium">
              Verified Architecture — Select any pillar to inspect live
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-[#101110]/40">
              {[
                {
                  title: 'INDIA PIN GEO-INDEX',
                  sub: 'Scenario Locations',
                  metric: `${new Set([...network.orders, ...network.warehouses].map((s) => s.pincode)).size} distinct PIN codes`,
                  view: 'overview' as WorkbenchViewId,
                  city: activeCityId,
                },
                {
                  title: 'GEOFABRIK OSM & MODELED CORRIDORS',
                  sub: 'Available Transport Options',
                  metric: `${network.transportOptions.length} routes`,
                  view: 'overview' as WorkbenchViewId,
                  city: activeCityId,
                },
                {
                  title: 'STAGE A/B NATURAL RECOVERY',
                  sub: 'Zero-Intervention Reassignment',
                  metric: `${stageBResult.achievedServicePct.toFixed(1)}% @ ₹${stageBResult.transportAssignmentCost.toLocaleString('en-IN')}`,
                  view: 'simulator' as WorkbenchViewId,
                  city: activeCityId,
                },
                {
                  title: 'STAGE C TARGET RECOVERY',
                  sub: 'Priced Emergency Interventions',
                  metric: `Target ${targetServicePct}% · ${stageCResult.solverStatus}`,
                  view: 'planner' as WorkbenchViewId,
                  city: activeCityId,
                },
                {
                  title: `${stageCResult.verification.totalChecks}-POINT INDEPENDENT AUDITOR`,
                  sub: 'Deterministic Pass/Fail Verifier',
                  metric: `Status: ${stageCResult.verification.overallStatus}`,
                  view: 'actionsheet' as WorkbenchViewId,
                  city: activeCityId,
                },
                {
                  title: '10-ORDER KNOWN-ANSWER BENCHMARK',
                  sub: '80% Natural → 100% @ ₹800 Cap',
                  metric: 'Click to Load Benchmark',
                  view: 'planner' as WorkbenchViewId,
                  city: 'known_answer' as CityId,
                },
              ].map((cell, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    openWorkbench(cell.view, cell.city);
                    if (cell.city === 'known_answer') {
                      onChangeTargetServicePct(100);
                      onChangeAvailableBudget(800);
                    }
                  }}
                  className="p-7 border-r border-b border-[#101110]/40 text-left hover:bg-[#191b18] transition-colors cursor-pointer group"
                >
                  <div className="font-auren-mono text-[10px] uppercase tracking-[0.14em] text-[#cee49f]/80">
                    {cell.sub}
                  </div>
                  <div className="mt-3 font-auren-sans text-lg font-bold tracking-[-0.02em] text-white group-hover:text-[#cee49f] transition-colors">
                    {cell.title}
                  </div>
                  <div className="mt-4 font-auren-mono text-xs text-[#F5F4F0]/80 flex items-center justify-between">
                    <span>{cell.metric}</span>
                    <span className="group-hover:text-[#cee49f] group-hover:translate-x-1 transition-all">↗</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      </>)}



      {/* =======================================================================
          8. AUREN ARCHITECTURAL FOOTER
         ======================================================================= */}
      <footer className="w-full bg-black text-[#F5F4F0] border-t border-white/15 px-5 sm:px-10 md:px-14 pt-16 pb-12">
        <div className="max-w-[1440px] mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <div className="font-auren-mono text-[10px] uppercase tracking-[0.16em] text-[#cee49f] mb-3 font-semibold">
              RUNTIME REBELS // COLOSSUS 3.0 OPEN INNOVATION
            </div>
            <h2 className="font-auren-sans text-4xl sm:text-6xl font-bold tracking-[-0.04em] leading-[0.95] uppercase text-white">
              YOUR RESILIENT
              <br />
              SUPPLY NETWORK
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href={`/workbench/${VIEW_TO_ANCHOR[activeView]}?city=${activeCityId}`}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  openWorkbench(activeView);
                }}
                className="auren-btn-pill px-6 py-3 bg-[#101110] text-white hover:bg-[#cee49f] hover:text-black font-auren-sans text-xs font-medium cursor-pointer inline-flex items-center gap-2 transition-colors shadow-sm"
              >
                <span>Open workbench</span>
                <span aria-hidden="true">↗</span>
              </a>
              <button
                type="button"
                onClick={() => openWorkbench('actionsheet')}
                className="auren-btn-pill px-6 py-3 border border-white/25 bg-transparent text-white font-auren-sans text-xs font-medium cursor-pointer hover:bg-white hover:text-black transition-colors shadow-sm"
              >
                Inspect Verified Action Sheet
              </button>
              <button
                type="button"
                onClick={onNavigateLanding}
                className="auren-btn-pill px-6 py-3 border border-white/25 bg-transparent text-white font-auren-sans text-xs font-medium cursor-pointer hover:bg-white hover:text-black transition-colors shadow-sm"
              >
                Return to ReverseResilia Landing Page
              </button>
            </div>
          </div>

          <div className="mt-16 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/60">
            <div>© 2026 ReverseResilia</div>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-[#cee49f] cursor-pointer font-medium transition-colors"
            >
              Back to Top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
