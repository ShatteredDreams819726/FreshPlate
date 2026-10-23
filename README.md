# FreshPlate

Turn soon-to-expire ingredients into actionable prep plans for small Chinese restaurants.

Live Demo: [FreshPlate](https://fresh-plate-psi.vercel.app)

## The problem

A small restaurant may have ingredients approaching their use-by dates while part of its stock is already reserved for orders. Extra preparation needs to account for individual batches, shared ingredients and practical serving limits. FreshPlate turns this information into a plan the owner can approve, staff can complete, and the restaurant can track through recorded batch consumption.

## How it works

**View inventory → Generate plan → Approve → Complete → Track consumption**

Review stock and date priorities in **Inventory**, set extra serving caps in **Today's Plan**, and generate a draft. Approval reserves ingredients without deducting stock. Completion deducts the approved batch quantities and records consumption in **Activity Log**; cancellation releases only that plan's reservations. Complete or cancel an approved plan before starting another.

## Key features

- **Batch priority:** Allocates eligible batches expiring today through two days ahead, using earlier-expiring stock first.
- **Shared inventory and custom recipes:** Add or edit recipes with an explicit yield, review per-serving quantities, and plan against one shared inventory budget using stable ingredient references.
- **Protected reservations:** Keeps existing-order reservations separate from plan reservations and preserves approved recipe/allocation snapshots.
- **Reviewed imports and human approval:** Import stock or recipes manually, or extract them from pasted text or one JPG/PNG using Gemini. Compare the source, correct fields and confirm separately; AI cannot save inventory or approve plans.

## Run locally

Built with React, Vite, JavaScript and CSS, plus a Vercel Node.js extraction function. Use Node.js 24 and Windows PowerShell:

```powershell
npm.cmd install
npm.cmd run dev:full
```

Open **http://127.0.0.1:5173/**. This command serves both the frontend and `/api/extract`. For Gemini, create `.env.local` from `.env.example` only if absent, then privately set server-side `GEMINI_API_KEY` and `GEMINI_MODEL`. Keep an existing configured file. Manual entry needs no key; `npm.cmd run dev` and `preview` serve only the frontend. See [AI Import Setup](docs/ai-import.md) for configuration and limits. On other platforms, use `npm` instead of `npm.cmd`.

## Replit

Replit ran the same calculation module used by the webpage: **61 servings** with default caps and **45** with Tomato & Egg Stir-fry capped at zero. Compare the dependency-free scenarios:

```sh
node demo/run.js compare
```

Planning runs locally, without a Replit API or AI quantity calculations.

## Prototype scope

Demo data is fictional; Business mode uses today's date. Confirmed inventory, recipes and history stay in the current browser's localStorage, with no login or cross-device synchronization. Gemini receives only the selected extraction source through the server function. The deterministic heuristic is not globally optimal and does not forecast sales. Date priority is not a food-safety judgment.

See the [Demo Guide](docs/demo-guide.md), [Stock & Recipe Entry](docs/data-entry.md), and [Release Guide](docs/release-guide.md) for detailed workflows, validation, migration and release preparation.
