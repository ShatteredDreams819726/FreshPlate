# FreshPlate

A fictional inventory and extra-prep planning demo for small Chinese restaurants. FreshPlate helps turn near-expiry ingredients into actionable prep drafts.

## Inventory and Today's Plan

The retained inventory page displays eight ingredient types across eleven batches, existing-order reservations, calculated available quantities, and date priorities. Search and filters only change displayed rows. Earlier/later egg and chicken batches demonstrate shared ingredients and date ordering; an expired tomato batch demonstrates exclusion.

Today's Plan includes owner-supplied extra prep caps and a saved workflow: Draft → Approved → Completed, or Approved → Cancelled. Every recipe's per-serving quantities and allocation order are visible. Caps are non-negative whole numbers, not forecasts or sales guarantees. Oil, salt and other seasonings are assumed sufficient. Owner and staff are demonstration roles, not actual access controls. There is no backend, database, AI integration, or login.

All data is simulated. The fixed demo date is **October 21, 2026 (2026-10-21)**. Dates and quantities are examples, not storage or food safety guidance. Status indicates calendar priority only:

- Due today: the use-by date matches the demo date.
- Due soon: the use-by date is 1–2 days after the demo date.
- Later: the use-by date is at least 3 days after the demo date.
- Past demo date: the use-by date is earlier than the demo date (supported for future sample edits).

Invalid dates (including impossible calendar dates), invalid quantities, inconsistent units, excessive reservations, and duplicate batch IDs are excluded with reasons. Past-use-by batches are also excluded. No invalid quantity is silently treated as available inventory.

Total reserved = Existing-order reservations + Active-plan reservations. Available = In stock − Total reserved. Canonical inventory stores order reservations separately from a map of plan-ID reservations. The page and planner both use the same application state. Eggs use individual pieces (`pcs`); other ingredients use kilograms (`kg`). Quantities with different units are never added together.

## Draft allocation rule and limitations

1. Validate batches and exclude past-use-by stock. Priority batches expire from October 21 through October 23, 2026, inclusive. Later valid stock can supply supporting ingredients.
2. Copy the unreserved quantities into one shared calculation budget. Convert kg to whole grams (1 kg = 1,000 g); keep eggs in whole pieces. Mass samples require at most three decimal places in kg. Different units are never combined into a score.
3. Process priority batches by use-by date, then batch ID. For each, try the displayed dish order: Tomato & Egg Stir-fry, Pepper Chicken, Potato Chicken Stew, Stir-fried Cabbage, Egg Fried Rice.
4. Allocate one whole serving at a time while there is a priority ingredient to consume, every required ingredient is available, and the owner's cap has not been reached. Decrease the shared budget immediately. All recipes use earliest-expiring eligible batches first for each ingredient.
5. Display the servings, actual priority-batch use, final limiting factors, per-dish allocation, per-batch projections, and unallocated priority ingredients. Projected stock includes protected reservations; unallocated quantity excludes them.

This deterministic heuristic is not globally optimal. Recipe order can change the outcome. It does not model demand, food safety, labor, equipment or profit. Draft generation never changes inventory or reservations. Input or inventory changes make older drafts stale and block their approval. Recipe, portion, and batch-allocation snapshots are stored per plan; later actions never re-plan silently.

## Approve, complete, cancel and restore

- **Draft:** a unique ID and immutable generation snapshot; no stock or reservation changes. Empty or stale drafts cannot be approved. Generating again creates a new plan; earlier plans remain available in the saved-plan selector.
- **Approved:** validate every required batch against the saved allocation, then reserve all quantities together. Stock and original-order reservations stay unchanged. Complete or cancel the active plan before generating another draft. Generation is blocked in both the UI and business logic, without adding a plan or an Activity Log entry. Caps can be edited for the next plan without changing the approved snapshot.
- **Completed:** deduct the exact approved quantities from stock and release only that plan's reservations. Original-order reservations stay unchanged. The operation is atomic across batches and cannot be repeated. Completed plans cannot be cancelled.
- **Cancelled:** release only the approved plan's reservations; stock and original-order reservations stay unchanged. Cancellation cannot be repeated or re-approved.

Inventory, plan history, current selection, owner inputs, and Activity Log are saved as one versioned localStorage value under `freshplate-demo`. State is shown as successful only after validation and saving succeed. Restore checks snapshot arithmetic, plan transitions, logged batch changes, and consistency of the resulting inventory and reservations without recalculating the saved recommendations. Invalid/unsupported saves are left untouched; the inventory is hidden until the user retries loading or explicitly resets. Save failures do not publish an inventory change or success record.

Activity Log records only successful plan creation and status transitions. Drafts record no inventory change; approval and cancellation show reservation changes with zero stock consumption; completion shows actual stock deduction. Timestamps are actual ISO instants, displayed in the browser's local timezone, separate from the fixed planning demo date.

Use **Reset Demo**, then confirm, to restore initial inventory and clear all plans and records. Cancelling the confirmation does nothing. A failed reset save preserves previous state. **Reload Saved Demo** retries restore. Use one browser tab; conflicting saved values block writes and require a reload. This is a browser-local demo, not a multi-user transaction server. Storage is tied to the browser and origin; changing the host or port uses different storage. Clearing site data removes the saved demo.

With default caps, the draft recommends 16 Tomato & Egg Stir-fry, 12 Pepper Chicken, 9 Potato Chicken Stew, 16 Stir-fried Cabbage, and 8 Egg Fried Rice servings. The stew stops once its priority chicken has been allocated; later chicken alone does not justify further servings. Expired tomatoes are never used.

## Run in Windows PowerShell

```powershell
Set-Location 'D:\Code\FreshPlate'
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173 in your browser. If port 5173 is occupied, stop the other server or select a different port with `npm.cmd run dev -- --port 5174`.

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run preview
```

Build output is in `dist/`. Production preview uses http://127.0.0.1:4173. Press Ctrl+C to stop a server.

## Files

- `src/demoInputs.js`: shared editable fictional inventory, fixed demo date, and owner caps for both web and CLI.
- `src/inventory.js`: re-exports shared inputs; validation, unit conversion, and calendar priority helpers.
- `src/recipes.js`: per-serving recipes, fixed dish order, default caps, and cap validation.
- `src/planner.js`: pure deterministic draft calculation, exclusions, shared budgets, and batch projections.
- `src/planner.test.js`: Node built-in tests for shared ingredients, protected reservations, dates, exclusions, caps, deterministic output, and non-mutation.
- `src/TodaysPlan.jsx`: editable caps, recipe display, stale-draft notices, recommendations, allocations, and leftovers.
- `src/workflow.js`: shared inventory state, reservation separation, plan snapshots, atomic state transitions, and restore consistency checks.
- `src/persistence.js`: versioned localStorage loading/saving, conflict detection, and explicit error handling.
- `src/useDemo.js`: application state and save-before-publish actions, reload, and confirmed reset.
- `src/PlanActions.jsx`: plan status, saved-plan selector, approval, completion, cancellation, and saved recipes.
- `src/ActivityLog.jsx`: successful operations, actual timestamps, and actual before/after batch changes.
- `src/workflow.test.js`: lifecycle, reservation protection, repeated-action guards, atomic failure, and save/restore checks.
- `src/App.jsx`: retained inventory page, search and date filters, plus Today's Plan.
- `src/styles.css`: responsive layout and styling. Small screens can scroll the table horizontally.
- `src/main.jsx`: React entry point.
- `index.html`: HTML entry and English page metadata.
- `vite.config.js`: React support for Vite.
- `package.json` / `package-lock.json`: project commands and reproducible dependency versions.
- `.gitignore`: excludes dependencies, build output, and local secrets.

Only React, React DOM, Vite, and the official React Vite plugin are used. There are no external fonts or image services.

## Replit core calculation demo (Node.js CLI)

**Replit has been used to run this same core calculation module:** the default scenario produced **61 servings**, and the tomato-egg-zero-cap scenario produced **45 servings**. The browser app still calculates locally and does not call a Replit API. The CLI imports the same `generatePlan` from `src/planner.js`; it does not introduce a second algorithm. The steps below reproduce the command-line demo.

### Minimum upload: 7 existing project files

Keep this directory structure at the root of a Node.js-enabled Replit project:

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

Uploading this README as an eighth file is useful but not required to execute the demo. No `node_modules`, `dist`, `.git`, `.env`, keys, React components, or workflow/localStorage modules are needed. The unchanged root `package.json` is included for its `"type": "module"` setting. Its React/Vite dependencies and web commands are not needed by this CLI; no `npm install` is required for these direct Node commands. The minimum upload intentionally omits the web app and its tests, so do not run its `dev`, `build`, or `test` commands with only these 7 files.

### Run and compare in Replit

1. Open or create a project with Node.js available. Upload/create the 7 files above, preserving folder names and capitalization.
2. Open **Shell**. In the project editor, open a new tab, search for `Shell`, then select it. See the [official Replit Shell instructions](https://docs.replit.com/features/workspace-tools/shell).
3. Ensure Shell is at the directory containing `package.json`, `src`, and `demo`. Run `node --version`; use Node.js 22 or newer for this documented demo setup. The local validation used Node.js 24.
4. Run the following commands in Shell to reproduce and compare the scenarios:

```sh
# Default scenario (also the behavior when the argument is omitted)
node demo/run.js default

# Disable only Tomato & Egg Stir-fry; other owner caps stay the same
node demo/run.js no-tomato-egg

# Print both reports in one run for comparison
node demo/run.js compare
```

The output is English and explicitly says **SIMULATED DATA | DRAFT ONLY**. It includes the fixed planning date, priority rules, all dish serving counts and caps, reasons/limits, batch-level planned use, projected stock, unallocated quantities, exclusion reasons, and leftover priority ingredients. No approval, completion, inventory mutation, reservation update, or persistence takes place. Unknown scenario names fail with a nonzero exit code and usage help. `node demo/run.js --help` prints usage.

With the unchanged sample inputs, expect:

| Dish | Default | Tomato-egg cap = 0 |
| --- | ---: | ---: |
| Tomato & Egg Stir-fry | 16 | 0 |
| Pepper Chicken | 12 | 12 |
| Potato Chicken Stew | 9 | 9 |
| Stir-fried Cabbage | 16 | 16 |
| Egg Fried Rice | 8 | 8 |
| Total servings | 61 | 45 |

The non-expired tomato batch's planned use changes from 3.2 kg to 0 kg, leaving 1.8 kg versus 5 kg unallocated (after existing-order reservations). The expired tomato batch is excluded in both scenarios. These are hypothetical estimates, not actual consumption or guaranteed sales.

### Edit inputs and rerun

Edit **`src/demoInputs.js`** for the shared date, each batch's stock, existing-order `reserved` quantity, use-by date, and `extraPrepCaps`. Inventory mass uses kg (at most three decimal places); eggs use whole `pcs`. Keep consistent units and real `YYYY-MM-DD` dates. Owner caps must be non-negative integers. The imported planner reports invalid batches as excluded and rejects invalid caps.

For example, change `extraPrepCaps['tomato-egg']` to `0`, save the file, and rerun `node demo/run.js default`. Alternatively, keep the defaults unchanged and run the built-in `no-tomato-egg` scenario; its single override is in `demo/scenarios.js`. Every run uses a fresh copy of the inputs. Recipe quantities remain in `src/recipes.js`; allocation logic remains only in `src/planner.js`.

The CLI uses source-file inputs, not saved browser inventory. To compare with the web UI, use the same source values and owner caps and an initial/unmodified web demo (or explicitly Reset Demo first). Editing shared initial data can invalidate an older browser save; the web app will report a restore mismatch rather than silently replace it. Do not reset a saved web demo unless you intend to clear its plans and activity.

### Local commands and verification

From Windows PowerShell in the full FreshPlate project:

```powershell
Set-Location 'D:\Code\FreshPlate'
node demo/run.js default
node demo/run.js no-tomato-egg
node demo/run.js compare
npm.cmd test
npm.cmd run build
```

`npm.cmd run demo -- compare` is an optional equivalent to `node demo/run.js compare`. The default and zero-cap scenarios are checked against the web workflow's entire generated snapshot, not just serving totals. The CLI checks also verify repeatability, non-mutation, exclusion output, and running the documented 7-file subset in isolation without installed packages. All prior planner and lifecycle tests remain included.

## Try the demo

1. Search for `Eggs` in inventory: two batches with different dates are shown. Clear search and use `Excluded` to see the expired tomato batch.
2. Switch to Today's Plan, review owner caps, then click `Generate Plan`. Expand `Recipes & calculation rules` for details.
3. Inspect the dish and projected batch snapshot. Stock and reservations have not changed. Click `Approve Plan`: total stock stays the same, plan reservations increase, and available stock decreases.
4. Refresh. The plan is still Approved with the same ID and allocations. Switch to Today's Plan and click `Complete Preparation`: stock decreases once; only this plan's reservations are released. Click `View Activity Log` for actual changes.
5. Generate and approve another plan, then choose `Cancel Plan`. Stock stays the same; only the new plan's reservations are released. Original-order reservations stay unchanged.
6. For the active-plan guard, approve a plan and edit a cap. `Generate Plan` stays disabled with instructions to complete or cancel the active plan. No new draft or log entry is created. After completion or cancellation, generate again using the updated caps. Any earlier saved drafts remain in history and must be regenerated after inventory changes.
7. Change any cap while viewing a Draft. It shows `Needs regeneration` and cannot be approved. Set all caps to 0 and generate for an empty-plan explanation; approval stays unavailable. Negative, decimal or empty caps show an error and disable generation.
8. Expand `Demo settings` at the bottom. Click `Reset Demo` and cancel the confirmation to retain data; confirm a reset to clear plans and logs and restore initial inventory. Refresh to verify the reset was saved.

## Two-minute judge walkthrough

For a fresh repeatable run, open **Demo settings → Reset Demo** and confirm before starting. The planning date remains **October 21, 2026**; Activity Log uses actual operation times.

1. **0:00–0:20 — See the problem.** Open **Inventory**, select `Due today` and point out the tomatoes, chicken and cooked rice. Available stock already excludes existing-order reservations.
2. **0:20–0:45 — Generate.** Open **Today's Plan** and select **Generate Plan** with sample caps. The **Planned** summary displays additional servings, dish count, and unique priority batches involved. Explain that caps are the owner's extra-prep limits. Recipe and batch details are expandable.
3. **0:45–1:05 — Approve.** Select **Approve Plan**. The workflow moves to Complete. Briefly return to Inventory: plan reservations have increased while stock is unchanged.
4. **1:05–1:30 — Complete.** Return to Today's Plan and select **Complete Preparation**. The page now shows **Recorded consumption**, prepared servings, and quantities actually deducted for each batch.
5. **1:30–2:00 — Verify the record.** Select **View Activity Log**. Open `Dish portions & batch changes` on the Completed record to show actual stock changes. Return to Inventory to see updated stock; existing-order reservations are preserved.

The three section buttons keep the walkthrough compact. Generate, Approve and Complete progress follows the selected plan's real status; Cancelled is explicitly labelled. Stale drafts and empty plans explain what to change before generating again. Saved-plan history, detailed reasons, recipes, and batch tables stay behind disclosures.

### Presentation checks

`src/planSummary.js` derives planned summaries from the snapshot and completion summaries from actual records. Priority batches use unique batch IDs. Consumption quantities stay per batch and per unit; there are no revenue, carbon, percentage-waste, or food-saved estimates. `src/planSummary.test.js` checks deduplication and distinguishes recorded consumption from planned totals.

Before presenting, manually verify the complete workflow and the narrow-screen layout (about 390 px wide). Tables should scroll within their region, labels remain readable, and buttons must not overlap. Browser automation was unavailable in the development session for this presentation update, so these visual and click checks are not claimed as completed.
