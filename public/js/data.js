export const SLIDES = [
  {
    id: 'bengaluru',
    title: ['Bengaluru', 'Corridor'],
    category: '01 Network Overview · Bengaluru',
    year: '2026',
    targetView: 'overview',
    targetCity: 'bengaluru',
    targetHash: '#bengaluru',
    alt: 'Bengaluru skyline with Vidhana Soudha, UB City tower, and Cubbon Park canopy at golden hour',
    media: { type: 'image', src: '/media/cities/bengaluru.jpg', width: 1408, height: 792 },
    zoom: 1,
    layout: { title: -85, meta: 133 },
    work: {
      overview:
        'Real-geography supply chain topology across Bengaluru (PIN 560001–560100: Whitefield, Peenya, Electronic City). Positioned using sourced Indian PIN-code centroids and Geofabrik Southern Zone OSM arterial road graphs with editable warehouse inventory, processing capacity, and provenance tracking.',
      cover: { src: '/media/cities/bengaluru.jpg', width: 1408, height: 792 },
      info: [
        { key: 'A', label: 'Module', value: 'View 01 — Network Overview (F01–F04)' },
        { key: 'B', label: 'Primary Hub', value: 'Bengaluru (560001–560100) · Southern Zone' },
        { key: 'C', label: 'Provenance', value: 'Sourced OSM + PIN / Simulated Ops' },
        { key: 'D', label: 'City Corridor', value: 'Open Bengaluru Corridor on Home', arrow: true, href: '/home?city=bengaluru&view=overview#bengaluru' },
        { key: 'E', label: 'Network View', value: 'Open Network Overview Workbench', arrow: true, href: '/home?city=bengaluru&view=overview#overview' },
        { key: 'F', label: 'Next Stage', value: 'Launch Disruption Simulator', arrow: true, href: '/home?city=bengaluru&view=simulator#simulator' },
      ],
      media: [],
    },
  },
  {
    id: 'mumbai',
    title: ['Mumbai', 'Port Hub'],
    category: '02 Disruption Simulator · Mumbai',
    year: '2026',
    targetView: 'simulator',
    targetCity: 'mumbai',
    targetHash: '#mumbai',
    alt: 'Mumbai Bandra-Worli Sea Link cable-stayed bridge and South Mumbai skyscraper skyline over the Arabian Sea',
    media: { type: 'image', src: '/media/cities/mumbai.jpg', width: 1408, height: 792 },
    zoom: 1,
    layout: { title: -85, meta: 133 },
    work: {
      overview:
        'Interactive disruption stress-testing for Mumbai Western Zone (JNPT Nhava Sheva, Bhiwandi Mega-Hub, Andheri MIDC). Computes immediate affected customer orders (F06) and solves Stage A/B Maximum & Cheapest Natural Recovery without emergency spend (F07, F10).',
      cover: { src: '/media/cities/mumbai.jpg', width: 1408, height: 792 },
      info: [
        { key: 'A', label: 'Module', value: 'View 02 — Disruption Simulator (F05–F07, F10)' },
        { key: 'B', label: 'Natural Recovery', value: '80.0% Proven Max Service (Stage A/B)' },
        { key: 'C', label: 'Regional Grid', value: 'Mumbai Western Corridor (400001–400708)' },
        { key: 'D', label: 'City Corridor', value: 'Open Mumbai Corridor on Home', arrow: true, href: '/home?city=mumbai&view=simulator#mumbai' },
        { key: 'E', label: 'Simulate Outage', value: 'Open Disruption Simulator Workbench', arrow: true, href: '/home?city=mumbai&view=simulator#simulator' },
        { key: 'F', label: 'Optimize', value: 'Proceed to Target Recovery Planner', arrow: true, href: '/home?city=mumbai&view=planner#planner' },
      ],
      media: [],
    },
  },
  {
    id: 'delhi-ncr',
    title: ['Delhi NCR', 'Multi-State'],
    category: '03 Recovery Planner · Delhi NCR',
    year: '2026',
    targetView: 'planner',
    targetCity: 'delhi_ncr',
    targetHash: '#delhi-ncr',
    alt: 'Delhi NCR ceremonial axis with India Gate, Lotus Temple, Gurugram Cyber Hub skyline, and elevated metro corridor',
    media: { type: 'image', src: '/media/cities/delhi-ncr.jpg', width: 1408, height: 792 },
    zoom: 1,
    layout: { title: -85, meta: 133 },
    work: {
      overview:
        'Goal-driven Stage C minimum-cost recovery optimization across Delhi NCR (Okhla, Gurugram NH-48, Noida Sector-62, Kundli). Enforces user-selected on-time service targets up to 100%, evaluates priced stock and handling-capacity interventions, protects critical orders, and separates budget shortfall from physical infeasibility.',
      cover: { src: '/media/cities/delhi-ncr.jpg', width: 1408, height: 792 },
      info: [
        { key: 'A', label: 'Module', value: 'View 03 — Recovery Planner (F08, F09, F11–F13, F15)' },
        { key: 'B', label: 'Regional Grid', value: 'Delhi NCR Northern Zone (110001–201301)' },
        { key: 'C', label: 'Solver Engine', value: 'Exact Branch-and-Bound / CP-SAT Model' },
        { key: 'D', label: 'City Corridor', value: 'Open Delhi NCR Corridor on Home', arrow: true, href: '/home?city=delhi_ncr&view=planner#delhi-ncr' },
        { key: 'E', label: 'Open Planner', value: 'Launch Stage C Target Optimizer', arrow: true, href: '/home?city=delhi_ncr&view=planner#planner' },
        { key: 'F', label: 'Compare States', value: 'View Scenario Comparison', arrow: true, href: '/home?city=delhi_ncr&view=comparison#comparison' },
      ],
      media: [],
    },
  },
  {
    id: 'chennai',
    title: ['Chennai', 'Coastal Grid'],
    category: '04 Scenario Comparison · Chennai',
    year: '2026',
    targetView: 'comparison',
    targetCity: 'chennai',
    targetHash: '#chennai',
    alt: 'Chennai Marina coastline, Napier Bridge arches, Kapaleeshwarar Temple gopuram, and OMR IT corridor skyline',
    media: { type: 'image', src: '/media/cities/chennai.jpg', width: 1408, height: 792 },
    zoom: 1,
    layout: { title: -85, meta: 133 },
    work: {
      overview:
        'Side-by-side operational comparison across Chennai (Sriperumbudur NH-48, Ambattur Industrial Estate, OMR Sholinganallur): Baseline Network, Disrupted (Before Reassignment), Stage A/B Natural Recovery, and Stage C Target Recovery.',
      cover: { src: '/media/cities/chennai.jpg', width: 1408, height: 792 },
      info: [
        { key: 'A', label: 'Module', value: 'View 04 — Scenario Comparison (F16)' },
        { key: 'B', label: 'States Compared', value: 'Baseline vs Disrupted vs Natural vs Target' },
        { key: 'C', label: 'Regional Grid', value: 'Chennai Coastal & OMR Corridor (600001–600119)' },
        { key: 'D', label: 'City Corridor', value: 'Open Chennai Corridor on Home', arrow: true, href: '/home?city=chennai&view=comparison#chennai' },
        { key: 'E', label: 'Open Comparison', value: 'Inspect Multi-State Comparison Matrix', arrow: true, href: '/home?city=chennai&view=comparison#comparison' },
        { key: 'F', label: 'Verify Plan', value: 'Proceed to Independent Verification', arrow: true, href: '/home?city=chennai&view=actionsheet#action-sheet' },
      ],
      media: [],
    },
  },
  {
    id: 'guwahati',
    title: ['Guwahati', 'Gateway'],
    category: '05 Verified Action Sheet · Guwahati',
    year: '2026',
    targetView: 'actionsheet',
    targetCity: 'guwahati',
    targetHash: '#guwahati',
    alt: 'Guwahati Saraighat Bridge spanning the Brahmaputra River with Nilachal Hill and Kamakhya Temple dome',
    media: { type: 'image', src: '/media/cities/guwahati.jpg', width: 1408, height: 792 },
    zoom: 1,
    layout: { title: -85, meta: 133 },
    work: {
      overview:
        'Independent 12-point plan verification engine and order-level recovery action sheet (F14, F17) across Guwahati North-Eastern Zone (Amingaon Rail-Logistics Hub, Beltola NH-27, Jalukbari). Recomputes order uniqueness, warehouse availability, stock, handling capacity, route eligibility, deadlines, and costs from raw inputs.',
      cover: { src: '/media/cities/guwahati.jpg', width: 1408, height: 792 },
      info: [
        { key: 'A', label: 'Module', value: 'View 05 — Verified Recovery Action Sheet (F14, F17)' },
        { key: 'B', label: 'Audit Engine', value: '12/12 Independent Constraint Checks' },
        { key: 'C', label: 'Regional Grid', value: 'Guwahati Brahmaputra NH-27 (781001–781039)' },
        { key: 'D', label: 'City Corridor', value: 'Open Guwahati Corridor on Home', arrow: true, href: '/home?city=guwahati&view=actionsheet#guwahati' },
        { key: 'E', label: 'Open Action Sheet', value: 'Inspect Assignments & Export CSV', arrow: true, href: '/home?city=guwahati&view=actionsheet#action-sheet' },
        { key: 'F', label: 'Benchmark Audit', value: 'Run Deliberate Plan Corruption Test', arrow: true, href: '/home?city=known_answer&view=actionsheet#action-sheet' },
      ],
      media: [],
    },
  },
];

const CITY_TILE_SRCS = [
  '/media/cities/bengaluru.jpg',
  '/media/cities/mumbai.jpg',
  '/media/cities/delhi-ncr.jpg',
  '/media/cities/chennai.jpg',
  '/media/cities/guwahati.jpg',
];

export const PRELOADER_TILES = Array.from(
  { length: 20 },
  (_, i) => CITY_TILE_SRCS[i % CITY_TILE_SRCS.length],
);

export const meta = (slide) => `${slide.category} / ${slide.year}`;
