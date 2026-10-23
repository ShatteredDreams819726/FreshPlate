# Stock Import and Custom Recipes

[Project homepage](../README.md) · [Planning and demo guide](demo-guide.md)

This local prototype accepts manually reviewed arrivals and recipes. Optional Gemini text/image extraction feeds the same editable forms; see [AI Import Setup](ai-import.md). Supplier integration is not connected. Nothing is submitted to the deployed site by these local changes.

## Try Import Stock

1. Start the local app, open **Inventory → Stock & recipes → Import Stock**.
2. Expand **Copyable example** and choose **Use Example**, or paste six columns copied from a spreadsheet:

```text
Ingredient	Quantity	Unit	Batch	Production Date	Expiry Date
Tomatoes	1500	g	SUP-042		2026-10-22
Eggs	24	pcs			2026-10-22
```

The example above uses tab-separated cells. The on-page example uses today's date. Simple comma-separated text is also accepted; quoted CSV fields are not supported. Keep all six columns, including empty optional cells.

The previous `Supplier Batch` header is still accepted. It means the business's batch number, not a supplier name. Saved `supplierBatch` values are preserved and shown in **Batch**. When no number was supplied, an imported arrival gets a stable `Batch 012` style display number based on its position in the append-only inventory. Full internal IDs and references are unchanged; display numbers are never used as keys.

3. Select **Preview Import**. Select an existing ingredient, or choose **Create a new ingredient** and confirm its name and supported unit. Correct quantities, units and dates in the preview.
4. Missing/invalid expiry dates prevent confirmation. Production date and supplier batch may remain blank and are stored as `null`; they are never generated. If supplied, production date must be valid and no later than expiry.
5. Possible duplicates are highlighted. Confirm each flagged row only if it is an additional delivery. Duplicates are never merged. A repeated supplier batch also requires review when expiry dates differ.
6. Select **Confirm & Append Stock**. All rows validate before any stock changes. Each row receives a new system batch ID, separate from its supplier batch. Arrival quantities are appended with zero order/plan reservations. Existing stock and order reservations are untouched.
7. Review **Activity Log → Stock imported**. Refresh and confirm the same batches and import record remain. A reused confirmation ID cannot append again, including after refresh.

Confirmation switches to **Business** mode. Valid but expired arrivals may be recorded, but the planner excludes them. No missing expiry date is inferred from an ingredient or production date.

### Editing dates and review messages

Editable production/expiry fields use labelled native date pickers. Production date is optional and can be cleared with **Leave Blank**; expiry is required before confirmation. There is no future-only restriction. Pasted year-first dates such as `2026-3-4`, `2026 3 4` and `2026/3/4` normalize to `2026-03-04`. Ambiguous `03/04/2026` or impossible dates remain as **Source** text beside an empty picker until corrected. Date values remain calendar strings, without a local/UTC timestamp conversion.

Duplicate arrivals have one red **Row N: Confirm this is an additional delivery.** message and its checkbox. Checking it clears the pending error; there is no second explanatory warning. Other errors are recomputed from the current row values. Recipe validation also updates while editing an open per-serving preview.

AI results keep **Extracted draft · not saved**. Before loading, current field issues are grouped by row/field/problem. After loading, original extracted fields and AI notes are collapsed reference material; the editable preview is the source of current errors. A calculated expiry has a compact basis and confirmation beside its picker. Choosing a manual expiry removes that calculation requirement; changing the production date of an automatic calculation clears the derived expiry for review. A valid manual expiry never requires a shelf-life value.

**Cancel Preview** discards only that preview; no inventory, reservations or activity are changed. On a narrow screen, scroll the preview table horizontally to reach the date controls.

## Add or edit a recipe

1. Open **Import / Add Recipe**, choose a new dish or an existing recipe, and fill in dish name and recipe yield (positive whole servings).
2. Add ingredient rows. Select existing ingredients or explicitly create named ingredients. Enter total quantities for the stated recipe yield.
3. Select **Review Per-serving Recipe**. For example, 1,000 g of tomatoes for five servings becomes 0.2 kg per serving.
4. Missing quantities, "to taste", unsupported units and piece/weight mismatches block saving. The existing integer budget requires whole grams or whole pieces per serving; adjust total quantity or yield when exact normalization is impossible. Nothing is rounded silently.
5. Select **Confirm Recipe**. A new dish appears in Today's Plan with an initial cap of 0. Set a positive cap before generating. Editing an existing recipe keeps its ID and cap.

Recipe data is persisted. Editing live recipes never changes saved plan recipe/portion/allocation snapshots. Stock or recipe changes invalidate earlier Drafts, requiring regeneration before approval.

## Dates and active plans

- **Demo** uses the fixed date October 21, 2026. The original Replit default/zero-tomato-egg scenarios remain 61/45 servings.
- **Business** uses the browser's local current date. Its planning date is displayed prominently and is checked again at generation and approval. A draft from yesterday requires regeneration. The display refreshes across midnight.
- Stock confirmation always selects Business mode. After arrivals are imported, use an explicitly confirmed **Reset Demo** to return to the sample-only demo. Initial fictional batches are labelled **Demo sample**; imported rows are labelled **Imported arrival**.
- An **Approved** plan blocks stock, recipe and mode commits. Editable previews remain available. Complete or cancel first; then review and confirm against the current inventory.

## Stable IDs and units

`ingredients` contains `{ id, name, unit }`. Names are display fields. Batch and recipe ingredient references use `ingredientId`. Existing sample IDs are explicit; new ingredient IDs are generated only after the user chooses creation. The legacy name lookup is confined to version-1 data validation/migration.

Stock previews automatically match only a unique exact name (ignoring case and outer spaces) in the same unit dimension. Multiple exact matches require selection. Similar names and known aliases are suggestions requiring user confirmation; **Cabbage** and **Chinese cabbage** remain separate. **Ingredients → Review similar ingredient names** lists potential overlaps and counts affected batches, recipes and saved plans, without merging or changing references. Ordinary lists show only name and unit; internal ingredient IDs are not shown to users.

### Ingredient images and presentation

Icons belong to ingredient IDs, so all batches of one ingredient share its default or uploaded image. After saving a new ingredient, open **Ingredients → Upload Image**; **Replace Image** and **Use Default** change only its presentation. JPG/PNG files are limited to 2 MB and resized to at most 128 × 128 pixels; compressed data is capped at 40,000 characters. The optional `ingredientIcons` map is saved with the version-3 envelope. Earlier version-2 saves, including those without this map, are upgraded without changing images or historical plan snapshots. Failed image processing or browser-storage writes leave the previous saved state intact and show an error. Cancelling the file picker changes nothing.

Production dates remain optional. The inventory and arrival log show **Production date: YYYY-MM-DD** only when a valid date was supplied. Missing dates are hidden; invalid preview dates must be corrected. Expiry and priority rules are unchanged.

Canonical units are `kg` for mass and `pcs` for count. At the entry boundary only `g → kg` conversion is supported (1,000 g = 1 kg). Boxes, bags, local weight units, and count-to-weight conversions must be converted by the user before confirmation. There is no default conversion coefficient.

## Shared extraction interface

The flow is **extraction → editable preview → validation → explicit confirmation**. The current table parser produces this provider-neutral envelope:

```json
{
  "version": 1,
  "kind": "stock",
  "source": "manual-table",
  "rows": [{
    "ingredientName": "Tomatoes",
    "quantity": "1500",
    "unit": "g",
    "supplierBatch": "",
    "productionDate": "",
    "expiryDate": "2026-10-22"
  }]
}
```

Call `createStockPreview(extraction, catalog, previewId)` to create editable rows. Preview-only fields include row IDs, matched `ingredientId`, explicit `createIngredient`, and `confirmDuplicate`. The UI generates the preview ID; the provider must not decide idempotency IDs or invent missing source data.

Recipe previews use the same versioned convention with `kind: "recipe"`, `id`, `source`, `recipeId` (blank for new), `name`, `servings`, and ingredient rows containing `id`, matched `ingredientId`, `ingredientName`, `quantity`, `unit`, and explicit `createIngredient`. Both the manual form and Gemini adapter feed `validateRecipePreview`; ingredient matching or creation is confirmed in the editable form.

`validateStockPreview` and `validateRecipePreview` are shared by the UI and commit logic. Only `IMPORT_STOCK` or `SAVE_RECIPE` confirmations write data. Provider output must never call a stock-changing action directly. Gemini source-image upload is available in each extraction panel; ingredient-icon upload is a separate feature.

### Gemini configuration

See [AI Import Setup](ai-import.md) for the server-side key/model variables, full local server command, shared schema, limits, error handling and deployment steps. Gemini output passes through the existing editable preview and business confirmation, never directly into inventory.

## Persistence and migration

The `freshplate-demo` envelope is now version 3, including ingredient/recipe catalogs, imports, mode, inventory, plans, activity and separate plan display-number metadata. Restore replays confirmed data changes and saved plan operations, without recalculating old plans. Version-2 data gains stable date/sequence labels and retains an original backup under `freshplate-demo:v2-backup`; IDs, snapshots, stock and history remain unchanged. See [Plan numbering and storage](demo-guide.md#state-transitions-and-browser-storage).

Version-1 data is first validated with its original schema. Migration adds stable references and catalogs while retaining stock, reservations, IDs, timestamps, saved snapshots and history. The original JSON is retained under `freshplate-demo:v1-backup` before the upgraded main value is saved. The UI reports the upgrade. Validation or storage failure blocks loading with an explanation; it does not fall back to initial inventory. Reset is an explicit destructive action requiring confirmation.

## Verification

Run `npm.cmd test` and `npm.cmd run build` from the full project root. Existing calculation, lifecycle, summary and CLI checks remain. New checks cover explicit units, required expiry dates, duplicate review, idempotent/atomic import, custom ingredients/recipes in the shared planner, stale drafts, Approved-plan protection, refresh restoration, legacy migration and failed migration preservation.

Manually verify the editable forms, duplicate checkboxes, scrolling tables and confirmations in the browser. In particular, test previewing while Approved, saving after completion/cancellation, and refreshing an approved plan created with a custom recipe. Do not clear browser storage to test migration; use an isolated test profile or the automated fixtures.

For presentation fixes, verify imported Tomatoes/Eggs/Green peppers share their ingredient icons; upload and replace a new ingredient image, then refresh; cancel a file selection; check numbered/unnumbered batches and optional production dates. At 1440, 1280 and 390 pixels, check expanded previews, Ingredients, plan allocations and Activity Log. Tables may scroll inside their panel; the page itself should not overflow. The automated rendering/image-pipeline checks do not replace a real browser interaction or layout check.
