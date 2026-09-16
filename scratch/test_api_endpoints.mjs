import assert from 'node:assert/strict';

async function testApiEndpoints() {
  const baseUrl = 'http://localhost:4174';

  console.log('1. Testing GET /api/sea-ice/status...');
  const resStatus = await fetch(`${baseUrl}/api/sea-ice/status`);
  assert.equal(resStatus.status, 200);
  const dataStatus = await resStatus.json();
  console.log('Status Response:', dataStatus);
  assert.equal(dataStatus.observation_date, '2026-01-01');
  assert.equal(dataStatus.total_records, 83019);

  console.log('2. Testing GET /api/sea-ice/point...');
  const resPoint = await fetch(`${baseUrl}/api/sea-ice/point?lat=-65.0&lon=-60.0`);
  assert.equal(resPoint.status, 200);
  const dataPoint = await resPoint.json();
  console.log('Point Response:', dataPoint);
  assert.equal(dataPoint.in_domain, true);

  console.log('3. Testing POST /api/route/calculate (Maritime Routing)...');
  const resRoute = await fetch(`${baseUrl}/api/route/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: { latitude: -60.0, longitude: -50.0 },
      destination: { latitude: -62.0, longitude: -50.0 },
      mode: 'balanced',
      safety_buffer_km: 3.0,
    }),
  });
  assert.equal(resRoute.status, 200);
  const dataRoute = await resRoute.json();
  console.log('Route Response full body:', JSON.stringify(dataRoute, null, 2));
  assert.equal(dataRoute.status, 'success');
  assert.equal(dataRoute.dataset_date, '2026-01-01');

  console.log('ALL API ENDPOINT TESTS PASSED SUCCESSFULLY!');
}

testApiEndpoints().catch((err) => {
  console.error('API Endpoint Test Failed:', err);
  process.exit(1);
});
