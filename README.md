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
- **Approved:** validate every required batch against the saved allocation, then reserve all quantities together. Stock and original-order reservations stay unchanged. At most one plan may be Approved. New drafts can still be generated, but no second approval is allowed until the active plan is completed or cancelled.
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

- `src/inventory.js`: fictional batches, fixed date, validation, unit conversion, and calendar priority helpers.
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

## Try the demo

1. Search for `Eggs` in inventory: two batches with different dates are shown. Clear search and use `Excluded` to see the expired tomato batch.
2. Scroll to Today's Plan, review recipes and owner caps, then click `Generate Plan`.
3. Inspect the dish and projected batch snapshot. Stock and reservations have not changed. Click `Approve Plan`: total stock stays the same, plan reservations increase, and available stock decreases.
4. Refresh. The plan is still Approved with the same ID and allocations. Click `Complete Preparation`: stock decreases once; only this plan's reservations are released. The completed plan has no completion or cancellation action. Check the actual changes in Activity Log.
5. Generate and approve another plan, then choose `Cancel Plan`. Stock stays the same; only the new plan's reservations are released. Original-order reservations stay unchanged.
6. For the one-active-plan guard, approve a plan, generate another draft, and observe the disabled approval and explanation. Use `View Active Plan` or the saved-plan selector to complete/cancel the active plan. The other draft is now stale because inventory changed; generate again.
7. Change any cap while viewing a Draft. It shows `Needs regeneration` and cannot be approved. Set all caps to 0 and generate for an empty-plan explanation; approval stays unavailable. Negative, decimal or empty caps show an error and disable generation.
8. Click `Reset Demo` and cancel the confirmation to retain data; confirm a reset to clear plans and logs and restore initial inventory. Refresh to verify the reset was saved.
