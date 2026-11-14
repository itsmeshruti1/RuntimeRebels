# ReverseResilia

**Goal-Driven Supply Chain Recovery**  
*Recover to a target. And prove it holds.*

**Team Runtime Rebels · Colossus 3.0 · Open Innovation**

## Overview

ReverseResilia models supply-chain disruptions, computes recovery plans against a service target and budget, and independently checks assignments and resource constraints. The application combines a WebGL landing page with a city showcase and five dedicated Engine pages.

Regional scenarios cover Bengaluru, Mumbai, Delhi NCR, Chennai, and Guwahati. Pan-India Multi-City and a deterministic 10-order benchmark are also available.

## Run locally

Install Node.js 22.12 or newer and Git, then run:

```bash
git clone https://github.com/itsmeshruti1/RuntimeRebels.git
cd RuntimeRebels
npm ci
npm run build
npm start
```

Open http://localhost:3000. Keep the terminal running while using the application.

On Windows, after installing dependencies and building, double-click **START-LOCAL.cmd** to use http://127.0.0.1:4173 instead. The launcher keeps startup errors visible. Stop the server with Ctrl+C. If a port is occupied, stop its existing server or choose another PORT environment variable before starting.

For live development, run `npm run dev`. The Express server serves the frontend and API together on port 3000.

Only AI-assisted warehouse extraction requires a Gemini API key. Copy `.env.example` to `.env` and set GEMINI_API_KEY to enable that feature. CSV imports and the recovery planner work without an AI key. Keep credentials out of version control.

## Pages and capabilities

| Page | URL | Features |
| --- | --- | --- |
| Landing | / | WebGL gallery, orbit and slider experiences |
| Home | /home | Platform introduction and city corridors |
| Network Overview | /workbench/overview | Editable warehouses, customer orders, maps, network import and scenario management |
| Disruption Simulator | /workbench/simulator | Warehouse outages, route closures, resource changes and immediate impact |
| Recovery Planner | /workbench/planner | Service targets, budgets, critical-order protection and permitted interventions |
| Scenario Comparison | /workbench/comparison | Baseline, disrupted and recovered results |
| Verified Action Sheet | /workbench/action-sheet | Order-level assignments, independent checks and CSV export |

Add `?city=bengaluru`, `?city=mumbai`, `?city=delhi_ncr`, `?city=chennai`, `?city=guwahati`, `?city=multi_city` or `?city=known_answer` to a feature URL. Feature navigation retains the selected scenario. Local browser storage saves scenarios, and JSON export supports portable copies.

## Recovery workflow

1. Select a city and inspect or edit warehouses, stock, capacity, orders and transport options.
2. Simulate disruptions and inspect immediate impact.
3. Review maximum natural recovery using surviving resources.
4. Set the required service percentage, budget and permitted interventions.
5. Compare the recovery stages and inspect independent verification.
6. Export the order-level action sheet or scenario JSON.

The TypeScript engine uses successive shortest-path assignment and branch-and-bound optimization. Stage A maximizes natural recovery, Stage B minimizes its cost, and Stage C searches for a target-compliant recovery plan with eligible interventions. Inventory, processing capacity, route availability, timing and critical-order policies constrain the result.

A separate verifier checks the modeled plan. The interface reports infeasibility, budget shortfalls and stale calculations.

## Implementation

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Visuals and interaction | WebGL/Three.js, GSAP, Motion, canvas, Lucide icons |
| Server | Express, TypeScript through tsx |
| Recovery | TypeScript solver, browser worker and independent verifier |
| Persistence | Browser-local scenarios and JSON import/export |
| Optional extraction | Google Gemini API |

```text
src/
  components/       Landing, home, Engine views and shared controls
  data/             Regional scenarios and source-audit metadata
  engine/           Solver, budget analysis, validation, routes and verifier
  types/            Recovery data types
  utils/            Warehouse import utilities
public/             Fonts, images, WebGL scripts and styles
tests/browser.cjs   End-to-end browser checks
server.ts           Express API and frontend server
START-LOCAL.cmd     Windows launcher on port 4173
```

## Checks

```bash
npm run build
npm run lint
node --import tsx --test src/engine/*.test.ts src/utils/*.test.ts
node tests/browser.cjs --production
```

The lint script performs TypeScript checking. Browser checks require Playwright Chromium installed with `npx playwright install chromium`. PLAYWRIGHT_EXECUTABLE_PATH can select an existing compatible browser.

During development, the build, type check, 38 automated tests, and desktop/mobile browser flow passed. Browser checks covered landing modes, JSON validation, order editing, routes, planning, comparison, audit, CSV export, city switching and feature-page navigation. Later localhost checks were blocked by the execution environment, so startup output alone does not establish browser reachability on another machine.

## Data assumptions and limitations

Regional scenarios combine geographic references with modeled warehouses, orders, inventory, capacity, deadlines and INR prices. Review the source-audit metadata and route assumptions when interpreting results. PIN reference coordinates do not establish actual customer or facility addresses, and modeled travel times do not represent live traffic.

A verified plan satisfies the implemented model under its inputs and assumptions. Actual delivery outcomes depend on operational conditions. A requested target can be infeasible.

Raw geographic extracts and original design reference archives are outside the application source. Installed dependencies, generated builds and environment credentials are excluded from this repository.

## Team

- Shruti Talikoti
- Priyesh Raj
- Shrinidhi Hebbar P M

## Attribution and licensing

The project includes third-party libraries, visual assets and fonts from the supplied project. Review their respective licenses before redistribution or commercial use. Attribute OpenStreetMap contributors where OSM-derived data or maps are used. A project-wide license has not been selected by the team.
