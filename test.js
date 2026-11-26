const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { shipments, model, modes, routeRegistry, recommender, locationPayload } = require('./server');
const { ALGERIA_OUTLINE } = require('./geo');
const DAY = 86_400_000;
const BASE_DATA_HASH = 'bd48651d21965b5fa6d5ce764f54a5b441611f1b220584ed6c867d58ac888f60';
const BASE_METRICS = { mae: 0.5387861068126258, rmse: 0.6760210385419094, r2: 0.9612552472168814, train: 720, test: 180 };

function hashJson(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function expectError(fn, code) {
  assert.throws(fn, error => error.code === code, `expected ${code}`);
}
let checked = 0;
function pass(name) { checked++; console.log(`  ✓ ${name}`); }

console.log('ML integrity');
assert.equal(shipments.length, 900);
assert.equal(hashJson(shipments), BASE_DATA_HASH);
pass('900 synthetic records unchanged (SHA-256 matches baseline)');
for (const [key, value] of Object.entries(BASE_METRICS)) assert.equal(model.metrics[key], value);
assert.equal(model.metrics.method, 'Ridge regression');
pass('MAE, RMSE, R², split sizes, and method unchanged');
assert.equal(model.trainingRows.length, 720);
assert.equal(model.testRows.length, 180);
const trainIds = new Set(model.trainingRows.map(row => row.id));
assert(model.testRows.every(row => !trainIds.has(row.id)));
const expectedTrain = [...shipments].sort((a, b) => {
  const h = s => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
  return h(a.id) - h(b.id);
}).slice(0, 720);
assert.deepEqual(model.trainingRows.map(row => row.id), expectedTrain.map(row => row.id));
pass('deterministic 80/20 ID split preserved; test rows never in training');
assert(!model.featureNames.includes('actualDeliveryDays'));
assert(!model.featureNames.some(name => /date|hour|weekday|month/i.test(name)));
assert(model.featureNames[0] === 'intercept');
pass('no target or temporal feature leaked into the model');
for (const row of model.testRows) assert(model.predict(row) >= 0.2);

console.log('Geography and route provenance');
assert(ALGERIA_OUTLINE.length > 50);
const payload = locationPayload();
const algiers = payload.find(loc => loc.name === 'Algiers');
assert(algiers && algiers.aliases.includes('Alger') && algiers.mapRegion === 'algeria');
assert.equal(algiers.historicalRouteCount, 0);
assert.equal(payload.filter(loc => loc.dataset).length, 10);
assert(payload.find(loc => loc.name === 'Rotterdam').historicalRouteCount > 0);
pass('Algiers, all 10 dataset cities, and outline registered consistently');
const trainingById = new Map(model.trainingRows.map(row => [row.id, row]));
assert.equal(routeRegistry.available.length, 215);
for (const route of routeRegistry.available) {
  assert.equal(route.approximate, false);
  assert.equal(route.distanceSource, 'existing synthetic shipment distance in the training subset');
  const record = trainingById.get(route.representativeRecordId);
  assert(record && record.distanceKm === route.distanceKm);
}
pass('every available distance is copied from a training-subset record');
for (const mode of modes) {
  const route = routeRegistry.get('Algiers', 'Rotterdam', mode);
  assert(!route || !route.available);
  assert(!route || route.distanceKm === null);
}
pass('Algiers routes expose missing distance instead of an invented value');

console.log('Recommendation engine');
const base = { origin: 'Rotterdam', destination: 'Hamburg', cargoWeightKg: 6200, objective: 'balanced', modePreference: 'any' };
const balanced = recommender.recommend(base);
assert.equal(balanced.candidateCount, 5);
assert(balanced.alternatives.length >= 2);
assert(balanced.explanation.includes('normalized balance score'));
pass('balanced objective returns ranked candidates plus alternatives');
for (const candidate of balanced.ranked) {
  assert.equal(candidate.approximate, false);
  assert.equal(candidate.provenance, 'dataset-recorded distance');
  assert.equal(candidate.predictionBasis, 'Existing Ridge regression model');
  assert(Math.abs(model.predict(candidate.modelInput) - candidate.predictedDays) < 0.006);
}
pass('all durations come from the existing Ridge model on recorded distances');
const fastest = recommender.recommend({ ...base, objective: 'fastest' });
assert.deepEqual(fastest.ranked.map(c => c.predictedDays), [...fastest.ranked.map(c => c.predictedDays)].sort((a, b) => a - b));
assert(fastest.explanation.includes('lowest predicted delivery duration'));
const cheapest = recommender.recommend({ ...base, objective: 'lowest_cost' });
assert.deepEqual(cheapest.ranked.map(c => c.estimatedCost), [...cheapest.ranked.map(c => c.estimatedCost)].sort((a, b) => a - b));
assert(cheapest.explanation.includes('lowest estimated cost'));
pass('fastest and lowest-cost objectives rank by their own units, not mixed scores');
const railOnly = recommender.recommend({ ...base, objective: 'fastest', modePreference: 'Rail' });
assert(railOnly.ranked.every(c => c.mode === 'Rail'));
assert(railOnly.explanation.includes('Rail preference was respected'));
pass('transport preference filters unsupported or unwanted modes');
const departure = '2026-11-27T09:00:00Z';
const timed = recommender.recommend({ ...base, departure });
assert.equal(timed.departureGuidance.timeOfDayOptimized, false);
assert.equal(timed.departureGuidance.suggestedDeparture, new Date(departure).toISOString());
const arrivalDelta = Date.parse(timed.departureGuidance.estimatedArrival) - Date.parse(timed.departureGuidance.suggestedDeparture);
assert(Math.abs(arrivalDelta - timed.best.predictedDays * DAY) < 1000);
assert(timed.limitations.some(text => /order dates only/i.test(text)));
pass('arrival = chosen departure + predicted duration, with no traffic claim');
expectError(() => recommender.recommend({ ...base, cargoWeightKg: -5 }), 'INVALID_LOAD');
expectError(() => recommender.recommend({ ...base, destination: 'Rotterdam' }), 'SAME_LOCATION');
expectError(() => recommender.recommend({ ...base, modePreference: 'Hovercraft' }), 'UNSUPPORTED_MODE');
expectError(() => recommender.recommend({ ...base, origin: 'Algiers', destination: 'Rotterdam' }), 'NO_HISTORICAL_ROUTE');
expectError(() => recommender.recommend({ ...base, origin: 'Atlantis' }), 'INVALID_ORIGIN');
pass('invalid loads, locations, modes, and unsupported Algerian routes are rejected');
const missing = routeRegistry.list.find(route => !route.available && model.categories.origin.includes(route.from) && model.categories.destination.includes(route.to));
if (missing) {
  expectError(() => recommender.recommend({ origin: missing.from, destination: missing.to, cargoWeightKg: 1000, objective: 'fastest', modePreference: missing.mode }), 'NO_VALID_CANDIDATES');
  pass('missing dataset route distance produces no fabricated prediction');
}
expectError(() => recommender.recommend({ ...base, origin: 'Alger', destination: 'Hamburg' }), 'NO_HISTORICAL_ROUTE');
assert(locationPayload().find(loc => loc.name === 'Algiers').aliases.includes('Alger'));
pass('Algiers alias resolves and still hits the explicit no-history guard');

console.log(`\n${checked} test groups passed.`);
