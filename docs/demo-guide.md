# FreshPlate Demo Guide

[Back to the project homepage](../README.md)

This guide covers the planning rules, state transitions, local checks, Replit reproduction steps and a two-minute presentation.

## Demo inputs and recipes

The fixed planning date is **October 21, 2026 (2026-10-21)**. Eight ingredient types appear across eleven batches. Earlier/later egg and chicken batches demonstrate allocation order; an expired tomato batch demonstrates exclusion.

Edit `src/demoInputs.js` for stock, existing-order `reserved` quantities, use-by dates and owner-supplied `extraPrepCaps`. Keep mass in kg with at most three decimal places and eggs in whole pieces (`pcs`). Caps must be non-negative whole servings; zero disables a dish. Oil, salt and other seasonings are assumed sufficient.

Per-serving recipes and their allocation order are defined in `src/recipes.js`:

| Order | Dish | Main ingredients per serving |
| --- | --- | --- |
| 1 | Tomato & Egg Stir-fry | Tomatoes 0.2 kg; eggs 2 pcs |
| 2 | Pepper Chicken | Green peppers 0.12 kg; chicken 0.15 kg |
| 3 | Potato Chicken Stew | Potatoes 0.25 kg; chicken 0.2 kg; carrots 0.05 kg |
| 4 | Stir-fried Cabbage | Chinese cabbage 0.2 kg |
| 5 | Egg Fried Rice | Cooked rice 0.25 kg; eggs 1 pc; carrots 0.04 kg |

## Detailed allocation rules

`src/planner.js` exports the pure `generatePlan` function used by both the web workflow and the CLI.

1. Validate batches. Exclude impossible dates, negative or non-finite quantities, inconsistent units, excessive reservations and duplicate batch IDs, with reasons. Past-use-by batches are also excluded.
2. Treat dates from the demo date through two days ahead as priority, including both boundaries. For the supplied demo this is **October 21–23**. Later eligible batches may supply supporting ingredients.
3. Build one shared budget from stock minus total reservations. Convert kg to integer grams for arithmetic; keep eggs in whole pieces. Never add different ingredients or units into a ranking score.
4. Process priority batches by earliest use-by date, breaking ties by batch ID. For each batch, try the displayed recipe order.
5. Allocate one whole serving at a time only while it consumes priority stock, every ingredient is available and the owner cap permits it. Immediately reduce the shared budget. Within each ingredient, use earliest-expiring eligible batches first.
6. Return servings, reasons, final limiting factors, per-dish allocations, batch projections and unallocated priority stock. Generation never modifies the supplied inventory or reservations.

This deterministic heuristic is not globally optimal; recipe order affects results. It does not model staffing, equipment, profitability, food safety or demand.

### Interpreting quantities

- Total reserved = existing-order reservations + active-plan reservations.
- Available = stock − total reserved.
- Planned projected stock = source stock − planned use.
- Planned unallocated quantity = projected stock − source reservations.

**Planned** values are generation-time estimates. **Recorded consumption** comes only from successful completion records. Counts of priority batches use unique batch IDs; ingredient quantities remain separate by batch and unit.

With unchanged sample inputs:

| Dish | Default caps | Tomato-egg cap = 0 |
| --- | ---: | ---: |
| Tomato & Egg Stir-fry | 16 | 0 |
| Pepper Chicken | 12 | 12 |
| Potato Chicken Stew | 9 | 9 |
| Stir-fried Cabbage | 16 | 16 |
| Egg Fried Rice | 8 | 8 |
| Total servings | 61 | 45 |

The stew stops after its priority chicken is allocated; later chicken alone does not justify further servings. The eligible tomato batch's planned use changes from 3.2 kg to 0 kg, leaving 1.8 kg versus 5 kg unallocated after reservations. Expired tomatoes are excluded in both scenarios.

## State transitions and browser storage

Every plan has a unique ID and saved recipe, portion and batch-allocation snapshots. Later actions use those snapshots rather than recalculating a different plan.

| State | Inventory effect and next action |
| --- | --- |
| Draft | No stock or reservation changes. Review and approve; empty or stale drafts cannot be approved. |
| Approved | Validate all affected batches, then reserve all quantities together. Stock and order reservations remain unchanged. Complete or cancel before generating another draft. |
| Completed | Deduct approved quantities once and release only that plan's reservations. Original-order reservations remain unchanged. Completion cannot repeat, and the plan cannot be cancelled. |
| Cancelled | Release the plan's reservations without changing stock or order reservations. Cancellation cannot repeat; generate a new plan to restart. |

Changing caps or inventory makes older drafts stale. Editing caps after approval applies to the next draft, leaving the approved snapshot unchanged. Generation during an active approved plan is blocked without creating another plan or log entry. Multi-batch validation must succeed before any inventory update is published.

Inventory, plans, owner inputs and Activity Log are stored as one versioned localStorage value under `freshplate-demo`. Loading checks snapshots, transitions, logged changes and resulting reservations for consistency. Invalid or unsupported data is left untouched; the user must retry loading or explicitly reset. Failed saves do not publish a successful operation.

Activity Log records successful plan creation and transitions. Drafts record no inventory changes; approval and cancellation show reservations; completion records actual stock deduction. Operation timestamps are actual instants displayed in the browser's timezone, separate from the fixed planning date.

Use **Demo settings → Reload Saved Demo** to retry loading. **Reset Demo** opens a confirmation dialog; Cancel or Esc preserves data, while confirmation restores initial inventory and clears plans and records. Storage belongs to the browser and origin, so changing the host or port uses different saved data. Use one tab; detected conflicts require a reload.

## Local checks and production preview

Run these commands from the full project root in Windows PowerShell:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`build` writes `dist/`. `preview` serves that production build at **http://127.0.0.1:4173/**; Ctrl+C stops it. Development uses port 5173. Both commands use strict ports; if development port 5173 is occupied, select another explicitly:

```powershell
npm.cmd run dev -- --port 5174
```

For Gemini import, use `npm.cmd run dev:full` instead. It serves the frontend and the same `/api/extract` handler used by Vercel; `dev` and `preview` serve only frontend assets. Use `npm.cmd run dev:full -- --port 5174` if needed, remembering that browser storage is separate per origin. See [AI Import Setup](ai-import.md).

The automated suite covers:

- `src/planner.test.js`: shared ingredients, reservations, date boundaries, expired/invalid batches, zero/invalid caps, determinism and non-mutation.
- `src/workflow.test.js`: approval, completion, cancellation, repeated-action guards, stale drafts, active-plan generation blocking, atomic failures and save/restore consistency.
- `src/planSummary.test.js`: deduplicated batch counts and recorded-versus-planned summaries.
- `demo/demo.test.js`: full CLI/web snapshot parity for both scenarios, input isolation, reporting and the dependency-free seven-file upload.
- `src/dataEntry.test.js`: manual import, explicit units, duplicate confirmation, custom catalogs, planning dates and safe version-1 migration. See [Stock & Recipe Entry](data-entry.md) for the current workflow and persistence schema.
- `src/extraction.test.js`: mocked Gemini responses, schema/semantic validation, safe diagnostics, API failures, limits and the shared local HTTP endpoint.
- `src/importReview.test.js`: actionable review issues, date normalization, leap years, timezone independence, calculation confirmation and non-mutating previews.
- `src/presentation.test.js`: rendered labels, ingredient icons, batch presentation, native date inputs and duplicate-alert visibility; image-processing checks use controlled fixtures.

The owner has reported manual acceptance of the current functionality; the coding agent did not perform browser automation. After a new deployment, recheck desktop/narrow-screen layouts and the full workflow, including refresh recovery of an Approved plan. Manual acceptance and automated test coverage are separate forms of validation.

## Replit: complete reproduction steps

Replit has been used to run the same core calculation module: the default scenario produced 61 servings and the tomato-egg-zero-cap scenario produced 45. The browser app still computes locally and does not call a Replit API.

### Minimum upload

Preserve this seven-file structure in a Node.js-enabled Replit project:

```text
package.json
src/
  demoInputs.js
  inventory.js
  recipes.js
  planner.js
demo/
  scenarios.js
  run.js
```

The root `package.json` supplies `"type": "module"`. Direct CLI execution does not need npm installation, React, browser storage, a backend or keys. The minimum upload omits the web app and its tests; do not run the full project's `dev`, `test` or `build` commands against only these files. Uploading this guide is optional.

### Run, modify and compare

1. Open a Replit project with Node.js available and upload the seven files with the shown directory structure.
2. Open **Shell** using the project editor's tool search. Ensure the working directory contains `package.json`, `src` and `demo`.
3. Run `node --version`. The documented setup uses Node.js 22 or newer; local validation used Node.js 24.
4. Execute the scenarios:

```sh
node demo/run.js default
node demo/run.js no-tomato-egg
node demo/run.js compare
```

The last command prints both reports. Each report includes the fixed date, integer portions, caps, reasons/limits, batch-level planned use and remaining quantities, exclusions and leftover priority stock. It is explicitly a draft: nothing is approved, deducted or persisted. Unknown scenario arguments fail with a nonzero exit status; `node demo/run.js --help` displays usage.

Edit `src/demoInputs.js` to modify shared inventory or owner caps, save, then rerun. The built-in `no-tomato-egg` scenario applies only its cap override from `demo/scenarios.js`. Every run uses fresh input copies; allocation logic remains in `src/planner.js`.

For a web comparison, use matching inputs and initial/unmodified browser inventory, or intentionally reset the web demo first. Source edits may invalidate older browser saves; reset only if you intend to clear them. In Windows PowerShell, `npm.cmd run demo -- compare` is an optional equivalent to the direct Node comparison command.

## Two-minute judge walkthrough

For repeatable starting data, open **Demo settings → Reset Demo** and confirm before the presentation.

1. **0:00–0:20 — View inventory.** Select `Due today` and show tomatoes, chicken and cooked rice. Available quantities already protect order reservations.
2. **0:20–0:45 — Generate.** Open **Today's Plan**, keep sample caps and click **Generate Plan**. Point out the Planned servings, dish count and unique priority batches. Recipe and batch details can be expanded.
3. **0:45–1:05 — Approve.** Click **Approve Plan**. The next step becomes Complete. Briefly return to Inventory to show plan reservations increasing while stock stays unchanged.
4. **1:05–1:30 — Complete.** Return to Today's Plan and click **Complete Preparation**. Show prepared portions and **Recorded consumption**, including the quantities actually deducted by batch.
5. **1:30–2:00 — Track consumption.** Click **View Activity Log** and expand `Dish portions & batch changes` on the Completed record. Show actual operation time, stock changes and preserved original-order reservations.

For follow-up questions, demonstrate that an active Approved plan blocks new generation, a cap change makes a Draft require regeneration, and cancellation releases reservations without consuming stock. Saved plans and recipe snapshots are available under the plan's history disclosure.
