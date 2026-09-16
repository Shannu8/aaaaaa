import { loadSeaIceDataset } from '../src/seaIceEngine.mjs';
import { loadIcebergFeatures, calculateMaritimeRoute } from '../src/seaIceRoutingEngine.mjs';

async function main() {
  await loadSeaIceDataset();
  const icebergs = loadIcebergFeatures();

  console.log('Testing route start (-60.0, -50.0) -> dest (-62.0, -50.0)...');
  const t0 = Date.now();
  const res = await calculateMaritimeRoute({
    start: { latitude: -60.0, longitude: -50.0 },
    destination: { latitude: -62.0, longitude: -50.0 },
    mode: 'shortest',
    safety_buffer_km: 3.0,
  });
  console.log('Result in', Date.now() - t0, 'ms:');
  console.log('Status:', res.status);
  if (res.metrics) {
    console.log('Metrics:', res.metrics);
  } else {
    console.log('Reason:', res.reason);
  }
}

main();
