# Release Preparation

[Project homepage](../README.md) · [Gemini configuration](ai-import.md) · [Stock and recipe entry](data-entry.md)

This release prepares reviewed Gemini stock/recipe import, custom recipes, stable ingredient references, image/batch presentation, native date pickers and concise validation. It preserves the shared planner, order reservations, plan snapshots, approval/completion/cancellation and activity history. The owner has reported manual acceptance. No staging, commit, push, environment update or deployment is performed by release preparation.

## Files to include

The change set includes previously uncommitted work from these connected stages. Keep all the following files together; committing only the AI panel would omit required data, migration and validation modules.

### Application, data and checks

```text
src/ActivityLog.jsx
src/App.jsx
src/RecordedConsumption.jsx
src/TodaysPlan.jsx
src/demoInputs.js
src/inventory.js
src/persistence.js
src/planner.js
src/planner.test.js
src/recipes.js
src/styles.css
src/useDemo.js
src/workflow.js
src/AIImportPanel.jsx
src/DataEntryPanel.jsx
src/ImportDateField.jsx
src/ImportIssues.jsx
src/IngredientIcon.jsx
src/IngredientsPanel.jsx
src/StockImportPreview.jsx
src/aiImport.js
src/dataEntry.js
src/dataEntry.test.js
src/extraction.test.js
src/extractionContract.js
src/importDates.js
src/importReview.js
src/importReview.test.js
src/ingredientImages.js
src/ingredientPresentation.js
src/legacyV1.js
src/migration.js
src/presentation.test.js
src/stateValidation.js
```

### Function, local server and configuration

```text
api/extract.js
server/extract.js
server/providerDiagnostic.js
dev/server.js
.gitignore
.env.example
package.json
vercel.json
```

`.env.example` has empty values only. Dependencies did not change, so the unchanged `package-lock.json` is not part of this diff.

### Documentation

```text
README.md
docs/demo-guide.md
docs/data-entry.md
docs/ai-import.md
docs/release-guide.md
```

## Exclusions and verification

Never include `.env.local`, any real key, other `.env` files, `node_modules/`, `dist/`, `.vercel/`, logs, coverage, editor swap files or temporary directories/files. `.gitignore` excludes these categories while allowing the empty `.env.example`. Ignore rules do not untrack an already tracked secret; inspect both tracked and unignored files and the staged list. The prepared change set contains no such tracked files, and release preparation scans candidate files for the configured key and common credential/private-key patterns without printing secret values.

Run from the full project:

```powershell
npm.cmd test
npm.cmd run build
```

The current suite has 65 passing tests, including the Replit 61/45 comparison. Model tests use simulated responses and non-secret sentinels; they do not consume live Gemini quota. A separate earlier live text-stock request succeeded, and the owner subsequently reported manual acceptance. Production artifacts are generated locally but are not committed.

## Server environment

The configured local model at preparation time is **gemini-3.5-flash-lite**. The online Vercel project needs:

| Name | Where/value |
| --- | --- |
| `GEMINI_API_KEY` | Server-side sensitive value, filled privately in Vercel settings. |
| `GEMINI_MODEL` | Server-side model ID: `gemini-3.5-flash-lite`. |

Use the same names without a `VITE_` prefix. `.env.local` remains local and is not uploaded. Configure Preview first, verify that deployment, then decide whether to publish Production. Variable changes require a new deployment. Current local preparation does not change the existing hosted demo. See [AI Import Setup](ai-import.md) for complete environment and deployment instructions and the single-instance rate-limit limitation.

## Commands for the owner

The following commands are provided for later execution, not run during preparation. Directory staging covers the reviewed files listed above; repeat the file/secret review if further files are added before running it.

```powershell
cd D:\Code\FreshPlate
git -c safe.directory=D:/Code/FreshPlate add -- .gitignore .env.example package.json vercel.json README.md src/ api/ server/ dev/ docs/
git -c safe.directory=D:/Code/FreshPlate diff --cached --stat
git -c safe.directory=D:/Code/FreshPlate diff --cached --check
git -c safe.directory=D:/Code/FreshPlate commit -m "feat: add reviewed Gemini imports and custom recipes"
```

The per-command `safe.directory` applies only to this repository invocation; it does not change global Git settings. Review the staged filenames before committing. No push or deployment command is included.
