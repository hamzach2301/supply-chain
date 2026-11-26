// Route distance provenance. Every available distance comes from the existing
// synthetic shipment records; no straight-line or invented road distance is used.
function pairKey(a, b) { return [a, b].sort().join('|'); }
function median(values) {
  const sorted = [...values].sort((x, y) => x - y), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function representative(rows) {
  const target = median(rows.map(row => row.distanceKm));
  return rows.reduce((best, row) =>
    Math.abs(row.distanceKm - target) < Math.abs(best.distanceKm - target) ||
    (Math.abs(row.distanceKm - target) === Math.abs(best.distanceKm - target) && row.id < best.id) ? row : best, rows[0]);
}
function conditionsOf(row) {
  return {
    roadQuality: row.roadQuality, trafficIntensity: row.trafficIntensity,
    portCongestion: row.portCongestion, portEfficiency: row.portEfficiency,
    logisticsConnectivity: row.logisticsConnectivity
  };
}
function routeId(from, to, mode) { return `${from.id}-${to.id}-${mode.toLowerCase()}`.replace(/[^a-z0-9-]/gi, '-'); }

function buildRouteRegistry(trainingRows, locations, modes) {
  const byName = new Map(locations.map(loc => [loc.name, loc]));
  const grouped = new Map();
  for (const row of trainingRows) {
    if (!byName.has(row.origin) || !byName.has(row.destination) || !modes.includes(row.mode)) continue;
    const key = `${pairKey(row.origin, row.destination)}|${row.mode}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const available = [];
  for (const [key, rows] of grouped) {
    const parts = key.split('|'), mode = parts.pop();
    const [nameA, nameB] = parts;
    const record = representative(rows);
    available.push({
      id: routeId(byName.get(nameA), byName.get(nameB), mode),
      from: nameA, to: nameB, mode,
      distanceKm: record.distanceKm,
      distanceUnit: 'km',
      distanceSource: 'existing synthetic shipment distance in the training subset',
      provenance: 'dataset-recorded distance',
      approximate: false,
      available: true,
      sampleCount: rows.length,
      representativeRecordId: record.id,
      conditions: conditionsOf(record),
      note: 'Distance is copied from a recorded shipment. It is not a road-geometry or turn-by-turn route.'
    });
  }

  const byKey = new Map(available.map(route => [`${pairKey(route.from, route.to)}|${route.mode}`, route]));
  const list = [...available];
  for (let i = 0; i < locations.length; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      for (const mode of modes) {
        const key = `${pairKey(locations[i].name, locations[j].name)}|${mode}`;
        if (byKey.has(key)) continue;
        list.push({
          id: routeId(locations[i], locations[j], mode),
          from: locations[i].name, to: locations[j].name, mode,
          distanceKm: null, distanceUnit: 'km', distanceSource: null,
          provenance: 'missing route distance',
          approximate: false,
          available: false,
          sampleCount: 0,
          representativeRecordId: null,
          conditions: null,
          reason: 'No historical shipment distance for this route and mode exists in the training subset.',
          note: 'No verified distance is available, so no model prediction is produced.'
        });
      }
    }
  }

  function get(origin, destination, mode) {
    return byKey.get(`${pairKey(origin, destination)}|${mode}`) || null;
  }
  function countsByLocation() {
    const counts = {};
    for (const route of available) {
      counts[route.from] = (counts[route.from] || 0) + 1;
      counts[route.to] = (counts[route.to] || 0) + 1;
    }
    return counts;
  }
  return { available, list, get, countsByLocation };
}

module.exports = { buildRouteRegistry, pairKey };
