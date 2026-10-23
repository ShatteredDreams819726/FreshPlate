# Gemini stock and recipe import

FreshPlate sends either pasted text or one JPG/PNG to a server-side Gemini endpoint. It returns an **unconfirmed draft**, not a stock update. The source stays visible for comparison. **Load Editable Preview** fills the existing import/recipe form; only its original confirmation action saves changes. Manual entry remains available if extraction fails. Approved plans still block stock/recipe confirmation while allowing previews. Existing browser data and plan snapshots are retained.

## Local configuration and startup

For first-time setup, create the ignored file `D:\Code\FreshPlate\.env.local` from `.env.example` only if it does not already exist. Keep an existing configured file. Set the values privately in your own editor:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

Do not paste the key into a chat, source file, browser field or terminal command. Never add `VITE_` to either name. `.env.example` deliberately contains only empty placeholders. `.env.local`, other `.env.*` files and `.vercel/` are ignored by Git. Do not upload the local env file. The key is used only in the server's `x-goog-api-key` header; no key is included in frontend code, storage, app logs or error responses.

Use the existing Node.js 24 installation. Stop an older Vite process with Ctrl+C if it occupies port 5173, then run:

```powershell
cd D:\Code\FreshPlate
npm.cmd run dev:full
```

Open **http://127.0.0.1:5173**. The permanent `dev/server.js` adapter serves Vite and the **same handler** exported by `api/extract.js`, at the same origin. Restart after editing env values. No Vercel login, CLI install, remote project change or deployment is needed for this local path. A different port is available with `npm.cmd run dev:full -- --port 5187`; browser-local inventory is separate for each origin/port.

`npm.cmd run dev` still works for frontend-only development, but plain Vite does **not** run `/api/extract`. `npm.cmd run preview` is also frontend-only. [Vercel's `vercel dev`](https://vercel.com/docs/cli/dev) is an alternative platform emulator if you separately install/configure its CLI; it is not required by the verified local adapter.

## Actual API acceptance

1. In **Inventory → Stock & recipes → Import Stock → Extract Stock with Gemini**, paste:

   ```text
   Tomatoes: 1500 g. Batch T-23. Production date 2026-10-23. Shelf life 3 days.
   Eggs: 12 pcs. Expiry 03/04/2026. No batch or production date supplied.
   ```

2. Select **Extract**. With your configured key this initiates a real request. Without configuration it must show a configuration error, never a pretend successful result. Check the original input and extracted fields. Field issues are shown once per row/field/problem. The tomato expiry may be calculated by code from copied production date/shelf-life evidence; its compact basis is shown beside the date. The egg date must remain uncertain until you confirm its meaning.
3. Tick the source-review checkbox and select **Load Editable Preview**. Original extraction/AI notes become collapsed reference material; current errors now follow the editable fields. Select the egg's date with its labelled date picker and check ingredient matches. Confirm any calculated expiry beside its picker, or choose a manual date. A manually supplied valid expiry does not require shelf life. **Inventory and Activity Log must remain unchanged until Confirm & Append Stock**. Confirm only if you want these fictional arrivals added to your local inventory. **Cancel Preview** writes nothing. Do not reset or clear saved data to test.
4. In **Import / Add Recipe → Extract Recipe with Gemini**, try `Tomato egg side: tomatoes 1000 g, eggs 10 pcs. Yield not specified.` The yield must be blank. Select ingredient matches, fill the yield (for example 5), review per-serving quantities and confirm separately. `Salt to taste` or `一袋` must remain pending rather than become invented numeric quantities.
5. Repeat with a clear JPG/PNG of a fictional delivery note or recipe. Compare its displayed image with the output, especially quantities and dates. Extracting an image does not also read the text field. The source image is held in component memory and sent to Google only when Extract is selected; it is not added to inventory icons or browser-local persistence.

Optional real HTTP check from a second PowerShell window (no key appears in the request):

```powershell
$extractBody = @{ kind = 'stock'; text = 'Tomatoes 1500 g, batch T-23, expiry 2026-10-25' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/extract' -Method Post -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:5173' } -Body $extractBody
```

This returns extraction fields only. A successful HTTP response is not proof that the extracted facts are correct. Verify them against the source before saving.

## Model and output contract

Documentation checked October 23, 2026:

- [Google's model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite?authuser=0) lists **gemini-3.5-flash-lite** as stable, with image/text input and structured output support. The [pricing page](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) lists a free tier. Availability and quota depend on your Google project/region; check AI Studio. Older 2.5 models are currently restricted for new projects according to the [model catalog](https://ai.google.dev/gemini-api/docs/models).
- The server uses the documented [Interactions REST API](https://ai.google.dev/api/interactions-api), `POST /v1beta/interactions`, `store: false`, no tools, and a bounded [JSON Schema response format](https://ai.google.dev/gemini-api/docs/structured-output). It reads completed `model_output` text steps only. Model ID is required from `GEMINI_MODEL`; there is no built-in model fallback.
- Provider decoding uses an independent clone of the application schema with `maxItems` omitted. Live diagnosis found the original bounded-array combination was rejected by Google with HTTP 400; removing only those bounds made the identical request succeed. The 30-row/issue bounds remain mandatory in the application's own validation, alongside field-length, date, quantity, response-byte and timeout limits. Provider schema construction cannot mutate that local validator.
- `store: false` disables saved interaction-history retrieval; it does not override Google's free-tier data policies. The pricing page identifies free-tier inputs as eligible for product improvement. Use fictional demo sources for hackathon testing.
- `src/extractionContract.js` defines the schema and deterministic semantic checks. Required source fields may be `null`. Stock fields include original ingredient name, quantity/unit, batch, production/expiry and explicitly stated shelf-life evidence. Recipe fields include name, yield and ingredient quantities/units. Unknown/approximate quantities and units remain source text with issues; saving is blocked by the existing business validator until corrected.
- Dates are not interpreted by locale. Ambiguous source dates require confirmation. When expiry is absent, valid production date plus explicitly stated integer shelf life can be calculated in days/weeks/calendar months/years. Production day is day 0; month/year overflow clamps to that month's last day. The basis and source statement must be reviewed. Missing evidence or unsupported units do not produce a guessed expiry. An uncertain printed expiry is not replaced with a calculation.
- Input content is data, never system instructions. No HTML from the model is rendered as markup. The endpoint cannot access or mutate browser inventory, reservations, recipes or plan status. Adapters populate the same editable previews used by manual input.

## Limits, errors and abuse protection

Text: 12,000 characters; one PNG/JPEG: 2 MiB before base64; complete request: 3,000,000 bytes; at most 30 extracted rows; output: 8,192 tokens and a 256,000-byte provider-response cap. Both client and server check image MIME, signature and size. A 2 MiB base64 image plus request overhead remains below [Vercel's 4.5 MB function payload limit](https://vercel.com/docs/functions/limitations#request-body-size). Oversize images must be cropped/resized by the user; the app does not silently reduce legibility.

The server aborts provider work after 25 seconds and the client after 30 seconds. Requests are not automatically retried. Missing config, access denial, unavailable models/request format, 429/quota, timeout, network and malformed output have safe messages; upstream error bodies are never returned. The app does not switch to a paid model/service. Billing remains governed by your Google project's tier; code cannot force free-tier billing on an already paid project.

The public endpoint requires same-origin POST JSON, rejects cross-site browser requests and limits a warm instance to **5 requests per IP / 10 minutes**, **30 total / 10 minutes**, and **2 in flight**. IP buckets are bounded. On Vercel it uses platform-forwarded client addressing; locally it uses the socket address. These are **in-memory, single-instance limits**: cold starts and multiple instances reset/split counters, Origin can be forged by non-browser callers, and shared networks may share an allowance. They are not authentication or a project-wide quota. Before a broad public demo, configure Vercel Firewall rate limits or deployment protection and monitor Google quota. Frontend button disabling is only usability protection.

## Vercel configuration and later deployment

No remote settings or deployments were changed by this implementation.

1. In the existing Vercel project, open **Settings → Environment Variables**. Add `GEMINI_API_KEY` as a sensitive server variable and `GEMINI_MODEL=gemini-3.5-flash-lite`. Select Preview first; add Production only when ready. Never add a `VITE_` prefix. See [Vercel environment-variable management](https://vercel.com/docs/environment-variables/managing-environment-variables).
2. When you decide to publish, make these local source changes available through your normal repository/deployment process. Env variables alone cannot add the new function to the old deployed build. This task does not commit or push for you.
3. Create a new **Preview** deployment containing `api/`, `server/`, `src/` and `vercel.json` plus the normal project files. Use the existing Vite framework, `npm run build`, output `dist`, and Node.js 24.x. No rewrite should divert `/api/extract` to `index.html`. The function has a 60-second maximum duration; its own provider timeout remains 25 seconds.
4. Verify the real stock/recipe text and image flows on that preview, including 429/failure handling and no mutation before confirmation. Once you choose to release, deploy/promote the reviewed version to Production. Environment-variable changes apply to new deployments, so redeploy after changing them. Do not upload `.env.local`.

## Checks and remaining manual verification

`npm.cmd test` uses fake provider responses and non-secret sentinel credentials. It covers missing fields/yield, ambiguous dates, explicit shelf-life arithmetic, unknown units, bad JSON/schema, 429, access/model/network failures, timeouts, image limits, no stock change before confirmation, and a real localhost HTTP round trip to the shared handler. Existing migration/reservation/lifecycle tests and Replit 61/45 comparisons remain. The automated tests do not call live Gemini or prove your key's model access. Run `npm.cmd run build` for the frontend production build.

The project owner has reported manual acceptance of the current functionality. A live-key text-stock API acceptance run also succeeded locally. The coding agent did not perform browser automation; automated Gemini tests use simulated provider responses. Recheck text/image extraction, confirmation and refresh recovery on the eventual Preview deployment. See the [Release Guide](release-guide.md) for the exact local change set and publishing prerequisites.

### Live diagnosis: October 23, 2026

The original `MODEL_UNAVAILABLE` response combined Google HTTP 400 and 404 and exposed neither cause. Environment loading was checked with key presence only and model `gemini-3.5-flash-lite`. The official model metadata request returned 200. An extremely short text interaction and a minimal JSON Schema interaction both returned 200. The full stock request returned Google 400, code `invalid_request`, message `Request contains an invalid argument.` This was an upstream rejection, mapped by the old local handler to 503; it was not a missing local route or unloaded key.

A controlled comparison kept key, model, endpoint, generation parameters, prompt and three source rows unchanged and removed only schema `maxItems`; Google returned 200. This isolates the bounded-array schema combination as the rejection trigger. Google's structured-output documentation describes constrained-decoding complexity limits. No model, API key, billing or deployment setting was changed.

After correction, a real localhost `POST /api/extract` returned 200 from both Google and the app, extracting Tofu 1500 g, Mushrooms 1000 g and Green peppers 800 g with the supplied batch/expiry dates and null for the missing mushroom production date. No confirm action ran and no inventory was written. Automated tests use mocks and remain independent of this manual live check.

Google 400 now becomes local `502 REQUEST_REJECTED`; Google 404 becomes local `503 MODEL_NOT_FOUND`. Provider errors produce a bounded **server-only** `[FreshPlate Gemini]` diagnostic containing upstream HTTP status, error status/code and redacted message. Keys, credential headers, URLs and request details are removed; complete provider bodies are not logged or sent to the browser. No automatic retries are added.

Restart the existing local process after this source change (Ctrl+C, then `npm.cmd run dev:full`). Keep the same browser origin to retain its inventory. There is no need to re-enter the configured key, clear localStorage or reset the demo.
