import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLocalLocation,
  calculateGeodesicDistanceKm,
  RoutePlanner,
} from './routePlanner.js';

test('resolveLocalLocation resolves Antarctica, Tokyo, New York, Sydney, and pin objects correctly', () => {
  const antarctica = resolveLocalLocation('Antarctica');
  assert.ok(antarctica, 'Antarctica must resolve');
  assert.equal(antarctica.label, 'Antarctica');
  assert.equal(antarctica.lat, -75);

  const tokyo = resolveLocalLocation('Tokyo');
  assert.ok(tokyo, 'Tokyo must resolve');
  assert.equal(tokyo.lat, 35.6586);

  const nyc = resolveLocalLocation('New York');
  assert.ok(nyc, 'New York must resolve');
  assert.equal(nyc.lat, 40.6892);

  const sydney = resolveLocalLocation('Sydney');
  assert.ok(sydney, 'Sydney must resolve');
  assert.equal(sydney.lat, -33.8688);

  const pinObject = resolveLocalLocation({ lat: 12.34, lon: 56.78, label: 'Custom Pin' });
  assert.ok(pinObject, 'Pin object must resolve');
  assert.equal(pinObject.lat, 12.34);
  assert.equal(pinObject.lon, 56.78);
  assert.equal(pinObject.label, 'Custom Pin');
});

test('resolveLocalLocation returns null for unknown location', () => {
  const invalid = resolveLocalLocation('invalid_location_xyz_99999');
  assert.equal(invalid, null);
});

test('calculateGeodesicDistanceKm calculates correct distances', () => {
  const distNycTokyo = calculateGeodesicDistanceKm(40.6892, -74.0445, 35.6586, 139.7454);
  assert.ok(distNycTokyo > 10000 && distNycTokyo < 12000, `Expected ~10,850 km, got ${distNycTokyo}`);

  const distAntarcticaTokyo = calculateGeodesicDistanceKm(-75, 0, 35.6586, 139.7454);
  assert.ok(distAntarcticaTokyo > 12000 && distAntarcticaTokyo < 17000, `Expected ~15,162 km, got ${distAntarcticaTokyo}`);
});

test('RoutePlanner produces route for METHOD A (search-based: Antarctica → Tokyo, New York → Tokyo)', () => {
  const planner = new RoutePlanner();
  const res1 = planner.calculateRoute('Antarctica', 'Tokyo');
  assert.equal(res1.ok, true);
  assert.equal(res1.initial.label, 'Antarctica');
  assert.equal(res1.final.label, 'Tokyo, Japan');
  assert.ok(res1.distanceKm > 10000);

  const res2 = planner.calculateRoute('New York', 'Tokyo');
  assert.equal(res2.ok, true);
  assert.equal(res2.initial.label, 'New York, USA');
  assert.equal(res2.final.label, 'Tokyo, Japan');
  assert.ok(res2.distanceKm > 10000);
});

test('RoutePlanner produces route for METHOD B (pin-based endpoints)', () => {
  const planner = new RoutePlanner();
  planner.initialPinData = { lat: 10, lon: 20, label: 'Pin 1' };
  planner.finalPinData = { lat: 30, lon: 40, label: 'Pin 2' };

  const res = planner.calculateRoute(planner.initialPinData, planner.finalPinData);
  assert.equal(res.ok, true);
  assert.equal(res.initial.lat, 10);
  assert.equal(res.final.lat, 30);
  assert.ok(res.distanceKm > 0);
});

test('RoutePlanner produces route for HYBRID method (search initial + pin final)', () => {
  const planner = new RoutePlanner();
  planner.finalPinData = { lat: 35.6586, lon: 139.7454, label: 'Tokyo Pin' };

  const res = planner.calculateRoute('Antarctica', planner.finalPinData);
  assert.equal(res.ok, true);
  assert.equal(res.initial.label, 'Antarctica');
  assert.equal(res.final.label, 'Tokyo Pin');
  assert.ok(res.distanceKm > 10000);
});

test('RoutePlanner returns proper error messages when location cannot be resolved', () => {
  const planner = new RoutePlanner();
  const res1 = planner.calculateRoute('invalid_start_123', 'Tokyo');
  assert.equal(res1.ok, false);
  assert.equal(res1.error, 'Initial location not found');

  const res2 = planner.calculateRoute('Tokyo', 'invalid_end_456');
  assert.equal(res2.ok, false);
  assert.equal(res2.error, 'Final location not found');
});

test('RoutePlanner clearAll resets route and pin data', () => {
  const planner = new RoutePlanner();
  planner.initialPinData = { lat: 10, lon: 20, label: 'Pin 1' };
  planner.finalPinData = { lat: 30, lon: 40, label: 'Pin 2' };
  
  planner.clearAll();

  assert.equal(planner.initialPinData, null);
  assert.equal(planner.finalPinData, null);
  assert.equal(planner.activeRouteEntity, null);
});
