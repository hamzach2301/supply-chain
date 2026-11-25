const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3030);
const ROOT = __dirname;
const DAY = 86_400_000;

function rng(seed = 20261114) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function pick(r, xs) { return xs[Math.floor(r() * xs.length)]; }
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function solve(A, b) {
  const n = b.length, m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    if (Math.abs(m[col][col]) < 1e-10) m[col][col] = 1e-10;
    const d = m[col][col]; for (let j = col; j <= n; j++) m[col][j] /= d;
    for (let r = 0; r < n; r++) if (r !== col) { const f = m[r][col]; for (let j = col; j <= n; j++) m[r][j] -= f * m[col][j]; }
  }
  return m.map(row => row[n]);
}

const cities = [
  { name: 'Rotterdam', country: 'Netherlands', port: 8 }, { name: 'Hamburg', country: 'Germany', port: 9 },
  { name: 'Antwerp', country: 'Belgium', port: 8 }, { name: 'Paris', country: 'France', port: 3 },
  { name: 'Lyon', country: 'France', port: 2 }, { name: 'Milan', country: 'Italy', port: 4 },
  { name: 'Barcelona', country: 'Spain', port: 7 }, { name: 'Warsaw', country: 'Poland', port: 2 },
  { name: 'Dubai', country: 'UAE', port: 10 }, { name: 'Singapore', country: 'Singapore', port: 10 }
];
const modeProfiles = {
  Road: { speed: 620, base: .85, fuel: .19, labour: .13, other: .06 },
  Rail: { speed: 490, base: 1.3, fuel: .10, labour: .08, other: .10 },
  Sea: { speed: 310, base: 3.1, fuel: .055, labour: .05, other: .17 },
  Air: { speed: 4900, base: .55, fuel: .74, labour: .21, other: .29 },
  Multimodal: { speed: 430, base: 2.0, fuel: .15, labour: .12, other: .15 }
};

function generateData(n = 900) {
  const r = rng(), modes = Object.keys(modeProfiles), data = [];
  for (let i = 0; i < n; i++) {
    let origin = pick(r, cities), destination = pick(r, cities); while (destination.name === origin.name) destination = pick(r, cities);
    const mode = pick(r, modes), p = modeProfiles[mode];
    const distanceKm = Math.round(180 + r() * (mode === 'Air' ? 8700 : 3300));
    const cargoWeightKg = Math.round(100 + r() * 18_000);
    const roadQuality = 1 + Math.floor(r() * 10), trafficIntensity = 1 + Math.floor(r() * 10);
    const portCongestion = 1 + Math.floor(r() * 10), portEfficiency = 1 + Math.floor(r() * 10), logisticsConnectivity = 1 + Math.floor(r() * 10);
    const needsPort = ['Sea', 'Multimodal'].includes(mode) ? 1 : 0;
    const fuelCost = +(distanceKm * p.fuel * (1 + cargoWeightKg / 60_000) * (0.92 + r() * .18)).toFixed(2);
    const labourCost = +(distanceKm * p.labour * (1 + cargoWeightKg / 100_000) * (0.92 + r() * .18)).toFixed(2);
    const otherExpenses = +(distanceKm * p.other * (0.9 + r() * .2) + p.base * 45).toFixed(2);
    const noise = (r() - .5) * 1.15;
    const actualDeliveryDays = +clamp(
      p.base + distanceKm / p.speed + cargoWeightKg / 180_000 + trafficIntensity * .075 - roadQuality * .055 +
      needsPort * (portCongestion * .16 - portEfficiency * .11) - logisticsConnectivity * .065 + noise, .3, 45).toFixed(2);
    const plannedDays = Math.max(.5, +(actualDeliveryDays - .35 + (r() - .5) * .9).toFixed(1));
    data.push({ id: `SHP-${String(i + 1).padStart(4, '0')}`, origin: origin.name, destination: destination.name, mode,
      distanceKm, cargoWeightKg, fuelCost, labourCost, otherExpenses, roadQuality, trafficIntensity, portCongestion,
      portEfficiency, logisticsConnectivity, actualDeliveryDays, plannedDays, orderDate: new Date(Date.UTC(2025, Math.floor(r() * 12), 1 + Math.floor(r() * 28))).toISOString().slice(0, 10) });
  }
  return data;
}

const numeric = ['distanceKm', 'cargoWeightKg', 'fuelCost', 'labourCost', 'otherExpenses', 'roadQuality', 'trafficIntensity', 'portCongestion', 'portEfficiency', 'logisticsConnectivity'];
const categorical = ['origin', 'destination', 'mode'];
function fitModel(data) {
  // Split is based only on a seeded shuffle of row IDs. Test records never influence preprocessing.
  const shuffled = [...data].sort((a, b) => hash(a.id) - hash(b.id));
  const cut = Math.floor(shuffled.length * .8), train = shuffled.slice(0, cut), test = shuffled.slice(cut);
  const num = Object.fromEntries(numeric.map(k => { const xs = train.map(x => x[k]); const m = mean(xs); return [k, { mean: m, sd: Math.sqrt(mean(xs.map(x => (x - m) ** 2)) || 1) }]; }));
  const categories = Object.fromEntries(categorical.map(k => [k, [...new Set(train.map(x => x[k]))].sort()]));
  const featureNames = ['intercept', ...numeric, ...categorical.flatMap(k => categories[k].slice(1).map(v => `${k}:${v}`))];
  const vector = row => [1, ...numeric.map(k => (row[k] - num[k].mean) / num[k].sd), ...categorical.flatMap(k => categories[k].slice(1).map(v => row[k] === v ? 1 : 0))];
  const p = featureNames.length, A = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
  for (const row of train) { const x = vector(row), y = row.actualDeliveryDays; for (let i = 0; i < p; i++) { b[i] += x[i] * y; for (let j = 0; j < p; j++) A[i][j] += x[i] * x[j]; } }
  for (let i = 1; i < p; i++) A[i][i] += .8; // ridge penalty; intercept is not penalized
  const coefficients = solve(A, b);
  const predict = row => Math.max(.2, vector(row).reduce((s, v, i) => s + v * coefficients[i], 0));
  const predictions = test.map(predict), targets = test.map(x => x.actualDeliveryDays), targetMean = mean(targets);
  const mae = mean(targets.map((y, i) => Math.abs(y - predictions[i])));
  const rmse = Math.sqrt(mean(targets.map((y, i) => (y - predictions[i]) ** 2)));
  const ssRes = targets.reduce((s, y, i) => s + (y - predictions[i]) ** 2, 0), ssTot = targets.reduce((s, y) => s + (y - targetMean) ** 2, 0);
  return { predict, featureNames, categories, metrics: { mae, rmse, r2: 1 - ssRes / ssTot, train: train.length, test: test.length, method: 'Ridge regression' } };
}
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

const shipments = generateData();
const model = fitModel(shipments);
function summary(data) {
  const average = key => mean(data.map(x => x[key]));
  const total = key => data.reduce((s, x) => s + x[key], 0);
  const cost = x => x.fuelCost + x.labourCost + x.otherExpenses;
  const bottleneck = x => x.trafficIntensity >= 8 || x.roadQuality <= 3 || x.portCongestion >= 8;
  const grouped = (key, calc = x => x.actualDeliveryDays) => Object.entries(data.reduce((o, x) => { (o[x[key]] ||= []).push(x); return o; }, {})).map(([name, rows]) => ({ name, value: mean(rows.map(calc)), count: rows.length }));
  const month = Array.from({ length: 12 }, (_, i) => { const rows = data.filter(x => new Date(x.orderDate).getUTCMonth() === i); return { name: new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2025, i, 1)), value: rows.length ? averageOf(rows, 'actualDeliveryDays') : null, count: rows.length }; });
  const conditions = [
    ['Optimal', x => x.roadQuality >= 7 && x.trafficIntensity <= 4 && x.portCongestion <= 4],
    ['Average', x => x.roadQuality >= 4 && x.roadQuality <= 7 && x.trafficIntensity >= 4 && x.trafficIntensity <= 7],
    ['Congested', x => x.trafficIntensity >= 8 || x.portCongestion >= 8 || x.roadQuality <= 3]
  ].map(([name, f]) => { const rows = data.filter(f); return { name, value: rows.length ? averageOf(rows, 'actualDeliveryDays') : 0, count: rows.length }; });
  const costByMode = Object.entries(data.reduce((o, x) => { (o[x.mode] ||= []).push(x); return o; }, {})).map(([name, rows]) => ({ name, count: rows.length, fuelCost: averageOf(rows, 'fuelCost'), labourCost: averageOf(rows, 'labourCost'), otherExpenses: averageOf(rows, 'otherExpenses') }));
  return { kpis: { averageDays: average('actualDeliveryDays'), onTimeRate: data.filter(x => x.actualDeliveryDays <= x.plannedDays).length / data.length * 100, totalCost: total('fuelCost') + total('labourCost') + total('otherExpenses'), averageCost: mean(data.map(cost)), bottleneckRate: data.filter(bottleneck).length / data.length * 100, records: data.length }, month, mode: grouped('mode'), origins: grouped('origin'), destination: grouped('destination'), costByMode, conditions, bottlenecks: [{ name: 'High traffic (8–10)', value: data.filter(x => x.trafficIntensity >= 8).length / data.length * 100 }, { name: 'Poor road quality (1–3)', value: data.filter(x => x.roadQuality <= 3).length / data.length * 100 }, { name: 'High port congestion (8–10)', value: data.filter(x => x.portCongestion >= 8).length / data.length * 100 }] };
}
function averageOf(rows, key) { return mean(rows.map(x => x[key])); }
function filtered(query) { return shipments.filter(x => (!query.mode || x.mode === query.mode) && (!query.origin || x.origin === query.origin) && (!query.destination || x.destination === query.destination) && (!query.severity || (query.severity === 'bottleneck' ? (x.trafficIntensity >= 8 || x.roadQuality <= 3 || x.portCongestion >= 8) : !(x.trafficIntensity >= 8 || x.roadQuality <= 3 || x.portCongestion >= 8)))); }
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON body')); } }); }); }
function validInput(input) { const out = {}; for (const k of numeric) { const v = Number(input[k]); if (!Number.isFinite(v) || (['roadQuality', 'trafficIntensity', 'portCongestion', 'portEfficiency', 'logisticsConnectivity'].includes(k) && (v < 1 || v > 10)) || (['distanceKm', 'cargoWeightKg', 'fuelCost', 'labourCost', 'otherExpenses'].includes(k) && v < 0)) throw new Error(`Enter a valid ${k}.`); out[k] = v; } for (const k of categorical) { if (!model.categories[k].includes(input[k])) throw new Error(`Choose a valid ${k}.`); out[k] = input[k]; } return out; }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/meta') return json(res, 200, { cities: cities.map(x => x.name), modes: Object.keys(modeProfiles), metrics: model.metrics, model: 'Ridge regression with train-only scaling and one-hot encoding', recordCount: shipments.length });
    if (url.pathname === '/api/dashboard') { const data = filtered(Object.fromEntries(url.searchParams)); if (!data.length) return json(res, 422, { error: 'No shipments match these filters.' }); return json(res, 200, summary(data)); }
    if (url.pathname === '/api/predict' && req.method === 'POST') { const input = validInput(await readBody(req)); const days = model.predict(input), cost = input.fuelCost + input.labourCost + input.otherExpenses; return json(res, 200, { days, cost, arrivalDate: new Date(Date.now() + days * DAY).toISOString(), metrics: model.metrics }); }
    if (url.pathname === '/api/scenario' && req.method === 'POST') { const body = await readBody(req), baseline = validInput(body.baseline), scenario = validInput(body.scenario), b = model.predict(baseline), s = model.predict(scenario); return json(res, 200, { baselineDays: b, scenarioDays: s, deltaDays: s - b, changePercent: (s - b) / b * 100 }); }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const target = path.resolve(ROOT, file); if (!target.startsWith(ROOT) || !fs.existsSync(target)) { res.writeHead(404); return res.end('Not found'); }
    const type = target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(target).pipe(res);
  } catch (error) { json(res, 400, { error: error.message || 'Request failed.' }); }
});
server.listen(PORT, () => console.log(`Delivery Time Prediction and Analytics Platform: http://localhost:${PORT}`));
