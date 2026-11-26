// Smart Delivery Recommendation service.
// All durations come from the existing Ridge model. Cost estimates are fitted only
// on the same training subset and are used solely for ranking / display.
const { mean, solve } = require('./math');
const { resolveLocation } = require('./geo');

const DAY = 86_400_000;
const OBJECTIVES = {
  fastest: { label: 'Fastest Delivery', weights: { duration: 1, cost: 0, distance: 0 } },
  lowest_cost: { label: 'Lowest Cost', weights: { duration: 0, cost: 1, distance: 0 } },
  balanced: { label: 'Balanced Recommendation', weights: { duration: .5, cost: .4, distance: .1 } }
};
const CONDITION_KEYS = ['roadQuality', 'trafficIntensity', 'portCongestion', 'portEfficiency', 'logisticsConnectivity'];

function serviceError(status, code, message, details) {
  const error = new Error(message);
  error.status = status; error.code = code; error.details = details;
  return error;
}
function round(value, digits = 2) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function span(values) {
  const min = Math.min(...values), max = Math.max(...values);
  return { min, max, span: max - min || 1 };
}
function normalize(value, range) { return (value - range.min) / range.span; }

function fitCostModel(rows) {
  const distances = rows.map(row => row.distanceKm), loads = rows.map(row => row.cargoWeightKg);
  const d = { mean: mean(distances), sd: Math.sqrt(mean(distances.map(x => (x - mean(distances)) ** 2)) || 1) };
  const w = { mean: mean(loads), sd: Math.sqrt(mean(loads.map(x => (x - mean(loads)) ** 2)) || 1) };
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  const totals = rows.map(row => row.fuelCost + row.labourCost + row.otherExpenses);
  const totalMean = mean(totals);
  for (let i = 0; i < rows.length; i++) {
    const x = [1, (distances[i] - d.mean) / d.sd, (loads[i] - w.mean) / w.sd], y = totals[i];
    for (let row = 0; row < 3; row++) {
      b[row] += x[row] * y;
      for (let col = 0; col < 3; col++) A[row][col] += x[row] * x[col];
    }
  }
  for (let i = 1; i < 3; i++) A[i][i] += .5;
  const coefficients = solve(A, b);
  const medianDistance = [...distances].sort((a, c) => a - c)[Math.floor(distances.length / 2)];
  const medianTotal = [...totals].sort((a, c) => a - c)[Math.floor(totals.length / 2)];
  const shares = {
    fuel: rows.reduce((s, row) => s + row.fuelCost, 0) / rows.reduce((s, row) => s + row.fuelCost + row.labourCost + row.otherExpenses, 0),
    labour: rows.reduce((s, row) => s + row.labourCost, 0) / rows.reduce((s, row) => s + row.fuelCost + row.labourCost + row.otherExpenses, 0)
  };
  shares.other = 1 - shares.fuel - shares.labour;

  function estimate(distanceKm, cargoWeightKg) {
    let total = coefficients[0] + coefficients[1] * ((distanceKm - d.mean) / d.sd) + coefficients[2] * ((cargoWeightKg - w.mean) / w.sd);
    if (!Number.isFinite(total) || total <= 0) total = medianTotal * Math.max(.05, distanceKm / medianDistance);
    const fuelCost = round(total * shares.fuel);
    const labourCost = round(total * shares.labour);
    const otherExpenses = round(total - fuelCost - labourCost);
    return { total: round(fuelCost + labourCost + otherExpenses), fuelCost, labourCost, otherExpenses };
  }
  return { estimate, sampleCount: rows.length, basis: 'training-subset cost/distance/load relationship' };
}

function validate(body) {
  const originLocation = resolveLocation(body.origin), destinationLocation = resolveLocation(body.destination);
  if (!originLocation) throw serviceError(422, 'INVALID_ORIGIN', 'Choose a valid origin city.');
  if (!destinationLocation) throw serviceError(422, 'INVALID_DESTINATION', 'Choose a valid destination city.');
  const origin = originLocation.name, destination = destinationLocation.name;
  if (origin === destination) throw serviceError(422, 'SAME_LOCATION', 'Origin and destination must be different.');
  const load = Number(body.cargoWeightKg);
  if (!Number.isFinite(load) || load <= 0 || load > 50000) throw serviceError(422, 'INVALID_LOAD', 'Enter a shipment load between 1 and 50,000 kg.');
  const objective = String(body.objective || '');
  if (!OBJECTIVES[objective]) throw serviceError(422, 'INVALID_OBJECTIVE', 'Choose Fastest Delivery, Lowest Cost, or Balanced Recommendation.');
  const modePreference = String(body.modePreference || 'any');
  if (modePreference !== 'any' && !body.modes.includes(modePreference)) throw serviceError(422, 'UNSUPPORTED_MODE', `Unsupported transportation method: ${modePreference}`);
  let departureIso = null, departureMs = null;
  if (body.departure !== undefined && body.departure !== null && String(body.departure).trim() !== '') {
    departureMs = Date.parse(String(body.departure));
    if (!Number.isFinite(departureMs)) throw serviceError(422, 'INVALID_DEPARTURE', 'Enter a valid departure date and time.');
    departureIso = new Date(departureMs).toISOString();
  }
  return { origin, destination, load, objective, modePreference, departureIso, departureMs, originLocation, destinationLocation };
}

function createRecommendationService({ model, trainingRows, routeRegistry, modes }) {
  const costModels = Object.fromEntries(modes.map(mode => [mode, fitCostModel(trainingRows.filter(row => row.mode === mode))]));

  function buildCandidate(valid, mode, rejected) {
    const route = routeRegistry.get(valid.origin, valid.destination, mode);
    if (!route || !route.available || route.distanceKm === null) {
      rejected.push({ mode, reason: 'No verified route distance is available for this mode.' });
      return null;
    }
    if (!model.categories.origin.includes(valid.origin) || !model.categories.destination.includes(valid.destination)) {
      rejected.push({ mode, reason: 'One or both locations have no historical categorical encoding in the trained model.' });
      return null;
    }
    const cost = costModels[mode].estimate(route.distanceKm, valid.load);
    const feature = {
      origin: valid.origin, destination: valid.destination, mode,
      distanceKm: route.distanceKm, cargoWeightKg: valid.load,
      fuelCost: cost.fuelCost, labourCost: cost.labourCost, otherExpenses: cost.otherExpenses,
      ...route.conditions
    };
    let days;
    try { days = model.predict(feature); }
    catch (error) { rejected.push({ mode, reason: `Model prediction failed: ${error.message}` }); return null; }
    if (!Number.isFinite(days)) { rejected.push({ mode, reason: 'Model returned an invalid duration.' }); return null; }
    return {
      origin: valid.origin, destination: valid.destination, mode,
      routeId: route.id,
      distanceKm: route.distanceKm,
      distanceUnit: route.distanceUnit,
      distanceSource: route.distanceSource,
      provenance: route.provenance,
      approximate: false,
      sampleCount: route.sampleCount,
      representativeRecordId: route.representativeRecordId,
      conditions: route.conditions,
      predictedDays: round(days),
      modelInput: { ...feature },
      estimatedCost: cost.total,
      costBasis: costModels[mode].basis,
      predictionBasis: 'Existing Ridge regression model'
    };
  }

  function explain(best, objective, candidateCount, preference, ranges) {
    const modeText = preference === 'any'
      ? 'All model-supported transportation methods were eligible.'
      : `The selected ${preference} preference was respected.`;
    const condition = best.conditions;
    const conditionText = `Infrastructure inputs came from recorded training data (road ${condition.roadQuality}, traffic ${condition.trafficIntensity}, port congestion ${condition.portCongestion}, port efficiency ${condition.portEfficiency}, connectivity ${condition.logisticsConnectivity}).`;
    if (objective === 'fastest') return `Selected because it has the lowest predicted delivery duration (${best.predictedDays} d) among ${candidateCount} validated candidate${candidateCount === 1 ? '' : 's'}, with an estimated cost of $${best.estimatedCost.toLocaleString('en-US')}. ${modeText} ${conditionText}`;
    if (objective === 'lowest_cost') return `Selected because it has the lowest estimated cost ($${best.estimatedCost.toLocaleString('en-US')}) among ${candidateCount} validated candidate${candidateCount === 1 ? '' : 's'}, with a predicted duration of ${best.predictedDays} d. ${modeText} ${conditionText}`;
    return `Selected because it has the lowest normalized balance score (${best.score.toFixed(3)}) across ${candidateCount} validated candidate${candidateCount === 1 ? '' : 's'}: 50% predicted duration (${best.predictedDays} d), 40% estimated cost ($${best.estimatedCost.toLocaleString('en-US')}), and 10% route distance (${best.distanceKm} km), each scaled across the candidate set (duration range ${ranges.days.span.toFixed(2)} d, cost range $${ranges.cost.span.toFixed(0)}, distance range ${ranges.distance.span.toFixed(0)} km). ${modeText} ${conditionText}`;
  }

  function recommend(body) {
    const valid = validate({ ...body, modes });
    const unsupported = [valid.origin, valid.destination].filter(name =>
      !model.categories.origin.includes(name) || !model.categories.destination.includes(name));
    if (unsupported.length) throw serviceError(422, 'NO_HISTORICAL_ROUTE',
      `${unsupported.join(' and ')} has no verified route distance or historical category in the training subset, so no model-backed recommendation can be produced.`,
      { unsupportedLocations: unsupported, reason: 'The location registry includes these places for the map only.' });
    const rejected = [];
    let candidates = (valid.modePreference === 'any' ? modes : [valid.modePreference])
      .map(mode => buildCandidate(valid, mode, rejected)).filter(Boolean);
    if (!candidates.length) throw serviceError(422, 'NO_VALID_CANDIDATES', 'No valid delivery configuration could be evaluated for this request.', {
      rejected, reason: 'Missing route distances, unsupported locations, or prediction failures left no usable candidates.'
    });

    const ranges = {
      days: span(candidates.map(candidate => candidate.predictedDays)),
      cost: span(candidates.map(candidate => candidate.estimatedCost)),
      distance: span(candidates.map(candidate => candidate.distanceKm))
    };
    const weights = OBJECTIVES[valid.objective].weights;
    for (const candidate of candidates) {
      candidate.normalized = {
        duration: round(normalize(candidate.predictedDays, ranges.days), 4),
        cost: round(normalize(candidate.estimatedCost, ranges.cost), 4),
        distance: round(normalize(candidate.distanceKm, ranges.distance), 4)
      };
      candidate.score = round(
        weights.duration * candidate.normalized.duration +
        weights.cost * candidate.normalized.cost +
        weights.distance * candidate.normalized.distance, 4);
    }
    candidates.sort((a, b) => {
      if (valid.objective === 'fastest') return a.predictedDays - b.predictedDays || a.estimatedCost - b.estimatedCost;
      if (valid.objective === 'lowest_cost') return a.estimatedCost - b.estimatedCost || a.predictedDays - b.predictedDays;
      return a.score - b.score || a.predictedDays - b.predictedDays;
    });
    candidates = candidates.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
    const best = candidates[0];
    const arrivalMs = valid.departureMs === null ? null : valid.departureMs + best.predictedDays * DAY;
    return {
      request: {
        origin: valid.origin, destination: valid.destination, cargoWeightKg: valid.load,
        objective: valid.objective, objectiveLabel: OBJECTIVES[valid.objective].label,
        modePreference: valid.modePreference, departure: valid.departureIso
      },
      best,
      alternatives: candidates.slice(1),
      ranked: candidates,
      candidateCount: candidates.length,
      rejectedCandidates: rejected,
      rankingBasis: {
        objective: valid.objective,
        weights,
        normalizedRanges: {
          durationDays: ranges.days, estimatedCost: ranges.cost, distanceKm: ranges.distance
        },
        note: 'Metrics are min-max normalized across the valid candidates before any balanced weighting.'
      },
      explanation: explain(best, valid.objective, candidates.length, valid.modePreference, ranges),
      departureGuidance: {
        timeOfDayOptimized: false,
        suggestedDeparture: valid.departureIso,
        estimatedArrival: arrivalMs === null ? null : new Date(arrivalMs).toISOString(),
        selectedByUser: valid.departureIso !== null,
        note: valid.departureIso
          ? 'Arrival is the user-selected departure plus the model-predicted duration. No time-of-day optimization was applied.'
          : 'Choose a departure time to calculate an estimated arrival. No time-of-day optimization is available.'
      },
      limitations: [
        'Shipment records and every prediction are synthetic simulations, not carrier promises.',
        'Map connections are schematic; no road geometry or turn-by-turn route is available.',
        'The dataset has order dates only, with no departure hour, day-of-week traffic, or seasonal traffic features, so no departure hour is objectively optimal.',
        'Estimated costs are training-subset statistical estimates, not live quotes.',
        'Algiers and other Algerian map locations have no historical route distances, so they are selectable on the map but excluded from recommendations.'
      ],
      metrics: model.metrics
    };
  }

  return { recommend, costModels, OBJECTIVES };
}

module.exports = { createRecommendationService, OBJECTIVES };
