# Delivery Time Prediction and Analytics Platform

A local, dependency-free Node.js application that generates 900 synthetic shipment records, fits a Ridge regression delivery-time model, and exposes analytics, prediction, an Algeria-focused map, and Smart Delivery Recommendations through a browser dashboard.

## Run it

1. Double-click `run-platform.bat`, or open PowerShell in this folder and run `node server.js`.
2. Open `http://localhost:3030`.

No packages, external API keys, database, or internet connection are required at runtime. On Vercel, the same API is exposed through serverless functions in `api/`, so the deployed frontend talks to its own origin. See [Deployment](#deployment-vercel).

Run the verification suite with:

```powershell
node test.js
```

## Existing application

The original Dashboard, Predictor & What-If, and Target Users views are unchanged in behaviour:

- Dashboard filters: mode, origin, destination, bottleneck severity.
- Predictor: manual baseline inputs, model prediction, and five condition sliders for scenario comparison.
- Target Users: preset buttons that load examples into the predictor.
- API: `/api/meta`, `/api/dashboard`, `/api/predict`, `/api/scenario`.

The dashboard KPIs and held-out metrics remain:

- Average duration `5.23 d`, on-time rate `12.9%`, total cost `$1,636,749`, average cost `$1,819`, bottleneck rate `68.9%`.
- Test MAE `0.5388 d`, RMSE `0.6760 d`, R² `0.9613` (720 train / 180 test records).

## Architecture

| File | Responsibility |
|---|---|
| `server.js` | HTTP server, original dataset/model, API routes, static file serving. Exports `handleRequest` for serverless reuse. |
| `api-client.js` | Shared fetch wrapper: status/content-type checks, safe JSON parsing, structured errors. |
| `api/*.js` | Vercel serverless entry points that delegate to `server.js`. |
| `vercel.json` | Vercel runtime declaration and no-store headers for `/api/*`. |
| `package.json` | Node engine and local/Vercel scripts. No dependencies. |
| `math.js` | Shared seeded RNG, statistics, Gaussian elimination, and ID hash. |
| `geo.js` | Location registry, aliases, coordinates, and simplified Algeria outline. |
| `routes.js` | Route registry and distance provenance derived from training records. |
| `recommend.js` | Validation, candidate evaluation, ranking, explanations, departure guidance. |
| `index.html` | Dashboard shell, map view, recommendation view, design system. |
| `app.js` | Frontend views, SVG map rendering, chart interactions, forms, API calls. |
| `test.js` | Integrity and feature regression checks. |

## Machine learning integrity

The original methodology is preserved exactly:

- 900 deterministic synthetic records are regenerated on server start.
- The 80/20 split is a seeded hash of shipment ID only; it is unchanged.
- Numeric scaling and one-hot category levels are fitted on the 720 training rows only.
- The 180 test rows are used only for MAE, RMSE, and R².
- `actualDeliveryDays` is never an input feature; no temporal feature was added.
- Ridge penalty remains on non-intercept coefficients.

The recommendation engine reuses the same fitted `model.predict()` pipeline. It does not retrain, rescale, or replace the model. Candidate condition values and route distances come from training-subset records; cost estimates use a separate simple statistical fit on the same training subset only and are used for estimated cost/ranking, not for delivery duration.

## Interactive Algeria map

The map is a local, offline-compatible SVG visualization. No external tile service, API key, mapping library, or routing engine is used.

- The Algeria outline is a simplified Natural Earth polygon (public domain) bundled in `geo.js`.
- Algiers (`Alger` alias), Oran, Constantine, Annaba, and Tamanrasset are registered as Algerian map locations.
- All 10 original dataset cities are registered and shown in a labelled **external network** inset, because they are outside Algeria.
- Markers are keyboard-focusable and show location name, country, coordinates, and route-history status when selected. "Set as origin" and "Set as destination" update the route form.
- Faint solid connections represent recorded external-network routes. The selected route is highlighted in mint.
- Dashed amber connections mean **no verified distance**. They are not predictions and are not silently converted into road distances.
- Selecting a connection shows its mode, distance, provenance, and sample count. Submitting an origin/destination/mode with recorded distance also shows the Ridge-model duration for the chosen load.
- Lines are explicitly schematic. They are not road geometry, verified corridors, or turn-by-turn directions.

### Location and route data

Data is organized outside the regression implementation:

- `geo.js` holds stable IDs, names, aliases, country, latitude/longitude, map region, and whether a city appears in the original dataset.
- `routes.js` builds one route entry per unordered location pair and transport mode. Available entries copy `distanceKm` from a representative training-subset shipment and record `sampleCount`, `representativeRecordId`, `distanceSource`, and `provenance`.
- Missing entries keep `distanceKm: null` with an explicit reason. No straight-line or invented road distance is used.
- Units are kilometres. Distances are synthetic dataset records, not surveyed roads.

Algiers is selectable as both origin and destination in the map and recommendation form. Because the original dataset contains no Algiers shipments, it has `historicalRouteCount: 0`; map routes involving it are explicitly unavailable and no recommendation is generated.

## Smart Delivery Recommendation

Open **Smart Recommendations**, enter origin, destination, load, objective, optional transport preference, and optional departure time. Location inputs support native datalist search and accept the `Alger` alias.

For each request the server:

1. Validates locations, load (1–50,000 kg), objective, transport preference, and departure.
2. Resolves route-distance records for each eligible mode.
3. Rejects unsupported locations, missing distances, and unsupported modes.
4. Builds feature rows using recorded distance, user load, training-derived cost components, and recorded infrastructure scores.
5. Calls the existing Ridge model for predicted duration.
6. Normalizes duration, cost, and distance across the valid candidate set before applying objective weights.
7. Ranks candidates and returns the best option, alternatives, score components, and an explanation generated from the actual comparison.

Objectives:

- **Fastest Delivery**: rank by predicted duration; cost is a tie-breaker only.
- **Lowest Cost**: rank by estimated cost; duration is a tie-breaker only.
- **Balanced Recommendation**: `0.50 × normalized duration + 0.40 × normalized cost + 0.10 × normalized distance`.

Normalization is min-max scaling over the candidates for that request, so different units are never added directly.

### Results and map integration

- The best option is shown prominently with route, recorded distance, mode, predicted duration, estimated cost, departure, arrival, and a data-derived explanation.
- All ranked candidates are shown as comparison cards. Selecting one updates both the full map and the result preview map and refreshes the selected-option details.
- If no route distance or no valid candidate exists, the API returns a structured 422 error; the UI shows an empty/error state rather than a fabricated prediction.
- Suggested departure is only the user's chosen time. Estimated arrival is `departure + predictedDuration` from the model.

### Departure-time limitation

The dataset contains only synthetic `orderDate` values. It has no departure hour, weekday traffic, live traffic, or seasonal signal, and the model has no time-dependent features. The application therefore does **not** claim an objectively optimal departure hour or real-time traffic advantage. The departure field is user-controlled and is used only to calculate arrival.

## API

Every endpoint returns `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`. Success bodies include `"success": true`; errors include `"success": false`, `error`, `code`, and optional `details`. Unsupported methods return `405`, unknown API paths return `404`, and malformed request bodies are rejected with `400` — all as JSON, never HTML.

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Real health check. Returns `status: "ok"` only when the model module has loaded and can serve requests. |
| `/api/config` | GET | Returns `apiBase` from `MODEL_API_BASE`, or `""` to use the same origin. Used by the frontend before other calls. |
| `/api/meta` | GET | Original dataset cities, modes, metrics, record count, plus the geographic location list. |
| `/api/dashboard` | GET | Existing filtered dashboard summary. |
| `/api/predict` | POST | Existing manual baseline prediction. |
| `/api/scenario` | POST | Existing baseline/scenario comparison. |
| `/api/locations` | GET | All locations with aliases, coordinates, history counts, and the Algeria outline. |
| `/api/routes` | GET | Available and missing route entries with provenance. |
| `/api/recommend` | POST | Ranked Smart Delivery Recommendation candidates. |

Example recommendation request:

```json
{
  "origin": "Rotterdam",
  "destination": "Hamburg",
  "cargoWeightKg": 6200,
  "objective": "balanced",
  "modePreference": "any",
  "departure": "2026-11-27T09:00"
}
```

Important error codes: `INVALID_ORIGIN`, `INVALID_DESTINATION`, `SAME_LOCATION`, `INVALID_LOAD`, `INVALID_OBJECTIVE`, `UNSUPPORTED_MODE`, `INVALID_DEPARTURE`, `NO_HISTORICAL_ROUTE`, `NO_VALID_CANDIDATES`, `INVALID_JSON_BODY`, `METHOD_NOT_ALLOWED`, `NOT_FOUND`. Client-side codes: `NETWORK_ERROR`, `INVALID_RESPONSE`, `INVALID_JSON`, `API_ERROR`.

## Deployment (Vercel)

The previous deployment was static-only: requests to `/api/meta` were answered by Vercel's static/404 HTML page, so `response.json()` failed with `JSON.parse: unexpected character at line 1 column 1`. The model itself was never reached. This is now fixed by deploying the API as serverless functions on the same origin.

Steps:

1. Import this repository into Vercel. `vercel.json` sets `framework: null` so the root HTML/JS files are served statically and `api/*.js` files are compiled as Node serverless functions.
2. Leave `MODEL_API_BASE` unset for the recommended setup. The frontend calls `/api/config`, receives `apiBase: ""`, and uses same-origin `/api/*` URLs served by `api/health.js`, `api/meta.js`, etc. No `localhost` or `127.0.0.1` URL is used in production.
3. If the model must run as a separate hosted service instead, set the Vercel project environment variable `MODEL_API_BASE` to that service's public HTTPS origin, for example `https://transitiq-api.example.com` (no trailing slash). `/api/config` returns that value and the frontend uses it for all subsequent API calls. The backend must implement the same endpoints and JSON contract. Do not set it to a local address.
4. Redeploy after changing environment variables. `npm test` must pass before deployment.

The dashboard header now calls `/api/health` at startup. It shows “Model service online” only after a valid JSON `status: "ok"` response; otherwise it shows “Checking model service…”, “Model service degraded”, or “Model service unavailable” and displays a readable banner instead of the old `alert()` message.

## Synthetic-data limitations

- All shipments, distances, costs, condition scores, durations, and predictions are synthetic simulations. They are not verified carrier performance or delivery promises.
- Route distances are per-shipment dataset values. A representative value is reused for a route/mode pair; this is not a surveyed road distance.
- Algerian locations have no historical route records, so they are included for geographic exploration and explicit missing-data handling, not for recommendations.
- Cost estimates are statistical estimates from the training subset, not quotes.
- Connections are schematic and do not represent road access, border controls, ferry schedules, or turn-by-turn routing.
- Scenario and recommendation explanations describe model associations within the synthetic data-generating process; they do not prove causal effects.
