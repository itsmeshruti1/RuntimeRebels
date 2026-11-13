# ReverseResilia

**Goal-Driven Supply Chain Recovery**  
*Recover to a target. And prove it holds.*

**Team Runtime Rebels · Colossus 3.0 · Open Innovation**

> **Project status:** Hackathon project / implementation in progress. This README describes the agreed product specification. Features, commands, and benchmarks should be marked complete **only after they have been implemented and verified in this repository**.

## Overview

ReverseResilia is a proposed local-first decision-support platform for evaluating supply-chain disruptions and finding feasible recovery plans. It aims to answer three practical questions:

1. **What percentage of customer orders can still be delivered on time** using the surviving warehouses and their existing resources?
2. **What is the lowest modeled cost of reaching a chosen service target**, including 100% when possible?
3. **Does the proposed plan satisfy inventory, capacity, transport, and delivery constraints?**

A planner selects a regional network, simulates a disruption, reviews affected orders and maximum recoverable service, sets a target and budget, and evaluates an optimized recovery plan. A separate checker then validates the plan under its stated assumptions.

The project focuses on **Bengaluru, Mumbai, Delhi NCR, Chennai, and Guwahati**, using one common optimization model across five regional datasets.

## The problem

A warehouse outage, transport-lane closure, or processing-capacity reduction can put customer deliveries at risk. Even when other warehouses have spare inventory, a recovery plan must still respect order demand, available handling capacity, transport eligibility, deadlines, and costs.

Businesses need more than a map of disruptions: they need to understand **how much service is recoverable**, **what extra resources would cost**, and **which proposals are actually feasible**.

## Proposed workflow

```text
Select city
   ↓
Inspect or edit the supply network
   ↓
Simulate a warehouse outage, lane closure, or capacity reduction
   ↓
Measure immediate impact and maximum natural recovery
   ↓
Set on-time delivery target, budget, and permitted interventions
   ↓
Find a cost-minimized recovery plan (or report infeasibility)
   ↓
Independently verify assignments, constraints, and costs
   ↓
Compare scenarios and export an action sheet
```

### Core capabilities — agreed MVP scope

| Area | Planned functionality |
| --- | --- |
| Network setup | Five-city selector; editable warehouses, stock, processing capacity, orders, deadlines, priorities, and transport options |
| Data quality | Validated bundled JSON; CSV import where feasible; clear missing/invalid/duplicate record errors |
| Visualization | Interactive regional network view with facilities, customers, links, disruptions, and relevant KPIs |
| Disruption analysis | Warehouse outages, lane/transport-option closures, processing-capacity reductions, and immediate impact on existing orders |
| Natural recovery | Maximum on-time service using **existing** resources and a least-cost plan preserving that maximum |
| Target recovery | User-selected service target (0–100%), budget comparison, priority protection, and cost minimization |
| Priced interventions | Explicitly modeled emergency-stock, extra-handling, and transport-capacity/eligibility packages |
| Explainability | Unfulfilled orders, supported constraint explanations, accurate infeasibility and solver-status reporting |
| Independent verification | Separate checks of assignments, stock, capacity, eligible routes, timing, priorities, interventions, and cost |
| Decisions and reporting | Baseline vs. disrupted vs. recovered comparison; order-level recovery action sheet and CSV export |
| Usability | Responsive controls, loading/error states, repeatable runs, and invalidation of stale results |

**Optional after the MVP is stable:** a cost-versus-service curve, a fair greedy-baseline comparison, a PDF verification certificate, and saved scenario replay.

**Out of scope for the first version:** live GPS, real-time traffic promises, automatic dispatch, detailed multi-stop truck routing, ERP/WMS connectors, supplier-risk graphs, driver apps, and instantaneous intercity fulfillment.

## How recovery optimization is intended to work

ReverseResilia uses a three-stage integer optimization formulation:

- **Stage A — Maximum natural recovery:** maximize fully served, on-time orders using surviving resources **without** emergency packages.
- **Stage B — Cheapest natural plan:** minimize assignment cost while preserving the proven maximum service from Stage A.
- **Stage C — Target-based recovery:** minimize modeled assignment and allowed-intervention costs while enforcing the requested service target.

Each order is indivisible in the MVP, with one order per customer. Constraints cover unique assignment, inventory, warehouse processing capacity, available facilities and transport options, modeled delivery deadlines, selected interventions, and mandatory critical-order policies when enabled.

A **100% target is not guaranteed**. If the model cannot achieve it, the application must report the actual solver outcome and supported reasons. A result should be called a **proven minimum** only when the solver establishes optimality; an unproven feasible solution is not the same thing.

**Budget interpretation:** determine the lowest target-compliant cost when possible, then compare that value with the entered budget. Financial shortfall and physical infeasibility are different outcomes.

**Verification:** a separate checker recomputes resource use, assignments, timing, and costs from the validated inputs. Passing the checker verifies the modeled constraints, **not** actual future delivery performance or global optimality.

## Data strategy: real geography, simulated operations

The intended datasets combine real geographic references with transparently simulated logistics operations.

| Input | Intended origin | How it is described |
| --- | --- | --- |
| Road segments | OpenStreetMap PBF regional extracts | **Sourced geography** |
| PIN reference coordinates | Indian PIN-code directory | **Sourced geography** (not verified delivery addresses) |
| Warehouse and order locations | Simulated entities positioned at valid PIN coordinates | **Simulated operations** |
| Inventory, handling capacity, demand, deadlines, and INR prices | Editable, deterministically generated test data | **Simulated operations** |
| Road-network distance | Shortest path through eligible drivable roads | **Derived from sourced geography** |
| Travel-time estimate | Road distance combined with documented speed/handling assumptions | **Derived + simulated assumptions** |
| Recovery percentage and plan cost | Current validated input processed by solver | **Computed model result** |

### Expected local source files

These filenames are specified by the project plan. **Their presence, contents, geographic coverage, and licenses must be verified in the actual workspace** before claiming they were processed.

```text
data/raw/
├── southern-zone-261112.osm.pbf        # Bengaluru / Chennai region
├── western-zone-261112.osm.pbf         # Mumbai region
├── northern-zone-261112.osm.pbf        # Delhi NCR region
├── north-eastern-zone-261112.osm.pbf   # Guwahati region
└── pincode.csv                         # Indian PIN reference coordinates
```

Preprocessing should extract relevant city road geometry, retain suitable drivable ways and required nodes, build a directed graph, snap valid PIN reference points, compute **reachable road-network distances**, and cache warehouse-to-order distance matrices. No route should be invented for an unreachable pair. Travel times are estimates from explicit assumptions, **not live traffic observations**.

The four PBF files are large. **Do not commit raw PBFs to GitHub.** Store them outside version control and document how to obtain or supply them. Keep only reasonably sized processed data that can legally be redistributed. Add attribution and review the applicable OSM/other data licenses before publishing extracts or coordinates.

## Planned technology

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, JavaScript; CSS/Tailwind according to the supplied UI template |
| Backend | Python, FastAPI, Pydantic |
| Optimization | Google OR-Tools CP-SAT |
| Geographic preprocessing | Osmium and a local drivable-road graph / shortest-path implementation |
| Data storage | Local JSON, optionally SQLite for saved runs |
| Visualization | Interactive network/map with offline SVG or table fallback |
| Testing | pytest, API integration tests, frontend build and manual end-to-end checks |
| Deployment | Localhost; no required paid services |

The visual implementation is intended to follow the supplied UI reference, including observable navigation, scrolling, transitions, hover effects, and responsive behavior, while keeping all controls functional.

## Repository structure (target)

```text
reverse-resilia/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── api.js
│       └── App.jsx
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── schemas.py
│   │   ├── dataset.py
│   │   ├── disruptions.py
│   │   ├── solver.py
│   │   ├── verifier.py
│   │   └── reporting.py
│   ├── data/
│   ├── tests/
│   └── requirements.txt
├── data/
│   └── raw/                    # Not committed to Git
├── docs/
│   └── assumptions.md
└── README.md
```

*This is a target layout, not a claim that these directories already exist.*

## Local development (once implementation files exist)

**Prerequisites:** supported Python, Node.js/npm, Git, and Osmium for source-data processing.

Backend, from the repository root:

```bash
cd backend
python -m venv .venv
# Activate your virtual environment using the command for your OS.
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Frontend, in a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Typical local endpoints are `http://127.0.0.1:8000/docs` for FastAPI and `http://localhost:5173` for Vite. **These are expected commands/paths only: update them to match the verified repository before claiming the app runs.**

A correct first run will also require either processed city datasets or a completed preprocessing flow that uses the actual source files.

## Testing and reproducibility

The intended test suite checks:

- A known 10-order fixture: with one failed warehouse, surviving processing capacity permits **8/10 orders (80%)**; two specifically modeled capacity packages can unlock **10/10 (100%)** with **₹800 in package fees**, excluding delivery costs.
- Warehouse outage, transport closure, reduced stock/capacity, missed deadlines, critical-order policies, and invalid imports.
- Budget shortfall versus target infeasibility.
- Actual CP-SAT statuses: `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNKNOWN`, `MODEL_INVALID`.
- Rejection of deliberately corrupted plans by an independent verifier.
- Consistency across five city datasets and recomputation after input edits.
- UI navigation, scrolling, template-matched interactions, and offline operation.

When the test suite is implemented, run from `backend/`:

```bash
python -m pytest -q
```

**No tests or performance results are claimed in this README until run logs exist.** Record actual benchmark data and test outcomes after implementation.

## A planned demo scenario

1. Select **Bengaluru** and inspect the regional network.
2. Disable a warehouse and view immediately affected customer orders.
3. Run **maximum existing-resource recovery**; inspect the computed service percentage.
4. Request **100% service** and allow priced interventions.
5. Inspect the selected recovery plan or the accurate infeasibility result.
6. Open the independent verification checks.
7. Change a warehouse capacity or price and rerun to demonstrate genuine recalculation.
8. Compare scenarios and export the action sheet.

## Limitations and data integrity

- Geography may be real, but warehouses, customers, stock, demand, prices, and delivery times in the hackathon scenarios are **modeled**, not validated operational records.
- PIN-code reference points do not establish real facility or customer addresses.
- Road-network distances depend on extract coverage, graph connectivity, and snapping assumptions.
- Estimated travel time is not live traffic information.
- The initial model does not perform full vehicle-route sequencing or instant intercity restocking.
- A mathematical feasibility check is not a guarantee of real-world delivery.
- Features listed above are project requirements until completion is verified in the repository.

## Team

**Runtime Rebels** — Colossus 3.0, Open Innovation

- Shruti Talikoti
- Priyesh Raj
- Shrinidhi Hebbar P M

## Attribution and licensing

The project plans to use openly licensed software such as React, FastAPI, and Google OR-Tools, and may include data derived from OpenStreetMap. Follow each dependency's license, credit OSM contributors where appropriate, and verify redistribution rights for the PIN-code dataset. Do **not** add a project-wide open-source license until the team has selected one.

---

**ReverseResilia — Recover to a target. And prove it holds.**