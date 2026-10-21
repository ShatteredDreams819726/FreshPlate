# FreshPlate

A fictional inventory demo for small Chinese restaurants. FreshPlate's broader goal is to help turn near-expiry ingredients into actionable prep plans.

## Phase 1

This phase displays eight ingredient batches, existing-order reservations, calculated available quantities, and date priorities. Search and filters only change the displayed rows. There is no backend, database, AI integration, recommendation, approval, inventory deduction, or login.

All data is simulated. The fixed demo date is **October 21, 2026 (2026-10-21)**. Dates and quantities are examples, not storage or food safety guidance. Status indicates calendar priority only:

- Due today: the use-by date matches the demo date.
- Due soon: the use-by date is 1–2 days after the demo date.
- Later: the use-by date is at least 3 days after the demo date.
- Past demo date: the use-by date is earlier than the demo date (supported for future sample edits).

Available = In stock − Reserved for existing orders. Every batch uses the same unit for all three quantities. Eggs use individual pieces (`pcs`); other ingredients use kilograms (`kg`). Quantities with different units are never added together.

## Run in Windows PowerShell

```powershell
Set-Location 'D:\Code\FreshPlate'
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173 in your browser. If port 5173 is occupied, stop the other server or select a different port with `npm.cmd run dev -- --port 5174`.

```powershell
npm.cmd run build
npm.cmd run preview
```

Build output is in `dist/`. Production preview uses http://127.0.0.1:4173. Press Ctrl+C to stop a server.

## Files

- `src/inventory.js`: fictional batches, fixed date, quantities, and calendar priority helpers.
- `src/App.jsx`: inventory page, search, and date filters.
- `src/styles.css`: responsive layout and styling. Small screens can scroll the table horizontally.
- `src/main.jsx`: React entry point.
- `index.html`: HTML entry and English page metadata.
- `vite.config.js`: React support for Vite.
- `package.json` / `package-lock.json`: project commands and reproducible dependency versions.
- `.gitignore`: excludes dependencies, build output, and local secrets.

Only React, React DOM, Vite, and the official React Vite plugin are used. There are no external fonts or image services.
