# FreshPlate

A fictional inventory and extra-prep planning demo for small Chinese restaurants. FreshPlate helps turn near-expiry ingredients into actionable prep drafts.

## Inventory and Today's Plan

The retained inventory page displays eight ingredient types across eleven batches, existing-order reservations, calculated available quantities, and date priorities. Search and filters only change displayed rows. Earlier/later egg and chicken batches demonstrate shared ingredients and date ordering; an expired tomato batch demonstrates exclusion.

Today's Plan adds editable owner-supplied extra prep caps and read-only draft recommendations for five dishes. Every recipe's per-serving quantities and allocation order are visible. Caps are non-negative whole numbers, not forecasts or sales guarantees. Oil, salt and other seasonings are assumed sufficient. There is no backend, database, AI integration, approval, inventory deduction, execution, or login.

All data is simulated. The fixed demo date is **October 21, 2026 (2026-10-21)**. Dates and quantities are examples, not storage or food safety guidance. Status indicates calendar priority only:

- Due today: the use-by date matches the demo date.
- Due soon: the use-by date is 1–2 days after the demo date.
- Later: the use-by date is at least 3 days after the demo date.
- Past demo date: the use-by date is earlier than the demo date (supported for future sample edits).

Invalid dates (including impossible calendar dates), invalid quantities, inconsistent units, excessive reservations, and duplicate batch IDs are excluded with reasons. Past-use-by batches are also excluded. No invalid quantity is silently treated as available inventory.

Available = In stock − Reserved for existing orders. Every batch uses the same unit for all three quantities. Eggs use individual pieces (`pcs`); other ingredients use kilograms (`kg`). Quantities with different units are never added together.

## Draft allocation rule and limitations

1. Validate batches and exclude past-use-by stock. Priority batches expire from October 21 through October 23, 2026, inclusive. Later valid stock can supply supporting ingredients.
2. Copy the unreserved quantities into one shared calculation budget. Convert kg to whole grams (1 kg = 1,000 g); keep eggs in whole pieces. Mass samples require at most three decimal places in kg. Different units are never combined into a score.
3. Process priority batches by use-by date, then batch ID. For each, try the displayed dish order: Tomato & Egg Stir-fry, Pepper Chicken, Potato Chicken Stew, Stir-fried Cabbage, Egg Fried Rice.
4. Allocate one whole serving at a time while there is a priority ingredient to consume, every required ingredient is available, and the owner's cap has not been reached. Decrease the shared budget immediately. All recipes use earliest-expiring eligible batches first for each ingredient.
5. Display the servings, actual priority-batch use, final limiting factors, per-dish allocation, per-batch projections, and unallocated priority ingredients. Projected stock includes protected reservations; unallocated quantity excludes them.

This deterministic heuristic is not globally optimal. Recipe order can change the outcome. It does not model demand, food safety, labor, equipment or profit. Draft generation never changes original inventory or reservations. Input changes mark existing results as needing regeneration; nothing is persisted after a page refresh.

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
3. Inspect a dish's batch allocation and the projected batch table. Reserved quantities stay protected. Compare the original inventory above; its stock and reservations have not changed.
4. Change any cap. The old results are marked `Needs regeneration`; click `Generate Plan` again to refresh them.
5. Set all caps to 0 and generate to see a no-feasible-plan explanation. A negative, decimal or empty cap shows an error and disables generation.
