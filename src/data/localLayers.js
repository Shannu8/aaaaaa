import * as Cesium from 'cesium';
import { createLocalGeoJsonLayer } from './localGeojson.js';
import { createFirmsHeatmapLayer } from './firmsHeatmap.js';
import submarineCablesLayer from './telegeographySubmarineCables.js';
import seaIceLayer from './seaIceLayer.js';

// Use Vite's ?url import to properly resolve these assets in dev and build
import datacentersUrl from './local_data/datacenters/datacenters.geojsonl?url';
import damsUrl from './local_data/dams/dams.geojsonl?url';
import icebergsUrl from './local_data/icebergs/icebergs.geojsonl?url';
import icebergsFullUrl from './local_data/icebergs_full/icebergs_full.geojsonl?url';

/**
 * Registry of local GeoJSON datasets.
 * These are lazily loaded natively into Cesium when enabled.
 */
const datacenters = createLocalGeoJsonLayer({
  id: 'local-datacenters',
  url: datacentersUrl,
  name: 'Datacenters',
  color: '#00ffff', // Cyan
  icon: '▣',
  source: 'Local',
  labels: true,
  labelMax: 700,
  labelGridPx: 138,
});

const dams = createLocalGeoJsonLayer({
  id: 'local-dams',
  url: damsUrl,
  name: 'Dams',
  color: '#0088ff', // Blue
  icon: '▰',
  source: 'USACE',
  labels: true,
  labelMax: 900,
  labelGridPx: 132,
});

// Live NASA FIRMS fires (VIIRS ×3 NRT via the /api/firms proxy). The id keeps
// the historical `local-` prefix for persistence + voice-tool-enum compat,
// but the data is NOT bundled anymore — it needs FIRMS_MAP_KEY server-side.
const fires = createFirmsHeatmapLayer({
  id: 'local-firms',
  name: 'FIRMS Active Fires',
  icon: '▲',
  source: 'NASA FIRMS · LIVE',
});

const icebergs = createLocalGeoJsonLayer({
  id: 'local-icebergs',
  url: icebergsUrl,
  name: 'Icebergs',
  color: '#00e5ff', // Icy cyan
  icon: '🧊',
  source: 'Antarctic Grounded Iceberg Detection',
  labels: true,
  labelMax: 200,
  labelGridPx: 120,
});

const icebergsFull = createLocalGeoJsonLayer({
  id: 'local-icebergs-full',
  url: icebergsFullUrl,
  name: 'Icebergs (Full Dataset)',
  color: '#00e5ff', // Icy cyan
  icon: '🧊',
  source: 'Antarctic Grounded Iceberg Sentinel-1 v1.2',
  labels: false,
  stems: false,
  pointDistanceDisplayCondition: new Cesium.DistanceDisplayCondition(400000, Number.POSITIVE_INFINITY),
  polygonDistanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 600000),
});

export default [
  datacenters,
  dams,
  submarineCablesLayer,
  fires,
  icebergs,
  icebergsFull,
  seaIceLayer,
];


