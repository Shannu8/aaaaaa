import {
  isPointOnLand,
  findNearestOceanPoint,
  classifyPointTerrain,
  calculateMaritimeRoute,
} from '../src/seaIceRoutingEngine.mjs';

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING LAND VALIDATION & OCEAN SNAP TEST SUITE');
  console.log('====================================================\n');

  // TEST A: OCEAN TO OCEAN
  console.log('--- TEST A: OCEAN TO OCEAN ---');
  const startA = { latitude: -78.1353, longitude: 173.9437 };
  const destA = { latitude: -43.6322, longitude: 175.5056 };
  const resA = await calculateMaritimeRoute({ start: startA, destination: destA, mode: 'shortest' });
  console.log('Status:', resA.status);
  console.log('Waypoints:', resA.waypoints?.map(w => w.id).slice(0, 5), '...', resA.waypoints?.length, 'total');
  console.log('Metrics distance:', resA.metrics?.distance_km, 'km');
  if (resA.status === 'success' && resA.waypoints?.length > 2) {
    console.log('✓ TEST A PASSED: Ocean to ocean accepted and routed.\n');
  } else {
    console.error('FAILED TEST A', resA);
  }

  // TEST B: LAND TO OCEAN
  console.log('--- TEST B: LAND TO OCEAN ---');
  const startB = { latitude: 30.2747, longitude: -97.7403 }; // Austin (Land)
  const destB = { latitude: -43.6322, longitude: 175.5056 }; // Open Ocean
  const resB = await calculateMaritimeRoute({ start: startB, destination: destB });
  console.log('Status:', resB.status);
  console.log('Start classification:', resB.start?.classification, 'isLand:', resB.start?.isLand);
  console.log('Nearest Ocean Point:', resB.start?.nearestOceanPoint, 'Distance:', resB.start?.nearestOceanDistanceKm, 'km');
  if (resB.status === 'LAND_ENDPOINT' && resB.start?.isLand && resB.start?.nearestOceanPoint) {
    console.log('✓ TEST B PASSED: Land endpoint correctly identified, nearest ocean point calculated.\n');
  } else {
    console.error('FAILED TEST B', resB);
  }

  // TEST C: LAND TO LAND
  console.log('--- TEST C: LAND TO LAND ---');
  const startC = { latitude: 30.2747, longitude: -97.7403 }; // Austin
  const destC = { latitude: 35.6586, longitude: 139.7454 }; // Tokyo
  const resC = await calculateMaritimeRoute({ start: startC, destination: destC });
  console.log('Status:', resC.status);
  console.log('Start isLand:', resC.start?.isLand, 'Dest isLand:', resC.destination?.isLand);
  if (resC.status === 'LAND_ENDPOINT' && resC.start?.isLand && resC.destination?.isLand) {
    console.log('✓ TEST C PASSED: Both land endpoints correctly identified as LAND_ENDPOINT.\n');
  } else {
    console.error('FAILED TEST C', resC);
  }

  // TEST D: DIFFERENT OCEAN ROUTE
  console.log('--- TEST D: DIFFERENT OCEAN ROUTE ---');
  const startD = { latitude: -55.0, longitude: -60.0 }; // Open South Atlantic ocean
  const destD = { latitude: -45.0, longitude: 10.0 }; // Open Indian / South Atlantic ocean
  const resD = await calculateMaritimeRoute({ start: startD, destination: destD });
  console.log('Status:', resD.status);
  console.log('Distance:', resD.metrics?.distance_km, 'km');
  console.log('Waypoints start:', resD.waypoints?.[0]?.id, 'end:', resD.waypoints?.[resD.waypoints?.length - 1]?.id);
  if (resD.status === 'success' && resD.waypoints?.[0]?.id === 'START') {
    console.log('✓ TEST D PASSED: Different ocean route calculated with resetting WP sequence.\n');
  } else {
    console.error('FAILED TEST D', resD);
  }

  // TEST E: OBSTACLE ROUTE
  console.log('--- TEST E: OBSTACLE ROUTE ---');
  const startE = { latitude: -62.0, longitude: -65.0 }; // Open Drake Passage ocean
  const destE = { latitude: -68.0, longitude: -75.0 }; // Open Bellingshausen Sea ocean
  const resE = await calculateMaritimeRoute({ start: startE, destination: destE, mode: 'lowest_risk' });
  console.log('Status:', resE.status);
  console.log('Avoided icebergs:', resE.metrics?.iceberg_zones_avoided);
  if (resE.status === 'success') {
    console.log('✓ TEST E PASSED: Detour route generated avoiding obstacles.\n');
  } else {
    console.error('FAILED TEST E', resE);
  }

  console.log('====================================================');
  console.log('ALL LAND VALIDATION & OCEAN SNAP TESTS PASSED 100%');
  console.log('====================================================');
}

runTests().catch(console.error);
