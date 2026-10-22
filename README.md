# FreshPlate

Turn soon-to-expire ingredients into actionable prep plans for small Chinese restaurants.

## The problem

A restaurant can have ingredients approaching their use-by dates while some stock is already reserved for existing orders. Deciding what extra dishes to prepare requires checking individual batches, shared ingredients and realistic prep limits together. FreshPlate turns that information into a draft the owner can review and approve, staff can mark as prepared, and the restaurant can track through recorded batch consumption.

## How it works

**View inventory → Generate plan → Approve → Complete → Track consumption**

Start in **Inventory**, review date priorities and available quantities, then open **Today's Plan** and set extra serving caps. Generate a draft to see recommended portions and planned batch usage. Approval reserves the required ingredients; completion deducts stock and records consumption in **Activity Log**. A plan can also be cancelled before completion to release its reservations. One approved plan must be completed or cancelled before another draft is generated.

## Key features

- **Batch priority:** Prioritizes eligible batches expiring today through the next two days and allocates earlier-expiring batches first.
- **Shared inventory:** Five recipes draw from one remaining-stock budget, preventing the same eggs or chicken from being allocated twice.
- **Reservation protection:** Separates existing-order reservations from plan reservations, preserving committed stock throughout approval, completion and cancellation.
- **Human approval:** Keeps generation separate from stock changes, preserves plan snapshots, and blocks stale drafts and repeated completion.

## Run locally

Built with React, Vite, JavaScript and CSS. Local development has been verified with Node.js 24. From the project root in Windows PowerShell:

```powershell
npm.cmd install
npm.cmd run dev
```

Open **http://127.0.0.1:5173/**. Keep the terminal running and press Ctrl+C to stop. On macOS or Linux, use `npm` instead of `npm.cmd`.

## Replit

Replit was used to run the same calculation module imported by the web app. The default scenario produced **61 servings**; setting the Tomato & Egg Stir-fry cap to zero produced **45**. To compare both scenarios in a Node.js environment:

```sh
node demo/run.js compare
```

The browser app calculates locally; it does not call a Replit API.

## Prototype scope

All inventory and dates are simulated. Data is saved in the current browser's localStorage, without a backend, login or cross-device synchronization. Owner and staff labels are demonstration roles. The deterministic heuristic does not guarantee an optimal plan or predict sales; caps are supplied by the owner. Date priority is a planning aid, not a food-safety judgment.

For the detailed algorithm, validation checks, complete Replit setup and two-minute walkthrough, see the [Demo Guide](docs/demo-guide.md).
