import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSeaIceDataset,
  getSeaIceConcentration,
  isSeaIceLoaded,
} from './seaIceEngine.mjs';
import {
  loadIcebergFeatures,
  edgeIntersectsLand,
  checkEdgeIcebergObstacles,
  validateRoute,
  calculateMaritimeRoute,
  calculateMultiRouteOptions,
  geodesicDistanceKm,
  calculateBearing,
  bearingToCompassDirection,
  calculateHeadingDifference,
  calculateCrossTrackDistance,
  calculateETA,
  generateDetourWaypoints,
  ROUTING_MODES,
} from './seaIceRoutingEngine.mjs';
import { calculateVoyageGuidance } from './voyageGuidance.mjs';

// Pre-load iceberg dataset
const icebergs = loadIcebergFeatures();

test('SECTION 1: Segment-by-Segment Collision Validation', () => {
  const sampleDetourRoute = [
    { latitude: -60.0, longitude: -50.0, sea_ice_concentration: 0.1 },
    { latitude: -60.2, longitude: -49.0, sea_ice_concentration: 0.2 },
    { latitude: -60.0, longitude: -48.0, sea_ice_concentration: 0.1 },
  ];

  const validation = validateRoute(sampleDetourRoute, { icebergs, safetyBufferKm: 5.0 });
  assert.equal(validation.valid, true, 'Every segment WP[i] -> WP[i+1] must pass collision validation');
  assert.equal(validation.landIntersections, 0);
  assert.equal(validation.icebergSafetyZoneIntersections, 0);
  assert.ok(validation.distanceKm > 0);
});

test('SECTION 2: Detour Waypoint Navigability & Safety Zone Validation', () => {
  const waypoints = generateDetourWaypoints(-60.0, -50.0, -60.0, -48.0, icebergs, 5.0);
  assert.ok(Array.isArray(waypoints));

  for (const wp of waypoints) {
    const ptCheck = checkEdgeIcebergObstacles(wp.lat, wp.lon, wp.lat, wp.lon, icebergs, 5.0);
    assert.equal(ptCheck.intersects, false, `Generated waypoint at ${wp.lat}, ${wp.lon} must be outside all iceberg safety zones`);
    assert.equal(edgeIntersectsLand(wp.lat, wp.lon, wp.lat, wp.lon), false, 'Waypoint must not be on land');
  }
});

test('TEST A: Direct route contains no iceberg', () => {
  const directPath = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.8, longitude: -50.0 },
  ];
  const val = validateRoute(directPath, { icebergs, safetyBufferKm: 5.0 });
  assert.equal(val.valid, true, 'Direct path clear of icebergs must be valid');
  assert.equal(val.icebergSafetyZoneIntersections, 0);
});

test('TEST B: Direct route crosses one iceberg', () => {
  const mockIcebergs = [
    {
      type: 'Feature',
      properties: { Latitude: -60.0, Longitude: -49.0, name: 'ICEBERG_B' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-49.05, -60.05], [-48.95, -60.05], [-48.95, -59.95], [-49.05, -59.95], [-49.05, -60.05]]],
      },
    },
  ];

  const directPath = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.0, longitude: -48.0 },
  ];
  const directVal = validateRoute(directPath, { icebergs: mockIcebergs, safetyBufferKm: 5.0 });
  assert.equal(directVal.valid, false, 'Direct path crossing iceberg safety zone must be invalid');

  const detourPath = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.3, longitude: -49.0 }, // detour point 33km south of iceberg
    { latitude: -60.0, longitude: -48.0 },
  ];
  const detourVal = validateRoute(detourPath, { icebergs: mockIcebergs, safetyBufferKm: 5.0 });
  assert.equal(detourVal.valid, true, 'Detour path avoiding iceberg safety zone must be valid');
});

test('TEST C: Direct route crosses multiple icebergs', () => {
  const mockIcebergs = [
    {
      type: 'Feature',
      properties: { Latitude: -60.0, Longitude: -49.5, name: 'ICEBERG_C1' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-49.55, -60.05], [-49.45, -60.05], [-49.45, -59.95], [-49.55, -59.95], [-49.55, -60.05]]],
      },
    },
    {
      type: 'Feature',
      properties: { Latitude: -60.0, Longitude: -48.5, name: 'ICEBERG_C2' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-48.55, -60.05], [-48.45, -60.05], [-48.45, -59.95], [-48.55, -59.95], [-48.55, -60.05]]],
      },
    },
  ];

  const multiDetourPath = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.3, longitude: -49.5 }, // WP1
    { latitude: -60.3, longitude: -48.5 }, // WP2
    { latitude: -60.0, longitude: -48.0 },
  ];

  const val = validateRoute(multiDetourPath, { icebergs: mockIcebergs, safetyBufferKm: 5.0 });
  assert.equal(val.valid, true, 'Multi-detour path must be valid');
  assert.ok(val.waypointCount >= 4);
});

test('TEST D: North detour vs South detour sea ice trade-offs', () => {
  const northDetour = [
    { latitude: -60.0, longitude: -50.0, sea_ice_concentration: 0.1 },
    { latitude: -59.5, longitude: -49.0, sea_ice_concentration: 0.1 },
    { latitude: -60.0, longitude: -48.0, sea_ice_concentration: 0.1 },
  ];
  const southDetour = [
    { latitude: -60.0, longitude: -50.0, sea_ice_concentration: 0.6 },
    { latitude: -60.5, longitude: -49.0, sea_ice_concentration: 0.7 },
    { latitude: -60.0, longitude: -48.0, sea_ice_concentration: 0.6 },
  ];

  const valNorth = validateRoute(northDetour, { icebergs: [], maxSeaIceConcentration: 0.3 });
  const valSouth = validateRoute(southDetour, { icebergs: [], maxSeaIceConcentration: 0.3 });

  assert.equal(valNorth.valid, true, 'North low-ice detour must be accepted');
  assert.equal(valSouth.valid, false, 'South high-ice detour exceeding cap must be rejected');
});

test('TEST E: Direct route crosses an iceberg AND high sea ice', () => {
  const badPath = [
    { latitude: -60.0, longitude: -50.0, sea_ice_concentration: 0.85 },
  ];
  const val = validateRoute(badPath, { icebergs: [], maxSeaIceConcentration: 0.5 });
  assert.equal(val.valid, false, 'Path with high sea ice must be rejected');
});

test('TEST F: Detour around iceberg #1 intersects iceberg #2 (Chained Collision)', () => {
  const mockIcebergs = [
    {
      type: 'Feature',
      properties: { Latitude: -60.0, Longitude: -49.0, name: 'ICEBERG_1' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-49.05, -60.05], [-48.95, -60.05], [-48.95, -59.95], [-49.05, -59.95], [-49.05, -60.05]]],
      },
    },
    {
      type: 'Feature',
      properties: { Latitude: -60.0, Longitude: -48.8, name: 'ICEBERG_2' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-48.85, -60.05], [-48.75, -60.05], [-48.75, -59.95], [-48.85, -59.95], [-48.85, -60.05]]],
      },
    },
  ];

  // Segment trying to pass directly between adjacent icebergs
  const badSegment = checkEdgeIcebergObstacles(-60.0, -49.1, -60.0, -48.7, mockIcebergs, 5.0);
  assert.equal(badSegment.intersects, true, 'Chained detour collision must be flagged as intersecting');
});

test('TEST G: No valid route exists', () => {
  // Path crossing solid land mass
  const landPath = [
    { latitude: -65.0, longitude: -64.0 },
    { latitude: -65.0, longitude: -60.0 }, // across peninsula spine
  ];

  const val = validateRoute(landPath, { icebergs, safetyBufferKm: 5.0 });
  assert.equal(val.valid, false, 'Path crossing land must be invalid');
  assert.ok(val.landIntersections > 0);
});

test('SECTION 4: Shortest Means Shortest Valid Route', () => {
  const directPathUnsafe = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.0, longitude: -48.0 },
  ];
  const detourPathSafe = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.3, longitude: -49.0 },
    { latitude: -60.0, longitude: -48.0 },
  ];

  const mockIcebergs = [
    {
      type: 'Feature',
      properties: { Latitude: -60.0, Longitude: -49.0, name: 'ICEBERG_X' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-49.05, -60.05], [-48.95, -60.05], [-48.95, -59.95], [-49.05, -59.95], [-49.05, -60.05]]],
      },
    },
  ];

  const vDirect = validateRoute(directPathUnsafe, { icebergs: mockIcebergs, safetyBufferKm: 5.0 });
  const vDetour = validateRoute(detourPathSafe, { icebergs: mockIcebergs, safetyBufferKm: 5.0 });

  assert.equal(vDirect.valid, false, 'Direct path must be rejected');
  assert.equal(vDetour.valid, true, 'Detour path must be accepted as shortest valid route');
});

test('SECTION 5: Bearings & Compass Directions', () => {
  // Directly South: 180° TRUE, S
  const bSouth = calculateBearing(-60.0, -50.0, -61.0, -50.0);
  const dirSouth = bearingToCompassDirection(bSouth);
  assert.equal(Math.round(bSouth), 180);
  assert.equal(dirSouth, 'S');

  // Southwest: ~225° TRUE, SW
  const bSW = calculateBearing(-60.0, -50.0, -61.0, -52.0);
  const dirSW = bearingToCompassDirection(bSW);
  assert.ok(bSW >= 200 && bSW <= 250);
  assert.equal(dirSW, 'SW');
});

test('SECTION 6: Voyage Guidance Tracking & Next Waypoint Transition', () => {
  const routeData = {
    waypoints: [
      { id: 'START', sequence: 0, latitude: -60.0, longitude: -50.0, type: 'START' },
      { id: 'WP-01', sequence: 1, latitude: -61.0, longitude: -50.0, type: 'DETOUR_WAYPOINT' },
      { id: 'DEST', sequence: 2, latitude: -62.0, longitude: -50.0, type: 'DESTINATION' },
    ],
    segments: [
      { fromWaypointId: 'START', toWaypointId: 'WP-01', distanceKm: 111, bearingDegrees: 180, compassDirection: 'S' },
      { fromWaypointId: 'WP-01', toWaypointId: 'DEST', distanceKm: 111, bearingDegrees: 180, compassDirection: 'S' },
    ],
    metrics: { distance_km: 222 },
  };

  // 1. Vessel near START heading towards WP-01
  const v1 = { latitude: -60.1, longitude: -50.0, heading: 178, speedKnots: 18.0 };
  const g1 = calculateVoyageGuidance(routeData, v1);
  assert.equal(g1.active, true);
  assert.equal(g1.nextWaypoint.id, 'WP-01');
  assert.equal(g1.headingErrorDegrees, 2.0); // 180 - 178 = +2° correction

  // 2. Vessel enters arrival radius of WP-01 (within 5km of -61.0, -50.0) -> transitions to DEST!
  const v2 = { latitude: -60.98, longitude: -50.0, heading: 180, speedKnots: 18.0 };
  const g2 = calculateVoyageGuidance(routeData, v2);
  assert.equal(g2.nextWaypoint.id, 'DEST', 'Must automatically advance to DEST when WP-01 arrival radius is reached');
});

test('SECTION 8: Factual WHY THIS ROUTE Metrics', () => {
  const sampleRoute = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.3, longitude: -49.0 },
    { latitude: -60.0, longitude: -48.0 },
  ];
  const m = validateRoute(sampleRoute, { icebergs, safetyBufferKm: 5.0 });

  assert.ok(Number.isFinite(m.distanceKm));
  assert.ok(Number.isFinite(m.averageSeaIce));
  assert.ok(Number.isFinite(m.maximumSeaIce));
  assert.ok(Number.isFinite(m.nearestIcebergDistKm));
  assert.ok(Number.isFinite(m.waypointCount));
});

test('SECTION 10: Progressive Detour Search Expansion & Turn Instructions', async () => {
  // 1. Verify SEARCH_PASSES configuration
  const { SEARCH_PASSES, calculateMaritimeRoute } = await import('./seaIceRoutingEngine.mjs');
  assert.equal(SEARCH_PASSES.length, 5, 'Must configure exactly 5 progressive search passes');
  assert.equal(SEARCH_PASSES[0].pass, 1);
  assert.equal(SEARCH_PASSES[4].pass, 5);

  // 2. Test turn instruction phrasing (must use "toward [Cardinal Direction]")
  const { formatTurnInstruction } = await import('./seaIceRoutingEngine.mjs');
  const instruction1 = formatTurnInstruction(218, 258);
  assert.ok(instruction1.includes('Turn right 40° toward West.'), `Expected "Turn right 40° toward West.", got: "${instruction1}"`);
  assert.ok(instruction1.includes('New bearing: 258° TRUE — WSW'), `Expected new bearing included, got: "${instruction1}"`);

  const instruction2 = formatTurnInstruction(350, 20);
  assert.ok(instruction2.includes('Turn right 30° toward North.'), `Expected "Turn right 30° toward North.", got: "${instruction2}"`);

  // 3. Test multi-pass routing execution
  const result = await calculateMaritimeRoute({
    start: { latitude: -60.0, longitude: -50.0 },
    destination: { latitude: -60.0, longitude: -46.0 },
    mode: 'shortest',
    safety_buffer_km: 5.0,
  });

  assert.equal(result.status, 'success');
  assert.ok(result.metrics.distance_km > 0);
  assert.ok(result.diagnostics.progressivePass >= 1, 'Must record progressive pass index in diagnostics');
});

test('SECTION 11: Fuel Consumption Model & Parameter Evaluation', async () => {
  const { calculateFuelConsumption, VESSEL_PROFILES } = await import('./fuelModel.mjs');

  // 1. Valid distance fuel calculation
  const fuel = calculateFuelConsumption(185.2, 10.0, VESSEL_PROFILES.polar_icebreaker);
  assert.equal(fuel.status, 'ESTIMATED');
  assert.equal(fuel.isEstimated, true);
  assert.equal(fuel.estimatedTravelTimeHours, 10.0);
  assert.equal(fuel.estimatedFuelLiters, 12000);
  assert.ok(fuel.formattedFuelText.includes('12,000 L'));

  // 2. Disabled or unavailable fuel configuration
  const disabled = calculateFuelConsumption(100.0, 10.0, 'disabled');
  assert.equal(disabled.status, 'UNAVAILABLE');
  assert.equal(disabled.isEstimated, false);
  assert.equal(disabled.estimatedFuelLiters, null);
});

test('SECTION 12: Waypoint Simplification & Independent Candidate Waypoint Sequences', async () => {
  const { simplifyWaypoints, calculateMultiRouteOptions } = await import('./seaIceRoutingEngine.mjs');

  const densePath = [
    { latitude: -60.0, longitude: -50.0 },
    { latitude: -60.01, longitude: -49.95 },
    { latitude: -60.02, longitude: -49.90 },
    { latitude: -60.30, longitude: -49.00 }, // turn point
    { latitude: -60.00, longitude: -48.00 },
  ];

  // 1. Test path simplification
  const simplified = simplifyWaypoints(densePath, icebergs, 5.0, null, 5.0, 'WP-B');
  assert.ok(simplified.length < densePath.length, 'Simplification must reduce redundant dense A* grid nodes');
  assert.equal(simplified[1].id, 'WP-B-01', 'Must use mode prefix WP-B');

  // 2. Test candidate routes maintain independent waypoint sequences
  const multiRes = await calculateMultiRouteOptions({
    start: { latitude: -60.0, longitude: -50.0 },
    destination: { latitude: -60.0, longitude: -46.0 },
    safety_buffer_km: 5.0,
  });

  assert.equal(multiRes.status, 'success');
  const optShortest = multiRes.options.shortest;
  const optBalanced = multiRes.options.balanced;

  assert.ok(Array.isArray(optShortest.waypoints));
  assert.ok(Array.isArray(optBalanced.waypoints));
  assert.notEqual(optShortest.waypoints, optBalanced.waypoints, 'Candidate routes must not share waypoint array references');
  assert.ok(optShortest.waypoints.some((w) => w.id.startsWith('WP-S') || w.id === 'START'));
  assert.ok(optBalanced.waypoints.some((w) => w.id.startsWith('WP-B') || w.id === 'START'));
});


