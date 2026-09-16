/**
 * ANTARIS Sea-Ice + Iceberg-Aware Maritime Routing Engine
 *
 * Implements a multi-objective A* grid router for polar maritime navigation.
 *
 * Hard Constraints (Impassable Obstacles):
 * 1. Land Avoidance: Rejects any route edge crossing land.
 * 2. Iceberg Avoidance: Rejects any route edge intersecting iceberg polygons or safety buffers.
 * 3. Max Sea-Ice Cap: Rejects edges exceeding user-configured max sea-ice concentration.
 *
 * Soft Cost Model:
 * TOTAL_COST = W_DIST * distance_km + W_ICE * (concentration^2 * 100) + W_ICEBERG * iceberg_proximity_cost + W_RISK * risk_score
 *
 * Routing Modes:
 * - SHORTEST (prioritizes minimal distance while respecting hard obstacles)
 * - LOW_ICE (prioritizes minimal sea-ice exposure)
 * - BALANCED (balanced trade-off between distance & ice exposure)
 * - LOWEST_RISK (prioritizes maximum distance from icebergs & ice)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSeaIceConcentration,
  getSeaIceGridNodes,
  getSeaIceGridMap,
  getSeaIceSpatialBuckets,
  loadSeaIceDataset,
  classifySeaIceCategory,
  DATASET_METADATA,
} from './seaIceEngine.mjs';
import { calculateFuelConsumption } from './fuelModel.mjs';
import { 
  geodesicDistanceKm, 
  calculateBearing, 
  bearingToCompassDirection, 
  calculateHeadingDifference, 
  calculateCrossTrackDistance, 
  calculateETA 
} from './geoMath.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Routing Mode Weights.
 * wIce is applied to icePenalty = avgIceConc^2 * 100 evaluated at 5 interpolated mid-segment points.
 * Higher wIce forces the router to diverge around high-concentration areas.
 */
export const ROUTING_MODES = Object.freeze({
  shortest: Object.freeze({
    id: 'shortest',
    label: 'Shortest Route',
    wDist: 1.0,
    wIce: 0.5,   // small but non-zero so very high ice still costs extra
    wIceberg: 0.5,
    wRisk: 0.1,
    hardIceThreshold: null, // no hard block — only cost penalty
  }),
  low_ice: Object.freeze({
    id: 'low_ice',
    label: 'Lowest Sea Ice',
    wDist: 0.3,
    wIce: 8.0,   // strongly penalise any ice
    wIceberg: 2.0,
    wRisk: 1.5,
    hardIceThreshold: 0.70, // block segments with >70% concentration
  }),
  balanced: Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    wDist: 0.7,
    wIce: 3.5,   // meaningful penalty — enough to deflect around dense ice zones
    wIceberg: 1.2,
    wRisk: 0.8,
    hardIceThreshold: 0.85,
  }),
  lowest_risk: Object.freeze({
    id: 'lowest_risk',
    label: 'Lowest Risk',
    wDist: 0.3,
    wIce: 6.0,
    wIceberg: 4.0,
    wRisk: 3.0,
    hardIceThreshold: 0.75,
  }),
});

/** Default Iceberg Safety Buffer in kilometers */
export const DEFAULT_ICEBERG_SAFETY_BUFFER_KM = 5.0;

// Internal cache for loaded iceberg polygons
/**
 * Antarctic Land Mask Polygons (Simplified Antarctic Coastline & Peninsula Boundaries)
 * Defined in [lat, lon] format. Impassable land obstacles for maritime navigation.
 */
const ANTARCTIC_LAND_POLYGONS = [
  // Main Antarctic Continent Interior Mask [lat, lon]
  [
    [-65.0, -64.0], [-64.0, -60.0], [-66.0, -55.0], [-68.0, -62.0],
    [-72.0, -70.0], [-75.0, -110.0], [-74.0, -140.0], [-77.0, -170.0],
    [-78.0, 165.0], [-72.0, 170.0], [-68.0, 140.0], [-67.0, 100.0],
    [-68.0, 60.0], [-70.0, 20.0], [-72.0, -10.0], [-65.0, -64.0]
  ],
  // Antarctic Peninsula Spine [lat, lon]
  [
    [-63.2, -57.0], [-64.5, -62.0], [-66.0, -65.0], [-68.5, -67.0],
    [-70.0, -69.0], [-72.0, -72.0], [-73.0, -68.0], [-70.0, -64.0],
    [-67.0, -61.0], [-64.0, -56.5], [-63.2, -57.0]
  ]
];

/**
 * Global Continental Land Mask Polygons (Simplified Continental Outlines)
 * Defined in [lat, lon] format.
 */
const GLOBAL_LAND_POLYGONS = [
  // North America
  [
    [15.0, -130.0], [72.0, -170.0], [75.0, -90.0], [60.0, -60.0],
    [45.0, -65.0], [25.0, -80.0], [15.0, -90.0], [15.0, -130.0]
  ],
  // South America
  [
    [12.0, -75.0], [12.0, -60.0], [-5.0, -35.0], [-35.0, -53.0],
    [-56.0, -67.0], [-56.0, -75.0], [-5.0, -81.0], [12.0, -75.0]
  ],
  // Eurasia (Europe + Asia)
  [
    [36.0, -10.0], [72.0, 10.0], [75.0, 100.0], [70.0, 180.0],
    [35.0, 140.0], [1.0, 104.0], [22.0, 69.0], [12.0, 43.0],
    [30.0, 32.0], [36.0, -10.0]
  ],
  // Africa
  [
    [37.0, -10.0], [37.0, 10.0], [30.0, 32.0], [12.0, 43.0],
    [12.0, 51.0], [-35.0, 20.0], [-35.0, 18.0], [5.0, 9.0],
    [15.0, -17.0], [37.0, -10.0]
  ],
  // Australia
  [
    [-10.0, 142.0], [-10.0, 130.0], [-22.0, 113.0], [-35.0, 115.0],
    [-39.0, 144.0], [-38.0, 150.0], [-10.0, 142.0]
  ],
  // Greenland
  [
    [60.0, -45.0], [83.0, -30.0], [83.0, -70.0], [75.0, -75.0], [60.0, -45.0]
  ]
];

// Internal cache for loaded iceberg polygons
let _icebergFeatures = [];
let _icebergsLoaded = false;

/**
 * Load Iceberg GeoJSON features from local storage.
 */
export function loadIcebergFeatures() {
  if (_icebergsLoaded) return _icebergFeatures;

  const candidatePaths = [
    path.join(PROJECT_ROOT, 'src', 'data', 'local_data', 'icebergs', 'icebergs.geojsonl'),
    path.join(PROJECT_ROOT, 'src', 'data', 'local_data', 'icebergs_full', 'icebergs_full.geojsonl'),
  ];

  for (const filePath of candidatePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        const features = [];
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const feat = JSON.parse(line);
            if (feat && feat.geometry) {
              features.push(feat);
            }
          } catch {
            /* skip malformed line */
          }
        }
        _icebergFeatures = features;
        _icebergsLoaded = true;
        console.log(`[ICEBERG] Loaded ${features.length} iceberg obstacle polygons`);
        return _icebergFeatures;
      } catch (err) {
        console.warn(`[ICEBERG] Failed to read ${filePath}:`, err?.message);
      }
    }
  }

  _icebergFeatures = [];
  _icebergsLoaded = true;
  return _icebergFeatures;
}

/**
 * Calculate distance from a point (lat, lon) to a line segment (lat1, lon1) -> (lat2, lon2) in km.
 */
export function pointToSegmentDistanceKm(lat, lon, lat1, lon1, lat2, lon2) {
  const dTotal = geodesicDistanceKm(lat1, lon1, lat2, lon2);
  if (dTotal < 0.001) return geodesicDistanceKm(lat, lon, lat1, lon1);

  const d1 = geodesicDistanceKm(lat, lon, lat1, lon1);
  const d2 = geodesicDistanceKm(lat, lon, lat2, lon2);

  // Projection fraction t along segment
  const t = (d1 * d1 - d2 * d2 + dTotal * dTotal) / (2 * dTotal * dTotal);

  if (t <= 0) return d1;
  if (t >= 1) return d2;

  // Interpolated point along geodesic segment
  const projLat = lat1 + t * (lat2 - lat1);
  const projLon = lon1 + t * (lon2 - lon1);
  return geodesicDistanceKm(lat, lon, projLat, projLon);
}

/**
 * Check if point (lat, lon) is inside a ring formatted as [lat, lon].
 */
export function isPointInLatLonRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0]; // lat
    const xi = ring[i][1]; // lon
    const yj = ring[j][0];
    const xj = ring[j][1];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if point (lat, lon) is inside a GeoJSON ring formatted as [lon, lat].
 */
export function isPointInLonLatRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; // lon
    const yi = ring[i][1]; // lat
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a point (lat, lon) is inside a polygon ring (auto-detects [lon, lat] vs [lat, lon]).
 */
export function isPointInPolygonRing(lat, lon, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  // If ring[0][0] > 90 or <-90, it must be longitude
  if (Math.abs(ring[0][0]) > 90) {
    return isPointInLonLatRing(lat, lon, ring);
  }
  if (Math.abs(ring[0][1]) > 90) {
    return isPointInLatLonRing(lat, lon, ring);
  }
  // Default to [lon, lat] for standard GeoJSON rings
  return isPointInLonLatRing(lat, lon, ring);
}

/**
 * Check if point (lat, lon) is on land.
 */
export function isPointOnLand(lat, lon) {
  // Check Antarctic Land Polygons [lat, lon]
  for (const landPoly of ANTARCTIC_LAND_POLYGONS) {
    if (isPointInLatLonRing(lat, lon, landPoly)) return true;
  }
  // Check Global Land Polygons [lat, lon]
  for (const landPoly of GLOBAL_LAND_POLYGONS) {
    if (isPointInLatLonRing(lat, lon, landPoly)) return true;
  }
  return false;
}

/**
 * Find nearest ocean point along coastline by searching radial rings outward from a land coordinate.
 */
export function findNearestOceanPoint(lat, lon, maxDistanceKm = 500) {
  if (!isPointOnLand(lat, lon)) {
    return { lat, lon, distanceKm: 0, isOriginal: true };
  }

  let bestCand = null;
  let minDist = Infinity;

  const distances = [5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 450];
  const angles = 36;

  for (const distKm of distances) {
    if (distKm > maxDistanceKm) break;
    const latOffset = distKm / 111.0;
    const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    const lonOffset = distKm / (111.0 * cosLat);

    for (let a = 0; a < angles; a++) {
      const rad = (a * 10 * Math.PI) / 180;
      const candLat = Math.max(-89.9, Math.min(89.9, lat + Math.sin(rad) * latOffset));
      let candLon = lon + Math.cos(rad) * lonOffset;

      if (candLon > 180) candLon -= 360;
      if (candLon < -180) candLon += 360;

      if (!isPointOnLand(candLat, candLon)) {
        const d = geodesicDistanceKm(lat, lon, candLat, candLon);
        if (d < minDist) {
          minDist = d;
          bestCand = {
            lat: Math.round(candLat * 10000) / 10000,
            lon: Math.round(candLon * 10000) / 10000,
            distanceKm: Math.round(d * 10) / 10,
          };
        }
      }
    }
    if (bestCand && bestCand.distanceKm <= distKm + 10) {
      break;
    }
  }

  return bestCand || { lat, lon, distanceKm: 999, isOriginal: true };
}

/**
 * Perform comprehensive point terrain & ocean endpoint classification.
 */
export function classifyPointTerrain(lat, lon) {
  const landState = isPointOnLand(lat, lon);
  const iceInfo = getSeaIceConcentration(lat, lon);
  const bergCheck = checkEdgeIcebergObstacles(lat, lon, lat, lon);

  let type = 'OCEAN';
  if (landState) {
    type = 'LAND';
  } else if (bergCheck.intersects) {
    type = 'ICEBERG';
  } else if (iceInfo.in_domain && iceInfo.concentration > 0.1) {
    type = 'SEA_ICE';
  }

  const nearestOcean = landState ? findNearestOceanPoint(lat, lon) : { lat, lon, distanceKm: 0 };

  return {
    type,
    isLand: landState,
    isOcean: !landState,
    seaIceConcentration: iceInfo.concentration || 0,
    icebergIntersect: bergCheck.intersects,
    nearestOceanDistanceKm: nearestOcean.distanceKm,
    nearestOceanPoint: landState ? { lat: nearestOcean.lat, lon: nearestOcean.lon } : null,
    landMaskSource: 'ANTARCTIC_CONTINENT_POLY + GLOBAL_LAND_MASK',
  };
}

/**
 * Check if a 2D line segment (lon1, lat1) -> (lon2, lat2) intersects segment (lon3, lat3) -> (lon4, lat4).
 */
function lineSegmentsIntersect(lon1, lat1, lon2, lat2, lon3, lat3, lon4, lat4) {
  const ccw = (ax, ay, bx, by, cx, cy) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };
  return (
    ccw(lon1, lat1, lon3, lat3, lon4, lat4) !== ccw(lon2, lat2, lon3, lat3, lon4, lat4) &&
    ccw(lon1, lat1, lon2, lat2, lon3, lat3) !== ccw(lon1, lat1, lon2, lat2, lon4, lat4)
  );
}

/**
 * Check if a route edge intersects land polygon boundaries.
 */
export function edgeIntersectsLand(lat1, lon1, lat2, lon2) {
  if (isPointOnLand(lat1, lon1) || isPointOnLand(lat2, lon2)) return true;

  for (const landPoly of ANTARCTIC_LAND_POLYGONS) {
    for (let i = 0; i < landPoly.length - 1; i++) {
      if (lineSegmentsIntersect(lon1, lat1, lon2, lat2, landPoly[i][1], landPoly[i][0], landPoly[i + 1][1], landPoly[i + 1][0])) {
        return true;
      }
    }
  }

  for (const landPoly of GLOBAL_LAND_POLYGONS) {
    for (let i = 0; i < landPoly.length - 1; i++) {
      if (lineSegmentsIntersect(lon1, lat1, lon2, lat2, landPoly[i][1], landPoly[i][0], landPoly[i + 1][1], landPoly[i + 1][0])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a route edge (lat1, lon1) -> (lat2, lon2) intersects an iceberg polygon or enters its safety buffer.
 */
export function checkEdgeIcebergObstacles(lat1, lon1, lat2, lon2, icebergs = _icebergFeatures, safetyBufferKm = DEFAULT_ICEBERG_SAFETY_BUFFER_KM) {
  let minDistanceKm = Infinity;
  let nearestIceberg = null;
  let intersects = false;

  if (!Array.isArray(icebergs) || icebergs.length === 0) {
    return { intersects: false, minDistanceKm: 999.0, nearestIceberg: null };
  }

  // Margin for bounding box check (~2 degrees lat/lon)
  const minLat = Math.min(lat1, lat2) - 2.0;
  const maxLat = Math.max(lat1, lat2) + 2.0;
  const minLon = Math.min(lon1, lon2) - 4.0;
  const maxLon = Math.max(lon1, lon2) + 4.0;

  for (let i = 0; i < icebergs.length; i++) {
    const berg = icebergs[i];
    const props = berg.properties || {};

    let bLat = props.Latitude;
    let bLon = props.Longitude;

    const ring = berg.geometry?.type === 'Polygon' && Array.isArray(berg.geometry.coordinates?.[0])
      ? berg.geometry.coordinates[0]
      : null;

    if (ring && (bLat === undefined || bLon === undefined)) {
      bLat = ring[0][1];
      bLon = ring[0][0];
    }

    if (bLat === undefined || bLon === undefined) continue;

    // Bounding box check
    if (bLat < minLat || bLat > maxLat || bLon < minLon || bLon > maxLon) {
      continue;
    }

    // Distance from center to segment
    const centerDist = pointToSegmentDistanceKm(bLat, bLon, lat1, lon1, lat2, lon2);
    if (centerDist < minDistanceKm) {
      minDistanceKm = centerDist;
      nearestIceberg = berg;
    }

    if (centerDist <= safetyBufferKm) {
      intersects = true;
    }

    // Comprehensive polygon ring check if polygon geometry is available
    if (ring && ring.length >= 3) {
      if (isPointInPolygonRing(lat1, lon1, ring) || isPointInPolygonRing(lat2, lon2, ring)) {
        intersects = true;
        minDistanceKm = 0;
      }

      for (let j = 0; j < ring.length - 1; j++) {
        const p1 = ring[j];
        const p2 = ring[j + 1];

        if (lineSegmentsIntersect(lon1, lat1, lon2, lat2, p1[0], p1[1], p2[0], p2[1])) {
          intersects = true;
          minDistanceKm = 0;
          break;
        }

        const d1 = pointToSegmentDistanceKm(p1[1], p1[0], lat1, lon1, lat2, lon2);
        const d2 = pointToSegmentDistanceKm(p2[1], p2[0], lat1, lon1, lat2, lon2);
        const d3 = pointToSegmentDistanceKm(lat1, lon1, p1[1], p1[0], p2[1], p2[0]);
        const d4 = pointToSegmentDistanceKm(lat2, lon2, p1[1], p1[0], p2[1], p2[0]);
        const edgeDist = Math.min(d1, d2, d3, d4);

        if (edgeDist < minDistanceKm) {
          minDistanceKm = edgeDist;
          nearestIceberg = berg;
        }

        if (edgeDist <= safetyBufferKm) {
          intersects = true;
        }
      }
    }
  }

  return {
    intersects,
    minDistanceKm: Math.round(minDistanceKm * 10) / 10,
    nearestIceberg,
  };
}

/** Configurable Multi-Pass Progressive Search Corridors */
export const SEARCH_PASSES = Object.freeze([
  { pass: 1, name: 'Direct Corridor Search', latMargin: 2.5, lonMargin: 5.0, maxNodes: 2000, detourMargin: 1.5 },
  { pass: 2, name: 'Expanded Corridor Search', latMargin: 5.0, lonMargin: 10.0, maxNodes: 4000, detourMargin: 3.0 },
  { pass: 3, name: 'Obstacle Clearance Search', latMargin: 10.0, lonMargin: 20.0, maxNodes: 7000, detourMargin: 6.0 },
  { pass: 4, name: 'Wide Detour Corridor Search', latMargin: 18.0, lonMargin: 35.0, maxNodes: 12000, detourMargin: 12.0 },
  { pass: 5, name: 'Maximum Polar Routing Region', latMargin: 30.0, lonMargin: 60.0, maxNodes: 20000, detourMargin: 25.0 },
]);

/**
 * Generate detour waypoints around iceberg features in the start-destination corridor.
 */
export function generateDetourWaypoints(
  startLat, startLon, destLat, destLon,
  icebergs = _icebergFeatures,
  safetyBufferKm = DEFAULT_ICEBERG_SAFETY_BUFFER_KM,
  marginDeg = 1.5
) {
  const waypoints = [];
  const minLat = Math.min(startLat, destLat) - marginDeg;
  const maxLat = Math.max(startLat, destLat) + marginDeg;
  const minLon = Math.min(startLon, destLon) - (marginDeg * 2.0);
  const maxLon = Math.max(startLon, destLon) + (marginDeg * 2.0);

  const bufferOffsetKm = safetyBufferKm + 2.5;

  for (let i = 0; i < icebergs.length; i++) {
    const berg = icebergs[i];
    const props = berg.properties || {};
    let bLat = props.Latitude;
    let bLon = props.Longitude;

    let ring = null;
    if (berg.geometry?.type === 'Polygon' && Array.isArray(berg.geometry.coordinates?.[0])) {
      ring = berg.geometry.coordinates[0];
      if (bLat === undefined || bLon === undefined) {
        bLat = ring[0][1];
        bLon = ring[0][0];
      }
    }

    if (bLat === undefined || bLon === undefined) continue;
    if (bLat < minLat || bLat > maxLat || bLon < minLon || bLon > maxLon) continue;

    const distToCorridor = pointToSegmentDistanceKm(bLat, bLon, startLat, startLon, destLat, destLon);
    if (distToCorridor > 50.0 + marginDeg * 20.0) continue;

    const latOffsetDeg = bufferOffsetKm / 111.0;
    const cosLat = Math.max(0.1, Math.cos((bLat * Math.PI) / 180));
    const lonOffsetDeg = bufferOffsetKm / (111.0 * cosLat);

    const candidates = [
      { lat: bLat + latOffsetDeg, lon: bLon },
      { lat: bLat - latOffsetDeg, lon: bLon },
      { lat: bLat, lon: bLon + lonOffsetDeg },
      { lat: bLat, lon: bLon - lonOffsetDeg },
    ];

    if (ring && ring.length > 0) {
      const step = Math.max(1, Math.floor(ring.length / 4));
      for (let rIdx = 0; rIdx < ring.length; rIdx += step) {
        const pt = ring[rIdx];
        const pLon = pt[0];
        const pLat = pt[1];
        const vLat = pLat - bLat;
        const vLon = pLon - bLon;
        const vLen = Math.hypot(vLat, vLon) || 1;
        candidates.push({
          lat: pLat + (vLat / vLen) * latOffsetDeg,
          lon: pLon + (vLon / vLen) * lonOffsetDeg,
        });
      }
    }

    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const cand = candidates[cIdx];
      if (edgeIntersectsLand(cand.lat, cand.lon, cand.lat, cand.lon)) continue;
      const chk = checkEdgeIcebergObstacles(cand.lat, cand.lon, cand.lat, cand.lon, icebergs, safetyBufferKm);
      if (chk.intersects) continue;

      const seaIceInfo = getSeaIceConcentration(cand.lat, cand.lon);
      waypoints.push({
        id: `detour_${i}_${cIdx}`,
        lat: cand.lat,
        lon: cand.lon,
        conc: seaIceInfo.concentration,
        isDetour: true,
      });
    }
  }

  return waypoints;
}

/**
 * Deterministic route validation function.
 */
export function validateRoute(routePoints, options = {}) {
  const {
    icebergs = _icebergFeatures,
    safetyBufferKm = DEFAULT_ICEBERG_SAFETY_BUFFER_KM,
    maxSeaIceConcentration = null,
  } = options;

  if (!Array.isArray(routePoints) || routePoints.length === 0) {
    return {
      valid: false,
      distanceKm: 0,
      icebergIntersections: 0,
      icebergSafetyZoneIntersections: 0,
      landIntersections: 0,
      averageSeaIce: 0,
      maximumSeaIce: 0,
      environmentalRisk: 0,
      waypointCount: 0,
      nearestIcebergDistKm: 999,
    };
  }

  let totalDistanceKm = 0;
  let totalSeaIce = 0;
  let maxSeaIce = 0;
  let minSeaIce = 1.0;
  let landIntersections = 0;
  let icebergSafetyZoneIntersections = 0;
  let icebergIntersections = 0;
  let minIcebergDistKm = Infinity;

  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    const conc = pt.sea_ice_concentration ?? getSeaIceConcentration(pt.latitude ?? pt.lat, pt.longitude ?? pt.lon).concentration;
    totalSeaIce += conc;
    if (conc > maxSeaIce) maxSeaIce = conc;
    if (conc < minSeaIce) minSeaIce = conc;

    if (i > 0) {
      const prev = routePoints[i - 1];
      const p1Lat = prev.latitude ?? prev.lat;
      const p1Lon = prev.longitude ?? prev.lon;
      const p2Lat = pt.latitude ?? pt.lat;
      const p2Lon = pt.longitude ?? pt.lon;

      totalDistanceKm += geodesicDistanceKm(p1Lat, p1Lon, p2Lat, p2Lon);

      if (edgeIntersectsLand(p1Lat, p1Lon, p2Lat, p2Lon)) {
        landIntersections++;
      }

      const bergCheck = checkEdgeIcebergObstacles(p1Lat, p1Lon, p2Lat, p2Lon, icebergs, safetyBufferKm);
      if (bergCheck.minDistanceKm < minIcebergDistKm) {
        minIcebergDistKm = bergCheck.minDistanceKm;
      }
      if (bergCheck.intersects) {
        icebergSafetyZoneIntersections++;
        if (bergCheck.minDistanceKm <= 0.1) {
          icebergIntersections++;
        }
      }
    }
  }

  const avgSeaIce = routePoints.length > 0 ? totalSeaIce / routePoints.length : 0;
  let valid = landIntersections === 0 && icebergSafetyZoneIntersections === 0;

  if (maxSeaIceConcentration !== null && maxSeaIce > maxSeaIceConcentration) {
    valid = false;
  }

  const riskScore = Math.min(100, Math.round(
    avgSeaIce * 40 +
    (minIcebergDistKm < 10 ? (10 - minIcebergDistKm) * 4 : 0) +
    landIntersections * 50 +
    icebergSafetyZoneIntersections * 30
  ));

  return {
    valid,
    distanceKm: Math.round(totalDistanceKm * 10) / 10,
    icebergIntersections,
    icebergSafetyZoneIntersections,
    landIntersections,
    averageSeaIce: Math.round(avgSeaIce * 1000) / 1000,
    maximumSeaIce: Math.round(maxSeaIce * 1000) / 1000,
    minimumSeaIce: Math.round(minSeaIce * 1000) / 1000,
    environmentalRisk: riskScore,
    waypointCount: routePoints.length,
    nearestIcebergDistKm: Number.isFinite(minIcebergDistKm) ? Math.round(minIcebergDistKm * 10) / 10 : 999,
  };
}

/**
 * Revalidate & smooth path intermediate nodes without cutting through obstacles.
 */
export function smoothPath(pathNodes, icebergs, safetyBufferKm, maxSeaIceConcentration = null) {
  if (!Array.isArray(pathNodes) || pathNodes.length <= 2) return pathNodes;

  const smoothed = [pathNodes[0]];
  let currIdx = 0;

  while (currIdx < pathNodes.length - 1) {
    let furthestIdx = currIdx + 1;

    // Limit lookahead to max 6 nodes at a time so detours and curves are preserved
    const maxLookahead = Math.min(pathNodes.length - 1, currIdx + 6);

    for (let testIdx = maxLookahead; testIdx > currIdx + 1; testIdx--) {
      const p1 = pathNodes[currIdx];
      const p2 = pathNodes[testIdx];

      if (edgeIntersectsLand(p1.lat, p1.lon, p2.lat, p2.lon)) continue;

      const bergCheck = checkEdgeIcebergObstacles(p1.lat, p1.lon, p2.lat, p2.lon, icebergs, safetyBufferKm);
      if (bergCheck.intersects) continue;

      if (maxSeaIceConcentration !== null) {
        const avgConc = ((p1.conc ?? 0) + (p2.conc ?? 0)) / 2;
        if (avgConc > maxSeaIceConcentration) continue;
      }

      // Preserve intermediate detour nodes and significant turn angles (>= 12 degrees)
      let skippedTurnOrDetour = false;
      for (let mid = currIdx + 1; mid < testIdx; mid++) {
        const pPrev = pathNodes[mid - 1];
        const pMid = pathNodes[mid];
        const pNext = pathNodes[mid + 1];

        if (pMid.isDetour) {
          skippedTurnOrDetour = true;
          break;
        }

        const b1 = calculateBearing(pPrev.lat, pPrev.lon, pMid.lat, pMid.lon);
        const b2 = calculateBearing(pMid.lat, pMid.lon, pNext.lat, pNext.lon);
        const turn = Math.abs(calculateHeadingDifference(b1, b2));

        if (turn >= 12.0) {
          skippedTurnOrDetour = true;
          break;
        }
      }

      if (skippedTurnOrDetour) continue;

      furthestIdx = testIdx;
      break;
    }

    smoothed.push(pathNodes[furthestIdx]);
    currIdx = furthestIdx;
  }

  return smoothed;
}

/**
 * Generate Direct Geodesic candidate path.
 */
export function generateDirectCandidate(startLat, startLon, destLat, destLon) {
  const steps = 24;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = startLat + t * (destLat - startLat);
    const lon = startLon + t * (destLon - startLon);
    const conc = getSeaIceConcentration(lat, lon).concentration;
    points.push({ latitude: lat, longitude: lon, sea_ice_concentration: conc });
  }
  return points;
}

/**
 * Multi-Objective A* Maritime Path Planner.
 */
export async function calculateMaritimeRoute(options = {}) {
  await loadSeaIceDataset();
  const icebergs = loadIcebergFeatures();

  const {
    start,
    destination,
    mode = 'balanced',
    max_sea_ice_concentration = null,
    safety_buffer_km = DEFAULT_ICEBERG_SAFETY_BUFFER_KM,
    custom_weights = null,
  } = options;

  if (!start || !destination) {
    return {
      status: 'INVALID_REQUEST',
      error: 'Start and destination coordinates are required.',
    };
  }

  const startLat = Number(start.latitude ?? start.lat);
  const startLon = Number(start.longitude ?? start.lon);
  const destLat = Number(destination.latitude ?? destination.lat);
  const destLon = Number(destination.longitude ?? destination.lon);

  if (!Number.isFinite(startLat) || !Number.isFinite(startLon) || !Number.isFinite(destLat) || !Number.isFinite(destLon)) {
    return {
      status: 'INVALID_REQUEST',
      error: 'Start or destination contains non-numeric coordinates.',
    };
  }

  const selectedMode = ROUTING_MODES[mode.toLowerCase()] || ROUTING_MODES.balanced;
  const weights = custom_weights || {
    wDist: selectedMode.wDist,
    wIce: selectedMode.wIce,
    wIceberg: selectedMode.wIceberg,
    wRisk: selectedMode.wRisk,
  };

  const directDistanceKm = geodesicDistanceKm(startLat, startLon, destLat, destLon);

  // 1. HARD OBSTACLE CHECKS ON START AND DESTINATION
  const startClassification = classifyPointTerrain(startLat, startLon);
  const destClassification = classifyPointTerrain(destLat, destLon);

  const startIcebergCheck = checkEdgeIcebergObstacles(startLat, startLon, startLat, startLon, icebergs, safety_buffer_km);
  if (startIcebergCheck.intersects) {
    return {
      status: 'NO_SAFE_ROUTE',
      reason: `Starting position is inside an iceberg safety buffer (${startIcebergCheck.minDistanceKm} km from nearest iceberg).`,
      suggestions: [
        'Move ship starting position away from iceberg cluster',
        'Reduce iceberg safety buffer parameter',
      ],
    };
  }

  const destIcebergCheck = checkEdgeIcebergObstacles(destLat, destLon, destLat, destLon, icebergs, safety_buffer_km);
  if (destIcebergCheck.intersects) {
    return {
      status: 'NO_SAFE_ROUTE',
      reason: `Destination is inside an iceberg safety buffer (${destIcebergCheck.minDistanceKm} km from nearest iceberg).`,
      suggestions: [
        'Choose an alternative destination waypoint outside the iceberg buffer',
        'Reduce iceberg safety buffer parameter',
      ],
    };
  }

  if (startClassification.isLand || destClassification.isLand) {
    return {
      status: 'LAND_ENDPOINT',
      reason: 'Start or destination location is on land.',
      start: {
        latitude: startLat,
        longitude: startLon,
        classification: startClassification.type,
        isLand: startClassification.isLand,
        nearestOceanDistanceKm: startClassification.nearestOceanDistanceKm,
        nearestOceanPoint: startClassification.nearestOceanPoint,
        landMaskSource: startClassification.landMaskSource,
      },
      destination: {
        latitude: destLat,
        longitude: destLon,
        classification: destClassification.type,
        isLand: destClassification.isLand,
        nearestOceanDistanceKm: destClassification.nearestOceanDistanceKm,
        nearestOceanPoint: destClassification.nearestOceanPoint,
        landMaskSource: destClassification.landMaskSource,
      },
      suggestions: [
        'Click [FIND NEAREST OCEAN POINT] to snap endpoints to navigable ocean waters.',
        'Select a vessel starting position offshore.',
      ],
    };
  }

  // 2. GENERATE DIRECT CANDIDATE BASELINE
  const directPoints = generateDirectCandidate(startLat, startLon, destLat, destLon);
  const directValidation = validateRoute(directPoints, { icebergs, safetyBufferKm: safety_buffer_km, maxSeaIceConcentration: max_sea_ice_concentration });

  // 3. PROGRESSIVE MULTI-PASS DETOUR SEARCH
  const allNodes = getSeaIceGridNodes();
  const gridMap = getSeaIceGridMap();
  const spatialBuckets = getSeaIceSpatialBuckets();

  let finalPathPoints = null;
  let isDirectSelected = false;
  let selectedPassInfo = null;
  let cumulativeNodesExplored = 0;
  let cumulativeNodesRejected = 0;

  for (const passInfo of SEARCH_PASSES) {
    const detourNodes = generateDetourWaypoints(
      startLat, startLon, destLat, destLon, icebergs, safety_buffer_km, passInfo.detourMargin
    );

    const minLatBound = Math.min(startLat, destLat) - passInfo.latMargin;
    const maxLatBound = Math.max(startLat, destLat) + passInfo.latMargin;
    const minLonBound = Math.min(startLon, destLon) - passInfo.lonMargin;
    const maxLonBound = Math.max(startLon, destLon) + passInfo.lonMargin;

    const candidateGridNodes = allNodes.filter(
      (n) => n.lat >= minLatBound && n.lat <= maxLatBound && n.lon >= minLonBound && n.lon <= maxLonBound
    );
    const gridNodesToUse = candidateGridNodes.length > 30 ? candidateGridNodes : allNodes;

    const startNode = { id: -1, lat: startLat, lon: startLon, conc: getSeaIceConcentration(startLat, startLon).concentration };
    const destNode = { id: -2, lat: destLat, lon: destLon, conc: getSeaIceConcentration(destLat, destLon).concentration };

    const graphNodes = [startNode, destNode, ...detourNodes, ...gridNodesToUse];

    const idToNodeMap = new Map();
    graphNodes.forEach((n) => idToNodeMap.set(n.id, n));

    const getNeighbors = (node) => {
      const neighbors = [];

      if (node.x3412 !== null && node.x3412 !== undefined && node.y3412 !== null && node.y3412 !== undefined) {
        // EPSG:3412 polar stereographic grid: expand to 5x5 neighborhood (±2 cells = ±50km)
        // This gives enough jump distance to traverse across ice-free corridors
        const gx = Math.round(node.x3412 / 25000);
        const gy = Math.round(node.y3412 / 25000);
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            if (dx === 0 && dy === 0) continue;
            const key = `${gx + dx}_${gy + dy}`;
            const nNode = gridMap.get(key);
            if (nNode) neighbors.push(nNode);
          }
        }
      } else {
        // Spatial bucket search with 3-bucket radius (~1.5 degree) and 120km distance cap
        const bLat = Math.floor(node.lat * 2);
        const bLon = Math.floor(node.lon * 2);
        for (let dLat = -3; dLat <= 3; dLat++) {
          for (let dLon = -3; dLon <= 3; dLon++) {
            const bKey = `${bLat + dLat}_${bLon + dLon}`;
            const bucket = spatialBuckets.get(bKey);
            if (bucket) {
              for (const cand of bucket) {
                const d = geodesicDistanceKm(node.lat, node.lon, cand.lat, cand.lon);
                if (d <= 120.0) neighbors.push(cand);
              }
            }
          }
        }
      }

      detourNodes.forEach((dNode) => {
        if (dNode.id !== node.id) {
          const d = geodesicDistanceKm(node.lat, node.lon, dNode.lat, dNode.lon);
          if (d <= 120.0 && !neighbors.includes(dNode)) {
            neighbors.push(dNode);
          }
        }
      });

      if (node.id !== destNode.id) {
        const dToDest = geodesicDistanceKm(node.lat, node.lon, destLat, destLon);
        if (dToDest <= 200.0 && !neighbors.includes(destNode)) {
          neighbors.push(destNode);
        }
      }

      return neighbors;
    };

    class MinHeap {
      constructor() {
        this.heap = [];
      }
      push(nodeId, priority) {
        this.heap.push({ id: nodeId, priority });
        this._bubbleUp(this.heap.length - 1);
      }
      pop() {
        if (this.heap.length === 0) return null;
        const min = this.heap[0];
        const end = this.heap.pop();
        if (this.heap.length > 0) {
          this.heap[0] = end;
          this._sinkDown(0);
        }
        return min.id;
      }
      size() {
        return this.heap.length;
      }
      _bubbleUp(n) {
        const element = this.heap[n];
        while (n > 0) {
          const parentN = Math.floor((n - 1) / 2);
          const parent = this.heap[parentN];
          if (element.priority >= parent.priority) break;
          this.heap[parentN] = element;
          this.heap[n] = parent;
          n = parentN;
        }
      }
      _sinkDown(n) {
        const length = this.heap.length;
        const element = this.heap[n];
        while (true) {
          let child2N = (n + 1) * 2;
          let child1N = child2N - 1;
          let swap = null;

          if (child1N < length) {
            if (this.heap[child1N].priority < element.priority) {
              swap = child1N;
            }
          }
          if (child2N < length) {
            if (
              (swap === null && this.heap[child2N].priority < element.priority) ||
              (swap !== null && this.heap[child2N].priority < this.heap[child1N].priority)
            ) {
              swap = child2N;
            }
          }
          if (swap === null) break;
          this.heap[n] = this.heap[swap];
          this.heap[swap] = element;
          n = swap;
        }
      }
    }

    const openHeap = new MinHeap();
    openHeap.push(startNode.id, directDistanceKm);
    const closedSet = new Set();
    const gScore = new Map([[startNode.id, 0]]);
    const cameFrom = new Map();

    let passExplored = 0;
    let passRejected = 0;
    let aStarPathNodes = null;

    while (openHeap.size() > 0) {
      if (passExplored > passInfo.maxNodes) {
        break;
      }

      const currentId = openHeap.pop();
      if (closedSet.has(currentId)) continue;
      closedSet.add(currentId);

      if (currentId === destNode.id) {
        const pathNodes = [destNode];
        let curr = destNode.id;
        while (cameFrom.has(curr)) {
          curr = cameFrom.get(curr);
          const node = idToNodeMap.get(curr);
          if (node) pathNodes.unshift(node);
        }
        aStarPathNodes = pathNodes;
        break;
      }

      passExplored++;
      const currNode = idToNodeMap.get(currentId);
      if (!currNode) continue;

      const neighbors = getNeighbors(currNode);

      for (const neighbor of neighbors) {
        const neighborId = neighbor.id;
        if (closedSet.has(neighborId)) continue;

        const dist = geodesicDistanceKm(currNode.lat, currNode.lon, neighbor.lat, neighbor.lon);

        if (edgeIntersectsLand(currNode.lat, currNode.lon, neighbor.lat, neighbor.lon)) {
          passRejected++;
          continue;
        }

        // Sample sea-ice concentration at 5 interpolated points along the edge for better accuracy
        let segIceSum = 0;
        let segIceMax = 0;
        const ICE_SAMPLES = 5;
        for (let si = 0; si <= ICE_SAMPLES; si++) {
          const t = si / ICE_SAMPLES;
          const sLat = currNode.lat + t * (neighbor.lat - currNode.lat);
          const sLon = currNode.lon + t * (neighbor.lon - currNode.lon);
          const sConc = getSeaIceConcentration(sLat, sLon).concentration;
          segIceSum += sConc;
          if (sConc > segIceMax) segIceMax = sConc;
        }
        const avgIceConc = segIceSum / (ICE_SAMPLES + 1);

        // Hard max-concentration block from user config
        if (max_sea_ice_concentration !== null && segIceMax > max_sea_ice_concentration) {
          passRejected++;
          continue;
        }

        // Hard block from mode-specific threshold (e.g. low_ice blocks >70%)
        const modeHardThreshold = selectedMode.hardIceThreshold;
        if (modeHardThreshold !== null && modeHardThreshold !== undefined && segIceMax > modeHardThreshold) {
          passRejected++;
          continue;
        }

        const icebergCheck = checkEdgeIcebergObstacles(
          currNode.lat, currNode.lon, neighbor.lat, neighbor.lon, icebergs, safety_buffer_km
        );
        if (icebergCheck.intersects) {
          passRejected++;
          continue;
        }

        // Quadratic ice penalty on segment-averaged concentration
        const icePenalty = Math.pow(avgIceConc, 2) * 100;
        // Additional spike for very dense ice (>50%): exponential to strongly disfavour
        const highIceSurcharge = avgIceConc > 0.5 ? Math.pow(avgIceConc - 0.5, 2) * 200 : 0;
        const icebergProxCost = icebergCheck.minDistanceKm < 30.0 ? (30.0 - icebergCheck.minDistanceKm) * 3 : 0;
        const riskScore = avgIceConc > 0.25 ? (avgIceConc - 0.25) * 20.0 : 0.0;

        const edgeCost =
          weights.wDist * dist +
          weights.wIce * (icePenalty + highIceSurcharge) +
          weights.wIceberg * icebergProxCost +
          weights.wRisk * riskScore;

        const tentativeG = (gScore.get(currentId) ?? Infinity) + edgeCost;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, currentId);
          gScore.set(neighborId, tentativeG);
          const h = geodesicDistanceKm(neighbor.lat, neighbor.lon, destLat, destLon);
          const fScore = tentativeG + h;
          openHeap.push(neighborId, fScore);
        }
      }
    }

    cumulativeNodesExplored += passExplored;
    cumulativeNodesRejected += passRejected;

    if (aStarPathNodes) {
      const smoothedNodes = smoothPath(aStarPathNodes, icebergs, safety_buffer_km, max_sea_ice_concentration);
      const candidatePoints = smoothedNodes.map((n) => ({
        latitude: n.lat,
        longitude: n.lon,
        sea_ice_concentration: n.conc ?? getSeaIceConcentration(n.lat, n.lon).concentration,
      }));

      const candidateValidation = validateRoute(candidatePoints, { icebergs, safetyBufferKm: safety_buffer_km, maxSeaIceConcentration: max_sea_ice_concentration });

      if (candidateValidation.valid) {
        finalPathPoints = candidatePoints;
        selectedPassInfo = passInfo;
        break;
      }
    }
  }

  const finalPathValidation = finalPathPoints ? validateRoute(finalPathPoints, { icebergs, safetyBufferKm: safety_buffer_km }) : null;

  if (directValidation.valid) {
    if (!finalPathPoints) {
      finalPathPoints = directPoints;
      isDirectSelected = true;
    } else if (selectedMode.id === 'shortest') {
      // In shortest mode, use direct route only if direct route is safe and has comparable low risk
      if (directValidation.distanceKm <= finalPathValidation.distanceKm && directValidation.environmentalRisk <= finalPathValidation.environmentalRisk + 5) {
        finalPathPoints = directPoints;
        isDirectSelected = true;
      }
    } else {
      // For low_ice, balanced, and lowest_risk modes: prefer A* detour if it lowers sea ice or risk
      if (directValidation.averageSeaIce <= finalPathValidation.averageSeaIce && directValidation.environmentalRisk <= finalPathValidation.environmentalRisk) {
        finalPathPoints = directPoints;
        isDirectSelected = true;
      }
    }
  }

  if (!finalPathPoints || finalPathPoints.length === 0) {
    return {
      status: 'NO_FEASIBLE_MARITIME_ROUTE',
      reason: `No feasible maritime route found after searching all 5 progressive expansion corridors (${cumulativeNodesExplored} nodes evaluated).`,
      suggestions: [
        'Increase maximum allowed sea-ice concentration parameter',
        'Reduce iceberg safety buffer distance',
        'Select alternative destination or intermediate waypoint',
      ],
      nodesExplored: cumulativeNodesExplored,
      nodesRejected: cumulativeNodesRejected,
    };
  }

  return formatRouteResponse({
    selectedRoutePoints: finalPathPoints,
    directPoints,
    directValidation,
    mode: selectedMode.id,
    icebergs,
    safetyBufferKm: safety_buffer_km,
    isDirectSelected,
    nodesExplored: cumulativeNodesExplored,
    nodesRejected: cumulativeNodesRejected,
    progressivePassInfo: selectedPassInfo,
  });
}

/**
 * Generate multi-candidate route trade-offs (Shortest, Low Ice, Balanced, Lowest Risk).
 */
export async function calculateMultiRouteOptions(options = {}) {
  const modes = ['shortest', 'low_ice', 'balanced', 'lowest_risk'];
  const results = {};

  for (const m of modes) {
    const res = await calculateMaritimeRoute({ ...options, mode: m });
    results[m] = res;
  }

  // Inject comparative explanation engine output for each candidate route independently
  for (const m of modes) {
    if (results[m] && results[m].status === 'success') {
      results[m].metrics.why_this_route_reason = generateWhyThisRoute(m, results[m], results);
    }
  }

  return {
    status: 'success',
    options: results,
    dataset_date: DATASET_METADATA.date,
  };
}

/**
 * Map 16-wind compass direction code to natural cardinal direction phrase.
 */
export function compassToCardinalText(compass) {
  const map = {
    N: 'North', NNE: 'North', NE: 'Northeast', ENE: 'East',
    E: 'East', ESE: 'East', SE: 'Southeast', SSE: 'South',
    S: 'South', SSW: 'South', SW: 'Southwest', WSW: 'West',
    W: 'West', WNW: 'West', NW: 'Northwest', NNW: 'North',
  };
  return map[compass] || 'North';
}

/**
 * Format turn-by-turn navigation instruction for a waypoint or course change.
 * Standard phrasing: "Turn right 40° toward West. New bearing: 258° TRUE — WSW."
 */
export function formatTurnInstruction(incomingBearing, outgoingBearing) {
  const compass = bearingToCompassDirection(outgoingBearing);
  const cardinal = compassToCardinalText(compass);

  if (incomingBearing === null || incomingBearing === undefined) {
    return `Steer course ${outgoingBearing}° TRUE toward ${cardinal}.`;
  }

  const turnAngle = calculateHeadingDifference(incomingBearing, outgoingBearing);
  const absTurn = Math.abs(turnAngle);

  if (absTurn < 3) {
    return `Maintain course ${outgoingBearing}° TRUE toward ${cardinal}.`;
  }

  const turnDir = turnAngle > 0 ? 'right' : 'left';
  return `Turn ${turnDir} ${absTurn}° toward ${cardinal}. New bearing: ${outgoingBearing}° TRUE — ${compass}.`;
}

/**
 * Path simplification & waypoint generation.
 * Reduces dense A* node lists down to meaningful navigation waypoints (significant turns, obstacle detours)
 * while enforcing a minimum spacing threshold (default 5.0 km) and validating every segment against collisions.
 */
export function simplifyWaypoints(
  rawPoints,
  icebergs = _icebergFeatures,
  safetyBufferKm = DEFAULT_ICEBERG_SAFETY_BUFFER_KM,
  maxSeaIceConcentration = null,
  minSpacingKm = 5.0,
  modePrefix = 'WP'
) {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];

  // 1. Calculate total route distance along the actual calculated multi-point path
  let totalDistanceKm = 0;
  for (let i = 0; i < rawPoints.length - 1; i++) {
    const p1 = rawPoints[i];
    const p2 = rawPoints[i + 1];
    totalDistanceKm += geodesicDistanceKm(
      p1.latitude ?? p1.lat, p1.longitude ?? p1.lon,
      p2.latitude ?? p2.lat, p2.longitude ?? p2.lon
    );
  }

  // 2. Set adaptive target spacing for long open-ocean sections vs coastal/maneuver sections
  let adaptiveSpacingKm = 120.0;
  if (totalDistanceKm > 3000) {
    adaptiveSpacingKm = 140.0;
  } else if (totalDistanceKm > 1500) {
    adaptiveSpacingKm = 90.0;
  } else if (totalDistanceKm > 500) {
    adaptiveSpacingKm = 50.0;
  } else {
    adaptiveSpacingKm = Math.max(15.0, totalDistanceKm / 8);
  }

  const resultPts = [rawPoints[0]];
  let lastPlacedIdx = 0;
  let distSinceLastWp = 0;

  for (let i = 1; i < rawPoints.length - 1; i++) {
    const pPrev = rawPoints[i - 1];
    const pCurr = rawPoints[i];
    const pNext = rawPoints[i + 1];

    const segDist = geodesicDistanceKm(
      pPrev.latitude ?? pPrev.lat, pPrev.longitude ?? pPrev.lon,
      pCurr.latitude ?? pCurr.lat, pCurr.longitude ?? pCurr.lon
    );
    distSinceLastWp += segDist;

    const bIn = calculateBearing(
      pPrev.latitude ?? pPrev.lat, pPrev.longitude ?? pPrev.lon,
      pCurr.latitude ?? pCurr.lat, pCurr.longitude ?? pCurr.lon
    );
    const bOut = calculateBearing(
      pCurr.latitude ?? pCurr.lat, pCurr.longitude ?? pCurr.lon,
      pNext.latitude ?? pNext.lat, pNext.longitude ?? pNext.lon
    );
    const turnAngle = Math.abs(calculateHeadingDifference(bIn, bOut));

    const bergCheck = checkEdgeIcebergObstacles(
      pCurr.latitude ?? pCurr.lat, pCurr.longitude ?? pCurr.lon,
      pCurr.latitude ?? pCurr.lat, pCurr.longitude ?? pCurr.lon,
      icebergs, safetyBufferKm
    );
    const isObstacleClose = bergCheck.minDistanceKm < 15.0;
    const isSignificantTurn = turnAngle >= 10.0;
    const isDetourManeuver = Boolean(pCurr.isDetour);

    const pLastPlaced = rawPoints[lastPlacedIdx];
    const shortcutIntersectsLand = edgeIntersectsLand(
      pLastPlaced.latitude ?? pLastPlaced.lat, pLastPlaced.longitude ?? pLastPlaced.lon,
      pNext.latitude ?? pNext.lat, pNext.longitude ?? pNext.lon
    );
    const shortcutBerg = checkEdgeIcebergObstacles(
      pLastPlaced.latitude ?? pLastPlaced.lat, pLastPlaced.longitude ?? pLastPlaced.lon,
      pNext.latitude ?? pNext.lat, pNext.longitude ?? pNext.lon,
      icebergs, safetyBufferKm
    );
    const shortcutBlocked = shortcutIntersectsLand || shortcutBerg.intersects;

    const reachedAdaptiveDistance = distSinceLastWp >= adaptiveSpacingKm;

    if (shortcutBlocked || isSignificantTurn || isDetourManeuver || isObstacleClose || reachedAdaptiveDistance) {
      if (shortcutBlocked) {
        pCurr._routing_reason = "Course change required to maintain safety clearance from obstacles.";
      } else if (isDetourManeuver) {
        pCurr._routing_reason = "Generated to maintain the required iceberg safety buffer around an identified iceberg polygon.";
      } else if (isObstacleClose) {
        pCurr._routing_reason = "Proximity turn to maintain configured iceberg safety buffer.";
      } else if (isSignificantTurn) {
        pCurr._routing_reason = "Course change follows the selected maritime corridor.";
      } else if (reachedAdaptiveDistance) {
        pCurr._routing_reason = "Regular navigation checkpoint along the selected maritime corridor.";
      }

      resultPts.push(pCurr);
      lastPlacedIdx = i;
      distSinceLastWp = 0;
    }
  }

  resultPts.push(rawPoints[rawPoints.length - 1]);

  // 3. Zero-padded waypoint numbering starting from WP-01 (START & DEST remain distinct)
  let wpIndex = 1;
  const prefix = modePrefix || 'WP';

  const waypointsTemp = resultPts.map((pt, i) => {
    const isStart = i === 0;
    const isDest = i === resultPts.length - 1;

    let wpId = 'START';
    if (isDest) {
      wpId = 'DEST';
    } else if (!isStart) {
      wpId = `${prefix}-${String(wpIndex).padStart(2, '0')}`;
      wpIndex++;
    }

    const lat = Math.round((pt.latitude ?? pt.lat) * 10000) / 10000;
    const lon = Math.round((pt.longitude ?? pt.lon) * 10000) / 10000;
    const conc = Math.round((pt.sea_ice_concentration ?? getSeaIceConcentration(lat, lon).concentration) * 1000) / 1000;

    let wpType = 'ROUTE CHECKPOINT';
    let reason = 'Initial ship departure location';

    if (isStart) {
      wpType = 'START';
      reason = 'Initial ship departure location';
    } else if (isDest) {
      wpType = 'DESTINATION';
      reason = 'Destination arrival waypoint';
    } else {
      if (pt._routing_reason) {
        reason = pt._routing_reason;
        if (reason.includes('clearance') || reason.includes('iceberg') || reason.includes('safety buffer') || reason.includes('safety zone')) {
          wpType = 'OBSTACLE DETOUR';
        } else if (reason.includes('Course change')) {
          wpType = 'COURSE CHANGE';
        } else if (reason.includes('sea-ice')) {
          wpType = 'SEA-ICE DETOUR';
        } else {
          wpType = 'ROUTE CHECKPOINT';
        }
      } else {
        const pP = resultPts[i - 1];
        const pN = resultPts[i + 1];
        const bIn = calculateBearing(pP.latitude ?? pP.lat, pP.longitude ?? pP.lon, lat, lon);
        const bOut = calculateBearing(lat, lon, pN.latitude ?? pN.lat, pN.longitude ?? pN.lon);
        const turnAngle = Math.abs(calculateHeadingDifference(bIn, bOut));

        if (turnAngle >= 10.0) {
          wpType = 'COURSE CHANGE';
          reason = `Significant course change (${Math.round(turnAngle)}° turn angle)`;
        } else if (i === resultPts.length - 2) {
          wpType = 'APPROACH';
          reason = 'Destination corridor approach waypoint';
        } else if (conc > 0.3) {
          wpType = 'SEA-ICE DETOUR';
          reason = `High sea-ice concentration avoidance (${Math.round(conc * 100)}% ice)`;
        } else {
          wpType = 'ROUTE CHECKPOINT';
          reason = 'Open-ocean navigation corridor checkpoint';
        }
      }
    }

    return {
      id: wpId,
      sequence: i,
      latitude: lat,
      longitude: lon,
      sea_ice_concentration: conc,
      type: wpType,
      routing_reason: reason,
    };
  });

  // Second pass: compute inter-waypoint geometry & navigation metrics
  for (let i = 0; i < waypointsTemp.length; i++) {
    const wp = waypointsTemp[i];
    const prevWp = i > 0 ? waypointsTemp[i - 1] : null;
    const nextWp = i < waypointsTemp.length - 1 ? waypointsTemp[i + 1] : null;

    wp.distance_from_prev_km = prevWp ? Math.round(geodesicDistanceKm(prevWp.latitude, prevWp.longitude, wp.latitude, wp.longitude) * 10) / 10 : null;
    wp.distance_to_next_km = nextWp ? Math.round(geodesicDistanceKm(wp.latitude, wp.longitude, nextWp.latitude, nextWp.longitude) * 10) / 10 : null;

    if (nextWp) {
      wp.bearing_to_next = Math.round(calculateBearing(wp.latitude, wp.longitude, nextWp.latitude, nextWp.longitude));
      wp.compass_direction = bearingToCompassDirection(wp.bearing_to_next);
    } else {
      wp.bearing_to_next = null;
      wp.compass_direction = null;
    }

    if (prevWp && nextWp) {
      const bIn = calculateBearing(prevWp.latitude, prevWp.longitude, wp.latitude, wp.longitude);
      const bOut = calculateBearing(wp.latitude, wp.longitude, nextWp.latitude, nextWp.longitude);
      const turnAngle = Math.round(calculateHeadingDifference(bIn, bOut));
      const absTurn = Math.abs(turnAngle);
      wp.turn_angle = turnAngle;
      if (absTurn < 3) {
        wp.turn_text = 'MAINTAIN COURSE';
      } else {
        const dir = turnAngle > 0 ? 'RIGHT' : 'LEFT';
        wp.turn_text = `TURN ${absTurn}° ${dir}`;
      }
    } else {
      wp.turn_angle = null;
      wp.turn_text = null;
    }
  }

  return waypointsTemp;
}

/**
 * Format route result with detailed metrics, reasoning, turn-by-turn guidance, fuel model, and candidate comparison.
 */
function formatRouteResponse({
  selectedRoutePoints,
  directPoints,
  directValidation,
  mode,
  icebergs,
  safetyBufferKm,
  isDirectSelected,
  nodesExplored,
  nodesRejected,
  progressivePassInfo = null,
  vesselProfile = null,
  speedKnots = 18.0,
}) {
  const selectedValidation = validateRoute(selectedRoutePoints, { icebergs, safetyBufferKm });

  const modePrefixMap = {
    shortest: 'WP',
    balanced: 'WP',
    low_ice: 'WP',
    lowest_risk: 'WP',
  };
  const modePrefix = modePrefixMap[mode] || 'WP';

  const waypoints = simplifyWaypoints(selectedRoutePoints, icebergs, safetyBufferKm, null, 5.0, modePrefix);

  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const w1 = waypoints[i];
    const w2 = waypoints[i + 1];
    const segDist = geodesicDistanceKm(w1.latitude, w1.longitude, w2.latitude, w2.longitude);
    const brg = calculateBearing(w1.latitude, w1.longitude, w2.latitude, w2.longitude);
    const compass = bearingToCompassDirection(brg);

    let prevBrg = null;
    if (i > 0) {
      const w0 = waypoints[i - 1];
      prevBrg = calculateBearing(w0.latitude, w0.longitude, w1.latitude, w1.longitude);
    }

    const turnInstruction = formatTurnInstruction(prevBrg, brg);

    segments.push({
      segmentIndex: i,
      fromWaypointId: w1.id,
      toWaypointId: w2.id,
      distanceKm: Math.round(segDist * 10) / 10,
      bearingDegrees: brg,
      compassDirection: compass,
      turnInstruction: turnInstruction,
    });
  }

  const profile = selectedRoutePoints.map((pt, i) => {
    const conc = pt.sea_ice_concentration ?? 0;
    return {
      step: i,
      latitude: pt.latitude,
      longitude: pt.longitude,
      sea_ice_concentration: conc,
      percentage: Math.round(conc * 100),
      category: classifySeaIceCategory(conc),
      observation_date: DATASET_METADATA.date,
    };
  });

  const detourKm = Math.max(0, Math.round((selectedValidation.distanceKm - directValidation.distanceKm) * 10) / 10);
  const conflictsAvoided = Math.max(0, directValidation.icebergSafetyZoneIntersections - selectedValidation.icebergSafetyZoneIntersections);
  const avoidanceManeuversCount = waypoints.filter((w) => w.type === 'OBSTACLE DETOUR').length;

  const fuelMetrics = calculateFuelConsumption(selectedValidation.distanceKm, speedKnots, vesselProfile);
  const directFuelMetrics = calculateFuelConsumption(directValidation.distanceKm, speedKnots, vesselProfile);

  let lowCount = 0, modCount = 0, highCount = 0;
  selectedRoutePoints.forEach((pt) => {
    const cat = classifySeaIceCategory(pt.sea_ice_concentration ?? 0);
    if (cat === 'LOW') lowCount++;
    else if (cat === 'MODERATE') modCount++;
    else highCount++;
  });
  const total = selectedRoutePoints.length || 1;

  return {
    status: 'success',
    mode,
    is_direct: isDirectSelected,
    route: selectedRoutePoints,
    waypoints,
    segments,
    profile,
    fuel: fuelMetrics,
    metrics: {
      distance_km: selectedValidation.distanceKm,
      direct_distance_km: directValidation.distanceKm,
      detour_km: detourKm,
      iceberg_intersections: selectedValidation.icebergIntersections || 0,
      iceberg_zones_crossed: selectedValidation.icebergSafetyZoneIntersections,
      direct_iceberg_conflicts: directValidation.icebergSafetyZoneIntersections,
      iceberg_zones_avoided: conflictsAvoided,
      iceberg_avoidance_maneuvers: avoidanceManeuversCount,
      iceberg_safety_corridor: conflictsAvoided > 0 || selectedValidation.nearestIcebergDistKm <= 30,
      average_ice_concentration: selectedValidation.averageSeaIce,
      direct_average_ice_concentration: directValidation.averageSeaIce,
      maximum_ice_concentration: selectedValidation.maximumSeaIce,
      minimum_ice_concentration: selectedValidation.minimumSeaIce,
      low_ice_percentage: Math.round((lowCount / total) * 100),
      moderate_ice_percentage: Math.round((modCount / total) * 100),
      high_ice_percentage: Math.round((highCount / total) * 100),
      minimum_iceberg_distance_km: selectedValidation.nearestIcebergDistKm,
      risk_score: selectedValidation.environmentalRisk,
      waypoint_count: waypoints.length,
      fisheries_status: "FISHERIES DATA: UNAVAILABLE",
      why_this_route_reason: "", // Injected in calculateMultiRouteOptions via generateWhyThisRoute
      fuel: fuelMetrics,
    },
    candidates: {
      direct: {
        valid: directValidation.valid,
        distance_km: directValidation.distanceKm,
        iceberg_conflicts: directValidation.icebergSafetyZoneIntersections,
        average_ice_concentration: directValidation.averageSeaIce,
        risk_score: directValidation.environmentalRisk,
        fuel: directFuelMetrics,
      },
      selected: {
        valid: selectedValidation.valid,
        distance_km: selectedValidation.distanceKm,
        iceberg_conflicts: selectedValidation.icebergSafetyZoneIntersections,
        average_ice_concentration: selectedValidation.averageSeaIce,
        risk_score: selectedValidation.environmentalRisk,
        fuel: fuelMetrics,
      },
    },
    dataset_date: DATASET_METADATA.date,
    diagnostics: {
      nodesExplored,
      nodesRejected,
      progressivePass: progressivePassInfo ? progressivePassInfo.pass : 1,
    },
  };
}

export { geodesicDistanceKm } from './geoMath.mjs';

/**
 * Generates a structured factual explanation comparing the selected route candidate to the other available options.
 */
export function generateWhyThisRoute(modeKey, candidate, allCandidates = {}) {
  if (!candidate || !candidate.metrics) {
    return 'Route reasoning unavailable.';
  }

  const m = candidate.metrics;
  const isDirect = candidate.is_direct;
  const modeNorm = modeKey ? modeKey.toLowerCase() : 'balanced';

  let userModeName = 'GENERAL';
  if (modeNorm === 'shortest') userModeName = 'SHORTEST';
  else if (modeNorm === 'lowest_risk' || modeNorm === 'low_ice' || modeNorm === 'safe') userModeName = 'SAFE';
  else if (modeNorm === 'balanced' || modeNorm === 'general') userModeName = 'GENERAL';

  const shortestCand = allCandidates['shortest']?.metrics || m;
  const safeCand = allCandidates['lowest_risk']?.metrics || m;
  const generalCand = allCandidates['balanced']?.metrics || m;

  let paragraph1 = '';
  let paragraph2 = '';
  let conclusion = '';

  const avgIcePct = (m.average_ice_concentration * 100).toFixed(1);
  const maxIcePct = m.maximum_ice_concentration !== undefined ? (m.maximum_ice_concentration * 100).toFixed(1) : avgIcePct;
  const fuelText = m.fuel?.estimatedFuelLiters ? `${m.fuel.estimatedFuelLiters.toLocaleString()} L` : 'UNAVAILABLE';
  const clearanceKm = m.minimum_iceberg_distance_km !== undefined ? m.minimum_iceberg_distance_km : 'UNAVAILABLE';

  if (userModeName === 'SHORTEST') {
    if (isDirect || m.detour_km === 0) {
      paragraph1 = `This route was selected as the shortest navigable corridor between the origin and destination while maintaining required iceberg clearance and avoiding prohibited terrain.`;
      paragraph2 = `Distance: ${m.distance_km} km | Sea Ice: ${avgIcePct}% average | Minimum Iceberg Clearance: ${clearanceKm} km | Est. Fuel: ${fuelText} | Detour: 0 km.`;
      conclusion = `The route was selected primarily because it minimizes navigable distance while remaining within the configured safety constraints.`;
    } else {
      paragraph1 = `This route was selected as the shortest navigable corridor between the origin and destination while maintaining required iceberg clearance and avoiding prohibited terrain.`;
      paragraph2 = `A detour of +${m.detour_km} km was generated to divert around detected environmental obstacles (land mass or iceberg safety buffers).`;
      conclusion = `The route minimizes total distance under the enforced safety constraints.`;
    }
  } else if (userModeName === 'SAFE') {
    paragraph1 = `This route was selected because it provides a lower-risk corridor through areas with reduced sea-ice concentration and greater iceberg clearance.`;
    if (m.distance_km > shortestCand.distance_km) {
      const extraKm = Math.round(m.distance_km - shortestCand.distance_km);
      const riskSaved = Math.max(0, shortestCand.risk_score - m.risk_score);
      paragraph2 = `The additional distance (+${extraKm} km compared to the shortest route) is caused by detouring around higher-risk ice and iceberg areas, reducing overall risk score by ${riskSaved} points.`;
    } else {
      paragraph2 = `The route achieved optimal safety metrics without incurring an extra distance penalty over the shortest candidate.`;
    }
    conclusion = `Selected primarily to maximize navigational safety and iceberg clearance.`;
  } else {
    // GENERAL / BALANCED
    paragraph1 = `This route balances distance, sea-ice conditions, iceberg clearance, navigational risk and estimated fuel consumption.`;
    if (m.distance_km > shortestCand.distance_km && safeCand && m.distance_km < safeCand.distance_km) {
      paragraph2 = `It provides a compromise between the shortest (${shortestCand.distance_km} km) and lower-risk (${safeCand.distance_km} km) alternatives.`;
    } else {
      paragraph2 = `It optimizes the multi-objective balance between distance (${m.distance_km} km), ice exposure (${avgIcePct}%), and iceberg clearance (${clearanceKm} km).`;
    }
    conclusion = `Provides the best overall compromise between distance, ice exposure, clearance and estimated fuel.`;
  }

  // Fisheries context
  const fisheriesText = m.fisheries_status || 'FISHERIES DATA: UNAVAILABLE';

  // Build HTML block
  return `
<div class="why-route-container" style="font-family:sans-serif;">
  <div style="margin-bottom:6px;font-size:10px;line-height:1.4;">${paragraph1} ${paragraph2}</div>
  <div style="font-weight:bold;color:rgba(255,255,255,0.7);font-size:8.5px;margin:6px 0 3px 0;letter-spacing:0.5px;">KEY FACTORS</div>
  <ul style="margin:0 0 6px 0;padding-left:14px;font-size:9px;color:rgba(255,255,255,0.9);line-height:1.5;">
    <li><strong>Distance:</strong> ${m.distance_km} km ${m.detour_km > 0 ? `(+${m.detour_km} km detour)` : ''}</li>
    <li><strong>Sea Ice:</strong> ${avgIcePct}% average (max ${maxIcePct}%)</li>
    <li><strong>Iceberg Clearance:</strong> ${clearanceKm} km</li>
    <li><strong>Est. Fuel:</strong> ${fuelText}</li>
    <li><strong>Risk Score:</strong> ${m.risk_score} / 100</li>
    <li><strong>Fisheries Context:</strong> ${fisheriesText}</li>
  </ul>
  <div style="font-size:9px;color:#00e5ff;font-style:italic;">${conclusion}</div>
</div>
  `.trim();
}
