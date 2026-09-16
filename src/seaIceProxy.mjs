/**
 * Vite Dev Server Proxy Plugin for Sea-Ice Data & Maritime A* Routing Engine
 *
 * Endpoints:
 * - GET  /api/sea-ice/status  -> Dataset freshness metadata (date 2026-01-01, count 83,019)
 * - GET  /api/sea-ice/point   -> Query sea-ice concentration for lat/lon point
 * - POST /api/sea-ice/profile -> Sampling array of route points
 * - POST /api/route/calculate -> Antarctic Maritime A* Routing Engine
 */

import {
  loadSeaIceDataset,
  getSeaIceConcentration,
  getSeaIceProfile,
  DATASET_METADATA,
} from './seaIceEngine.mjs';

import {
  calculateMaritimeRoute,
  calculateMultiRouteOptions,
  classifyPointTerrain,
  findNearestOceanPoint,
  ROUTING_MODES,
} from './seaIceRoutingEngine.mjs';
import { calculateVoyageGuidance } from './voyageGuidance.mjs';

export function seaIceRoutingProxy() {
  return {
    name: 'sea-ice-routing-proxy',
    configureServer(server) {
      // Pre-load dataset on server boot
      loadSeaIceDataset().catch((err) => {
        console.warn('[SEA ICE PROXY] Background ingestion warning:', err?.message);
      });

      server.middlewares.use(async (req, res, next) => {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;

        // Helper to send JSON responses
        const sendJson = (status, payload) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(payload));
        };

        // Helper to parse JSON request body
        const parseJsonBody = async () => {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!raw.trim()) return {};
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        };

        // 1. GET /api/sea-ice/status
        if (req.method === 'GET' && pathname === '/api/sea-ice/status') {
          const meta = await loadSeaIceDataset();
          return sendJson(200, {
            status: meta.status,
            observation_date: meta.date,
            total_records: meta.totalRecords,
            coverage_bbox: {
              min_latitude: meta.minLat,
              max_latitude: meta.maxLat,
              min_longitude: meta.minLon,
              max_longitude: meta.maxLon,
            },
            disclaimer: 'Sea Ice Data: 2026-01-01 (Historical observation dataset)',
          });
        }

        // 2. GET /api/sea-ice/point?lat=...&lon=...
        if (req.method === 'GET' && pathname === '/api/sea-ice/point') {
          await loadSeaIceDataset();
          const lat = parseFloat(urlObj.searchParams.get('lat'));
          const lon = parseFloat(urlObj.searchParams.get('lon'));
          const info = getSeaIceConcentration(lat, lon);
          return sendJson(200, info);
        }

        // 3. GET / POST /api/location/validate
        if (pathname === '/api/location/validate') {
          let lat, lon;
          if (req.method === 'GET') {
            lat = parseFloat(urlObj.searchParams.get('lat'));
            lon = parseFloat(urlObj.searchParams.get('lon'));
          } else if (req.method === 'POST') {
            const body = await parseJsonBody();
            lat = parseFloat(body?.latitude ?? body?.lat);
            lon = parseFloat(body?.longitude ?? body?.lon);
          }

          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return sendJson(400, { error: 'Valid latitude and longitude are required' });
          }

          const classification = classifyPointTerrain(lat, lon);
          return sendJson(200, {
            status: 'success',
            latitude: lat,
            longitude: lon,
            ...classification,
          });
        }

        // 4. POST /api/sea-ice/profile
        if (req.method === 'POST' && pathname === '/api/sea-ice/profile') {
          await loadSeaIceDataset();
          const body = await parseJsonBody();
          if (!body || !Array.isArray(body.points)) {
            return sendJson(400, { error: 'Request body must contain a "points" array of {latitude, longitude}' });
          }
          const profile = getSeaIceProfile(body.points);
          return sendJson(200, {
            status: 'success',
            observation_date: DATASET_METADATA.date,
            point_count: profile.length,
            profile,
          });
        }

        // 5. POST /api/route/calculate (Antarctic Maritime Routing Engine)
        if (req.method === 'POST' && pathname === '/api/route/calculate') {
          const body = await parseJsonBody();
          if (!body) {
            return sendJson(400, { error: 'Invalid JSON request body' });
          }

          const {
            start,
            destination,
            mode = 'balanced',
            max_sea_ice_concentration = null,
            safety_buffer_km = 5.0,
            multi_route = false,
          } = body;

          if (multi_route) {
            const multiRes = await calculateMultiRouteOptions({
              start,
              destination,
              max_sea_ice_concentration,
              safety_buffer_km,
            });
            return sendJson(200, multiRes);
          }

          const routeRes = await calculateMaritimeRoute({
            start,
            destination,
            mode,
            max_sea_ice_concentration,
            safety_buffer_km,
          });

          if (routeRes.status === 'LAND_ENDPOINT' || routeRes.status === 'NO_SAFE_ROUTE' || routeRes.status === 'NO_FEASIBLE_MARITIME_ROUTE') {
            return sendJson(422, routeRes);
          }

          return sendJson(200, routeRes);
        }

        // 6. POST /api/route/guidance (Live Voyage Guidance Engine)
        if (req.method === 'POST' && pathname === '/api/route/guidance') {
          const body = await parseJsonBody();
          if (!body || !body.route) {
            return sendJson(400, { error: 'Request body must contain "route" object' });
          }
          const guidance = calculateVoyageGuidance(body.route, body.vesselState || null, body.options || {});
          return sendJson(200, {
            status: 'success',
            guidance,
          });
        }

        // Pass to next middleware if route doesn't match
        next();
      });
    },
  };
}
