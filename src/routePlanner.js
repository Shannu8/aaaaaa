import * as Cesium from 'cesium';
import { CITY_POIS, findPoiByName } from './locations.js';
import { calculateVoyageGuidance } from './voyageGuidance.mjs';

/**
 * Comprehensive offline world place index for deterministic route planning.
 */
const WORLD_PLACES = {
  // Continents & Regions
  'antarctica': { lat: -75.0, lon: 0.0, label: 'Antarctica' },
  'antarctic': { lat: -75.0, lon: 0.0, label: 'Antarctica' },
  'antarctic peninsula': { lat: -68.0, lon: -65.0, label: 'Antarctic Peninsula' },
  'arctic': { lat: 75.0, lon: 0.0, label: 'Arctic' },
  'north pole': { lat: 90.0, lon: 0.0, label: 'North Pole' },
  'south pole': { lat: -90.0, lon: 0.0, label: 'South Pole' },
  'africa': { lat: 1.6586, lon: 16.4952, label: 'Africa' },
  'asia': { lat: 34.0479, lon: 100.6197, label: 'Asia' },
  'europe': { lat: 54.5260, lon: 15.2551, label: 'Europe' },
  'north america': { lat: 54.5260, lon: -105.2551, label: 'North America' },
  'south america': { lat: -8.7832, lon: -55.4915, label: 'South America' },
  'australia': { lat: -25.2744, lon: 133.7751, label: 'Australia' },
  'oceania': { lat: -22.7359, lon: 140.0188, label: 'Oceania' },

  // Major World Cities & Countries
  'tokyo': { lat: 35.6586, lon: 139.7454, label: 'Tokyo, Japan' },
  'japan': { lat: 36.2048, lon: 138.2529, label: 'Japan' },
  'new york': { lat: 40.6892, lon: -74.0445, label: 'New York, USA' },
  'new york city': { lat: 40.6892, lon: -74.0445, label: 'New York, USA' },
  'nyc': { lat: 40.6892, lon: -74.0445, label: 'New York, USA' },
  'usa': { lat: 37.0902, lon: -95.7129, label: 'United States' },
  'united states': { lat: 37.0902, lon: -95.7129, label: 'United States' },
  'london': { lat: 51.5055, lon: -0.0754, label: 'London, UK' },
  'uk': { lat: 55.3781, lon: -3.4360, label: 'United Kingdom' },
  'united kingdom': { lat: 55.3781, lon: -3.4360, label: 'United Kingdom' },
  'paris': { lat: 48.8584, lon: 2.2945, label: 'Paris, France' },
  'france': { lat: 46.2276, lon: 2.2137, label: 'France' },
  'dubai': { lat: 25.1972, lon: 55.2744, label: 'Dubai, UAE' },
  'uae': { lat: 23.4241, lon: 53.8478, label: 'United Arab Emirates' },
  'san francisco': { lat: 37.8199, lon: -122.4783, label: 'San Francisco, USA' },
  'sf': { lat: 37.8199, lon: -122.4783, label: 'San Francisco, USA' },
  'austin': { lat: 30.2747, lon: -97.7403, label: 'Austin, USA' },
  'washington dc': { lat: 38.8897, lon: -77.0091, label: 'Washington DC, USA' },
  'dc': { lat: 38.8897, lon: -77.0091, label: 'Washington DC, USA' },

  'beijing': { lat: 39.9042, lon: 116.4074, label: 'Beijing, China' },
  'shanghai': { lat: 31.2304, lon: 121.4737, label: 'Shanghai, China' },
  'china': { lat: 35.8617, lon: 104.1954, label: 'China' },
  'mumbai': { lat: 19.0760, lon: 72.8777, label: 'Mumbai, India' },
  'delhi': { lat: 28.6139, lon: 77.2090, label: 'Delhi, India' },
  'new delhi': { lat: 28.6139, lon: 77.2090, label: 'New Delhi, India' },
  'india': { lat: 20.5937, lon: 78.9629, label: 'India' },
  'sydney': { lat: -33.8688, lon: 151.2093, label: 'Sydney, Australia' },
  'melbourne': { lat: -37.8136, lon: 144.9631, label: 'Melbourne, Australia' },
  'cairo': { lat: 30.0444, lon: 31.2357, label: 'Cairo, Egypt' },
  'egypt': { lat: 26.8206, lon: 30.8025, label: 'Egypt' },
  'rio de janeiro': { lat: -22.9068, lon: -43.1729, label: 'Rio de Janeiro, Brazil' },
  'sao paulo': { lat: -23.5505, lon: -46.6333, label: 'São Paulo, Brazil' },
  'brazil': { lat: -14.2350, lon: -51.9253, label: 'Brazil' },
  'moscow': { lat: 55.7558, lon: 37.6173, label: 'Moscow, Russia' },
  'russia': { lat: 61.5240, lon: 105.3188, label: 'Russia' },
  'berlin': { lat: 52.5200, lon: 13.4050, label: 'Berlin, Germany' },
  'germany': { lat: 51.1657, lon: 10.4515, label: 'Germany' },
  'rome': { lat: 41.9028, lon: 12.4964, label: 'Rome, Italy' },
  'italy': { lat: 41.8719, lon: 12.5674, label: 'Italy' },
  'toronto': { lat: 43.6532, lon: -79.3832, label: 'Toronto, Canada' },
  'vancouver': { lat: 49.2827, lon: -123.1207, label: 'Vancouver, Canada' },
  'canada': { lat: 56.1304, lon: -106.3468, label: 'Canada' },
  'singapore': { lat: 1.3521, lon: 103.8198, label: 'Singapore' },
  'seoul': { lat: 37.5665, lon: 126.9780, label: 'Seoul, South Korea' },
  'korea': { lat: 35.9078, lon: 127.7669, label: 'South Korea' },
  'los angeles': { lat: 34.0522, lon: -118.2437, label: 'Los Angeles, USA' },
  'la': { lat: 34.0522, lon: -118.2437, label: 'Los Angeles, USA' },
  'chicago': { lat: 41.8781, lon: -87.6298, label: 'Chicago, USA' },
  'miami': { lat: 25.7617, lon: -80.1918, label: 'Miami, USA' },
  'hawaii': { lat: 21.3069, lon: -157.8583, label: 'Honolulu, Hawaii' },
  'honolulu': { lat: 21.3069, lon: -157.8583, label: 'Honolulu, Hawaii' },

  // Preset Landmarks in CITY_POIS
  'texas state capitol': { lat: 30.2747, lon: -97.7403, label: 'Texas State Capitol' },
  'statue of liberty': { lat: 40.6892, lon: -74.0445, label: 'Statue of Liberty' },
  'empire state building': { lat: 40.7484, lon: -73.9857, label: 'Empire State Building' },
  'golden gate bridge': { lat: 37.8199, lon: -122.4783, label: 'Golden Gate Bridge' },
  'eiffel tower': { lat: 48.8584, lon: 2.2945, label: 'Eiffel Tower' },
  'burj khalifa': { lat: 25.1972, lon: 55.2744, label: 'Burj Khalifa' },
  'tokyo tower': { lat: 35.6586, lon: 139.7454, label: 'Tokyo Tower' },
  'tower bridge': { lat: 51.5055, lon: -0.0754, label: 'Tower Bridge' },
  'us capitol': { lat: 38.8897, lon: -77.0091, label: 'US Capitol' },
};

/**
 * Resolve location query or coordinate object using local project data.
 * @param {string | {lat: number, lon: number, label?: string}} query
 * @returns {{lat: number, lon: number, label: string} | null}
 */
export function resolveLocalLocation(query) {
  if (!query) return null;

  // 1. Object directly with coordinates (e.g. from globe pin placement)
  if (typeof query === 'object' && query !== null) {
    if (Number.isFinite(query.lat) && Number.isFinite(query.lon)) {
      return {
        lat: query.lat,
        lon: query.lon,
        label: query.label || `${query.lat.toFixed(4)}°, ${query.lon.toFixed(4)}°`,
      };
    }
  }

  if (typeof query !== 'string') return null;
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return null;

  // 2. Direct lookup in world place index
  if (WORLD_PLACES[cleanQ]) {
    return WORLD_PLACES[cleanQ];
  }

  // 3. Check POI match in CITY_POIS
  const poiMatch = findPoiByName(cleanQ);
  if (poiMatch) {
    const poi = CITY_POIS[poiMatch.cityId]?.pois?.[poiMatch.index];
    if (poi) {
      return {
        lat: poi.lat,
        lon: poi.lon,
        label: poi.name,
      };
    }
  }

  // 4. Check preset cities in CITY_POIS
  for (const [cityId, city] of Object.entries(CITY_POIS)) {
    if (cleanQ === cityId || cleanQ === city.name.toLowerCase() || cleanQ.includes(city.name.toLowerCase())) {
      const defaultPoi = city.pois[0];
      return {
        lat: defaultPoi.lat,
        lon: defaultPoi.lon,
        label: city.name,
      };
    }
  }

  // 5. Check partial string match in WORLD_PLACES
  for (const [key, place] of Object.entries(WORLD_PLACES)) {
    if (cleanQ.includes(key) || key.includes(cleanQ)) {
      return place;
    }
  }

  // 6. Try parsing coordinates directly (e.g. "40.6892, -74.0445" or "Pin: 35.65, 139.74")
  const coordMatch = cleanQ.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return {
        lat,
        lon,
        label: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
      };
    }
  }

  return null;
}

/**
 * Calculate Great-Circle / Geodesic distance in km between two coordinates.
 */
export function calculateGeodesicDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export class RoutePlanner {
  constructor({ viewer = null } = {}) {
    this.viewer = viewer;
    this.activeRouteEntity = null;
    this.initialPinEntity = null;
    this.finalPinEntity = null;

    this.initialPinData = null;
    this.finalPinData = null;

    this.isPlacingPins = false;
    this.pinStage = 0; // 0 = initial pin, 1 = final pin
    this.screenSpaceHandler = null;

    this.onPinPlacedCallback = null;
  }

  setViewer(viewer) {
    this.viewer = viewer;
  }

  startPinPlacement(onPinPlaced) {
    this.onPinPlacedCallback = onPinPlaced;
    this.isPlacingPins = true;
    this.pinStage = 0;

    if (!this.viewer) return;

    // Reset previous pins
    this.clearPins();

    if (!this.screenSpaceHandler) {
      this.screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    } else {
      this.screenSpaceHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    this.screenSpaceHandler.setInputAction((click) => {
      if (!this.isPlacingPins || !this.viewer) return;

      const ray = this.viewer.camera.getPickRay(click.position);
      let position = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!position) {
        position = this.viewer.camera.pickEllipsoid(click.position, this.viewer.scene.globe.ellipsoid);
      }
      if (!position) return;

      const cartographic = Cesium.Cartographic.fromCartesian(position);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);
      const lon = Cesium.Math.toDegrees(cartographic.longitude);

      if (this.pinStage === 0) {
        // Create Initial Pin
        this.initialPinData = { lat, lon, label: `Pin: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°` };
        this.createPinEntity('initial', this.initialPinData);
        this.pinStage = 1;

        if (typeof this.onPinPlacedCallback === 'function') {
          this.onPinPlacedCallback('initial', this.initialPinData);
        }
      } else if (this.pinStage === 1) {
        // Create Final Pin
        this.finalPinData = { lat, lon, label: `Pin: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°` };
        this.createPinEntity('final', this.finalPinData);
        this.isPlacingPins = false;
        this.stopPinPlacement();

        if (typeof this.onPinPlacedCallback === 'function') {
          this.onPinPlacedCallback('final', this.finalPinData);
        }

        // Automatically calculate route after 2nd pin
        this.calculateRoute(this.initialPinData, this.finalPinData);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  stopPinPlacement() {
    this.isPlacingPins = false;
    if (this.screenSpaceHandler) {
      this.screenSpaceHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
  }

  createPinEntity(type, pinData) {
    if (!this.viewer) return;

    const isInitial = type === 'initial';
    const entityProp = isInitial ? 'initialPinEntity' : 'finalPinEntity';

    if (this[entityProp]) {
      this.viewer.entities.remove(this[entityProp]);
    }

    const pos = Cesium.Cartesian3.fromDegrees(pinData.lon, pinData.lat);
    const color = isInitial ? Cesium.Color.CYAN : Cesium.Color.MAGENTA;
    const title = isInitial ? 'INITIAL PIN' : 'FINAL PIN';

    this[entityProp] = this.viewer.entities.add({
      name: `${title}: ${pinData.lat.toFixed(4)}°, ${pinData.lon.toFixed(4)}°`,
      position: pos,
      point: {
        pixelSize: 14,
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.NONE,
      },
      label: {
        text: `${title}\n${pinData.lat.toFixed(4)}°, ${pinData.lon.toFixed(4)}°`,
        font: 'bold 12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
      },
    });
  }

  async calculateRoute(initialInput, finalInput, userMode = 'GENERAL') {
    const userModeMap = {
      SHORTEST: 'shortest',
      SAFE: 'lowest_risk',
      GENERAL: 'balanced',
      shortest: 'shortest',
      lowest_risk: 'lowest_risk',
      low_ice: 'low_ice',
      balanced: 'balanced',
    };
    const mode = userModeMap[userMode] || 'balanced';

    const initialLocation = resolveLocalLocation(initialInput) || this.initialPinData;
    if (!initialLocation) {
      return { ok: false, error: 'Initial location not found' };
    }

    const finalLocation = resolveLocalLocation(finalInput) || this.finalPinData;
    if (!finalLocation) {
      return { ok: false, error: 'Final location not found' };
    }

    // Try maritime routing engine via API
    try {
      const response = await fetch('/api/route/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { latitude: initialLocation.lat, longitude: initialLocation.lon },
          destination: { latitude: finalLocation.lat, longitude: finalLocation.lon },
          mode: mode,
          safety_buffer_km: 5.0,
          multi_route: true,
        }),
      });

      const routeData = await response.json();

      if (routeData.status === 'LAND_ENDPOINT') {
        return {
          ok: false,
          status: 'LAND_ENDPOINT',
          error: routeData.reason || 'Start or destination location is on land.',
          start: routeData.start,
          destination: routeData.destination,
          suggestions: routeData.suggestions,
        };
      }

      if (routeData.status === 'NO_FEASIBLE_MARITIME_ROUTE' || routeData.status === 'NO_SAFE_ROUTE') {
        return {
          ok: false,
          status: routeData.status,
          error: routeData.reason || 'No feasible maritime route found after multi-pass search.',
          suggestions: routeData.suggestions,
        };
      }

      const options = routeData.options || {};
      const userOptions = {
        SHORTEST: options.shortest || options[mode],
        SAFE: options.lowest_risk || options.low_ice || options[mode],
        GENERAL: options.balanced || options[mode],
      };

      const selectedOption = userOptions[userMode] || options[mode] || Object.values(options)[0];

      if (!selectedOption || selectedOption.status !== 'success') {
        return {
          ok: false,
          status: selectedOption?.status || 'CALCULATION_FAILED',
          error: selectedOption?.reason || 'Maritime route calculation failed.',
          suggestions: selectedOption?.suggestions,
        };
      }

      // Draw color-coded maritime route polyline & intermediate waypoints on Cesium Globe
      if (this.viewer && selectedOption.route) {
        this.clearRouteOnly();

        // Store globally for voice guidance and tactical HUD tools access
        window.__activeMaritimeRoute = selectedOption;

        const points = selectedOption.route;
        const routeEntities = [];

        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const conc = ((p1.sea_ice_concentration || 0) + (p2.sea_ice_concentration || 0)) / 2;

          let segmentColor = Cesium.Color.CYAN;
          if (conc > 0.6) segmentColor = Cesium.Color.MAGENTA;
          else if (conc > 0.3) segmentColor = Cesium.Color.PURPLE;
          else if (conc > 0.1) segmentColor = Cesium.Color.DODGERBLUE;

          const segEntity = this.viewer.entities.add({
            name: `Maritime Segment ${i + 1} (Ice: ${Math.round(conc * 100)}%)`,
            polyline: {
              positions: [
                Cesium.Cartesian3.fromDegrees(p1.longitude, p1.latitude, 500),
                Cesium.Cartesian3.fromDegrees(p2.longitude, p2.latitude, 500),
              ],
              width: 6,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.25,
                color: segmentColor,
              }),
            },
          });
          routeEntities.push(segEntity);
        }

        // Create clickable Waypoint entities on the Globe with label decluttering and detailed info popups
        const waypointEntities = [];
        if (Array.isArray(selectedOption.waypoints)) {
          selectedOption.waypoints.forEach((wp, idx) => {
            const isStart = idx === 0 || wp.type === 'START';
            const isDest = idx === selectedOption.waypoints.length - 1 || wp.type === 'DESTINATION';
            const isDetour = wp.type === 'OBSTACLE DETOUR' || wp.type === 'COURSE CHANGE';
            const pos = Cesium.Cartesian3.fromDegrees(wp.longitude, wp.latitude, 600);

            const prevWp = selectedOption.waypoints[idx - 1];
            const nextWp = selectedOption.waypoints[idx + 1];
            const distFromPrev = prevWp ? Math.round(calculateGeodesicDistanceKm(prevWp.latitude, prevWp.longitude, wp.latitude, wp.longitude)) : null;
            const distToNext = nextWp ? Math.round(calculateGeodesicDistanceKm(wp.latitude, wp.longitude, nextWp.latitude, nextWp.longitude)) : null;
            const seg = selectedOption.segments?.[idx];

            // Alternating vertical label offset to declutter close labels along route
            const yOffset = idx % 2 === 0 ? -14 : 14;

            const wpEntity = this.viewer.entities.add({
              name: `Waypoint ${wp.id}: ${wp.latitude.toFixed(4)}°, ${wp.longitude.toFixed(4)}°`,
              position: pos,
              point: {
                pixelSize: isDetour ? 14 : (isStart || isDest ? 12 : 10),
                color: isStart || isDest ? Cesium.Color.LIME : (isDetour ? Cesium.Color.YELLOW : Cesium.Color.CYAN),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.NONE,
              },
              label: {
                text: wp.id,
                font: 'bold 11px monospace',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: yOffset < 0 ? Cesium.VerticalOrigin.BOTTOM : Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(0, yOffset),
                eyeOffset: new Cesium.Cartesian3(0, 0, -10),
              },
              description: `
                <div style="font-family:sans-serif;padding:12px;color:#fff;background:rgba(8,16,28,0.95);border-radius:6px;min-width:230px;border:1px solid rgba(0,229,255,0.4);">
                  <h3 style="margin:0 0 6px 0;color:#00e5ff;font-size:13px;letter-spacing:1px;border-bottom:1px solid rgba(0,229,255,0.3);padding-bottom:4px;">WAYPOINT ${wp.id}</h3>
                  <div style="font-size:10.5px;line-height:1.6;">
                    <div><strong>Latitude:</strong> ${wp.latitude.toFixed(4)}°</div>
                    <div><strong>Longitude:</strong> ${wp.longitude.toFixed(4)}°</div>
                    ${wp.distance_from_prev_km !== null && wp.distance_from_prev_km !== undefined ? `<div><strong>Distance from prev:</strong> ${wp.distance_from_prev_km} km</div>` : ''}
                    ${wp.distance_to_next_km !== null && wp.distance_to_next_km !== undefined ? `<div><strong>Distance to next:</strong> ${wp.distance_to_next_km} km</div>` : ''}
                    ${wp.bearing_to_next !== null && wp.bearing_to_next !== undefined ? `<div><strong>Bearing to next:</strong> ${wp.bearing_to_next}° TRUE</div>` : ''}
                    ${wp.compass_direction ? `<div><strong>Direction:</strong> ${wp.compass_direction}</div>` : ''}
                    ${wp.turn_text ? `<div><strong>Turn:</strong> <span style="color:#ffcc00;font-weight:bold;">${wp.turn_text}</span></div>` : ''}
                    <div><strong>Waypoint Type:</strong> <span style="color:#00ffaa;font-weight:bold;">${wp.type || 'ROUTE CHECKPOINT'}</span></div>
                    <div style="margin-top:6px;padding:6px;background:rgba(0,229,255,0.08);border-left:3px solid #00e5ff;font-size:9.5px;color:rgba(255,255,255,0.9);">
                      <strong>Reason:</strong> ${wp.routing_reason || 'Navigation corridor checkpoint.'}
                    </div>
                  </div>
                </div>
              `,
            });
            waypointEntities.push(wpEntity);
          });
        }

        this.activeRouteEntities = routeEntities;
        this.activeRouteEntity = routeEntities[0];
        this.waypointEntities = waypointEntities;

        // Fly camera to frame the maritime route
        this.viewer.flyTo(routeEntities, {
          duration: 2.2,
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-60), 0),
        }).catch(() => {});
      }

      return {
        ok: true,
        type: 'maritime',
        initial: initialLocation,
        final: finalLocation,
        userMode: userMode,
        selectedMode: mode,
        metrics: selectedOption.metrics,
        waypoints: selectedOption.waypoints,
        segments: selectedOption.segments,
        options: routeData.options,
        userOptions: userOptions,
        selectedOption: selectedOption,
        disclaimer: 'Sea Ice Data: 2026-01-01 (Historical observation dataset)',
      };
    } catch (err) {
      console.warn('[ROUTE PLANNER] Maritime calculation failed:', err);
      this.clearRouteOnly();
      return {
        ok: false,
        status: 'CALCULATION_ERROR',
        error: err?.message || 'Maritime routing engine request failed.',
      };
    }
  }

  clearRouteOnly() {
    if (this.viewer) {
      if (Array.isArray(this.activeRouteEntities)) {
        this.activeRouteEntities.forEach((e) => this.viewer.entities.remove(e));
        this.activeRouteEntities = [];
      }
      if (Array.isArray(this.waypointEntities)) {
        this.waypointEntities.forEach((e) => this.viewer.entities.remove(e));
        this.waypointEntities = [];
      }
      if (this.activeRouteEntity) {
        this.viewer.entities.remove(this.activeRouteEntity);
        this.activeRouteEntity = null;
      }
    }
  }

  clearPins() {
    if (this.viewer) {
      if (this.initialPinEntity) {
        this.viewer.entities.remove(this.initialPinEntity);
        this.initialPinEntity = null;
      }
      if (this.finalPinEntity) {
        this.viewer.entities.remove(this.finalPinEntity);
        this.finalPinEntity = null;
      }
    }
    this.initialPinData = null;
    this.finalPinData = null;
  }

  clearAll() {
    this.stopPinPlacement();
    this.clearRouteOnly();
    this.clearPins();
  }
}

/**
 * Initialize Route Planner UI component
 */
export function initRoutePlanner({ viewer = null } = {}) {
  const initialInput = document.getElementById('route-initial-location');
  const finalInput = document.getElementById('route-final-location');
  const placePinsBtn = document.getElementById('route-place-pins-btn');
  const calculateBtn = document.getElementById('route-calculate-btn');
  const clearBtn = document.getElementById('route-clear-btn');
  const resultDisplay = document.getElementById('route-result-display');
  const searchInput = document.getElementById('route-location-search');
  const presetPills = document.querySelectorAll('.route-preset-pill');

  const planner = new RoutePlanner({ viewer });

  let selectedUserMode = 'GENERAL';

  // Format pin data to string (e.g. Pin: -78.1353°, 173.9437°)
  const formatPinLabel = (lat, lon) => `Pin: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

  // Quick preset pills click handler
  const handleLocationSelect = (query) => {
    const loc = resolveLocalLocation(query);
    if (!loc) return;

    if (!planner.initialPinData) {
      planner.initialPinData = loc;
      planner.createPinEntity('initial', loc);
      if (initialInput) initialInput.value = loc.label || formatPinLabel(loc.lat, loc.lon);
    } else {
      planner.finalPinData = loc;
      planner.createPinEntity('final', loc);
      if (finalInput) finalInput.value = loc.label || formatPinLabel(loc.lat, loc.lon);
      handleCalculate();
    }

    if (planner.viewer) {
      planner.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, 250000),
        duration: 1.8,
      });
    }
  };

  presetPills.forEach((pill) => {
    pill.addEventListener('click', (e) => {
      const locName = e.currentTarget.getAttribute('data-location');
      if (locName) handleLocationSelect(locName);
    });
  });

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        handleLocationSelect(searchInput.value.trim());
      }
    });
  }

  const updateResultUI = (res) => {
    if (!resultDisplay) return;
    if (!res.ok) {
      if (res.status === 'LAND_ENDPOINT') {
        const hasStartLand = res.start?.isLand && res.start?.nearestOceanPoint;
        const hasDestLand = res.destination?.isLand && res.destination?.nearestOceanPoint;

        resultDisplay.innerHTML = `
          <div class="route-result-land-endpoint" style="background:rgba(255,170,0,0.12);border:1px solid rgba(255,170,0,0.45);padding:10px;border-radius:6px;font-size:11px;color:#fff;font-family:sans-serif;">
            <div style="font-weight:bold;margin-bottom:6px;color:#ffaa00;display:flex;justify-content:space-between;align-items:center;">
              <span>LAND LOCATION DETECTED</span>
              <span style="font-size:9px;background:rgba(255,170,0,0.25);padding:2px 6px;border-radius:3px;">LAND ENDPOINT</span>
            </div>
            <div style="margin-bottom:8px;line-height:1.5;font-size:10px;">
              ${res.start ? `<div><strong>START:</strong> ${res.start.isLand ? `<span style="color:#ffaa00;">● LAND LOCATION</span> (${res.start.latitude.toFixed(4)}°, ${res.start.longitude.toFixed(4)}°)` : `<span style="color:#00ffaa;">● OCEAN</span>`}</div>` : ''}
              ${res.destination ? `<div><strong>DESTINATION:</strong> ${res.destination.isLand ? `<span style="color:#ffaa00;">● LAND LOCATION</span> (${res.destination.latitude.toFixed(4)}°, ${res.destination.longitude.toFixed(4)}°)` : `<span style="color:#00ffaa;">● OCEAN</span>`}</div>` : ''}
            </div>
            <div style="font-size:10px;color:rgba(255,255,255,0.85);margin-bottom:8px;background:rgba(0,0,0,0.3);padding:6px;border-radius:4px;border-left:3px solid #ffaa00;">
              MARITIME ROUTING REQUIRES OCEAN ENDPOINTS
            </div>
            ${hasStartLand || hasDestLand ? `
              <div style="background:rgba(0,0,0,0.45);padding:8px;border-radius:4px;margin-bottom:8px;font-size:10px;border:1px solid rgba(0,229,255,0.2);">
                <div style="color:#00e5ff;font-weight:bold;margin-bottom:4px;letter-spacing:0.5px;">CANDIDATE OCEAN WATERS</div>
                ${hasStartLand ? `
                  <div style="margin-bottom:3px;">
                    <div>SELECTED START: <strong>${res.start.latitude.toFixed(4)}°, ${res.start.longitude.toFixed(4)}°</strong></div>
                    <div>MARITIME START: <strong style="color:#00ffaa;">${res.start.nearestOceanPoint.lat.toFixed(4)}°, ${res.start.nearestOceanPoint.lon.toFixed(4)}°</strong></div>
                    <div style="opacity:0.8;font-size:9px;">DISTANCE TO OCEAN: <strong>${res.start.nearestOceanDistanceKm} km</strong> ${res.start.nearestOceanDistanceKm > 50 ? '<span style="color:#ffcc00;">(LOCATION TOO FAR FROM OCEAN)</span>' : ''}</div>
                  </div>
                ` : ''}
                ${hasDestLand ? `
                  <div style="margin-top:4px;">
                    <div>SELECTED DEST: <strong>${res.destination.latitude.toFixed(4)}°, ${res.destination.longitude.toFixed(4)}°</strong></div>
                    <div>MARITIME DEST: <strong style="color:#00ffaa;">${res.destination.nearestOceanPoint.lat.toFixed(4)}°, ${res.destination.nearestOceanPoint.lon.toFixed(4)}°</strong></div>
                    <div style="opacity:0.8;font-size:9px;">DISTANCE TO OCEAN: <strong>${res.destination.nearestOceanDistanceKm} km</strong> ${res.destination.nearestOceanDistanceKm > 50 ? '<span style="color:#ffcc00;">(LOCATION TOO FAR FROM OCEAN)</span>' : ''}</div>
                  </div>
                ` : ''}
              </div>
              <button id="btn-snap-ocean-point" type="button" class="btn-ocean-snap" style="width:100%;padding:8px;background:rgba(0,229,255,0.2);border:1px solid #00e5ff;color:#00e5ff;font-weight:bold;font-size:10px;border-radius:4px;cursor:pointer;letter-spacing:0.5px;">
                [ FIND NEAREST OCEAN POINT ]
              </button>
            ` : ''}
          </div>
        `;

        const snapBtn = resultDisplay.querySelector('#btn-snap-ocean-point');
        if (snapBtn) {
          snapBtn.addEventListener('click', () => {
            if (hasStartLand) {
              const p = res.start.nearestOceanPoint;
              planner.initialPinData = { lat: p.lat, lon: p.lon, label: formatPinLabel(p.lat, p.lon) };
              planner.createPinEntity('initial', planner.initialPinData);
              if (initialInput) initialInput.value = formatPinLabel(p.lat, p.lon);
            }
            if (hasDestLand) {
              const p = res.destination.nearestOceanPoint;
              planner.finalPinData = { lat: p.lat, lon: p.lon, label: formatPinLabel(p.lat, p.lon) };
              planner.createPinEntity('final', planner.finalPinData);
              if (finalInput) finalInput.value = formatPinLabel(p.lat, p.lon);
            }
            handleCalculate();
          });
        }
        return;
      }

      const suggestionsHtml = Array.isArray(res.suggestions)
        ? `<div class="route-suggestions" style="margin-top:6px;font-size:10px;color:rgba(255,255,255,0.7);"><strong>Suggestions:</strong><ul style="margin:4px 0 0 16px;padding:0;">${res.suggestions.map((s) => `<li>${s}</li>`).join('')}</ul></div>`
        : '';
      resultDisplay.innerHTML = `
        <div class="route-result-error" style="background:rgba(255,51,102,0.1);border:1px solid rgba(255,51,102,0.35);padding:10px;border-radius:6px;font-size:11px;color:#fff;">
          <div style="font-weight:bold;margin-bottom:6px;color:#ff3366;">${res.status || 'NO SAFE ROUTE'}</div>
          <div>${res.error}</div>
          ${suggestionsHtml}
        </div>
      `;
    } else if (res.type === 'maritime' && res.metrics) {
      const m = res.metrics;
      const options = res.options || {};
      const currentMode = res.selectedMode || 'balanced';
      const waypoints = res.waypoints || [];
      const segments = res.segments || [];

      // Single source of truth calculation for voyage guidance
      const vesselState = window.__activeVessel || null;
      const guidance = calculateVoyageGuidance(res, vesselState);
      
      // Save global active route & guidance references for voice & navigation
      window.__activeMaritimeRoute = res;
      window.__activeVoyageGuidance = guidance;

      const nextWp = guidance.nextWaypoint || waypoints[1] || waypoints[0] || {};
      const requiredBearing = guidance.requiredBearingDegrees !== undefined ? guidance.requiredBearingDegrees : (segments[0]?.bearingDegrees || 0);
      const compassDir = guidance.compassDirection || segments[0]?.compassDirection || 'N';

      const totalKm = m.distance_km || 1;
      const remainingKm = guidance.distanceRemainingKm !== undefined ? guidance.distanceRemainingKm : totalKm;
      const completedKm = Math.max(0, Math.round(totalKm - remainingKm));
      const progressPercent = Math.min(100, Math.max(0, Math.round((completedKm / totalKm) * 100)));

      // Tactical Compass HTML with rotating needle
      const compassHtml = `
        <div class="tactical-compass-container" style="background:rgba(0,0,0,0.4);border:1px solid rgba(0,229,255,0.25);padding:10px;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;margin:0;">
          <div style="font-size:10px;font-weight:bold;color:#00e5ff;letter-spacing:1px;margin-bottom:6px;width:100%;text-align:center;border-bottom:1px solid rgba(0,229,255,0.2);padding-bottom:4px;">TACTICAL NAV COMPASS</div>
          <div style="display:flex;align-items:center;gap:10px;width:100%;justify-content:center;">
            <div class="tactical-compass-svg-wrap" style="position:relative;width:76px;height:76px;flex-shrink:0;">
              <svg width="76" height="76" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="42" fill="rgba(8,16,28,0.8)" stroke="rgba(0,229,255,0.4)" stroke-width="1.5"/>
                <circle cx="45" cy="45" r="34" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
                
                <!-- Cardinal directions -->
                <text x="45" y="13" font-size="9" fill="#00e5ff" font-weight="bold" text-anchor="middle">N</text>
                <text x="79" y="48" font-size="8" fill="rgba(255,255,255,0.7)" text-anchor="middle">E</text>
                <text x="45" y="83" font-size="8" fill="rgba(255,255,255,0.7)" text-anchor="middle">S</text>
                <text x="11" y="48" font-size="8" fill="rgba(255,255,255,0.7)" text-anchor="middle">W</text>

                <!-- Intercardinal directions -->
                <text x="69" y="24" font-size="6" fill="rgba(255,255,255,0.5)" text-anchor="middle">NE</text>
                <text x="69" y="71" font-size="6" fill="rgba(255,255,255,0.5)" text-anchor="middle">SE</text>
                <text x="21" y="71" font-size="6" fill="rgba(255,255,255,0.5)" text-anchor="middle">SW</text>
                <text x="21" y="24" font-size="6" fill="rgba(255,255,255,0.5)" text-anchor="middle">NW</text>

                <circle cx="45" cy="45" r="3" fill="#00e5ff"/>

                <g id="compass-needle-group" class="compass-needle-group" style="transform: rotate(${requiredBearing}deg); transform-origin: 45px 45px; transition: transform 0.5s ease-out;">
                  <polygon points="45,15 41,45 49,45" fill="#ff3366"/>
                  <polygon points="45,75 41,45 49,45" fill="rgba(255,255,255,0.3)"/>
                </g>
              </svg>
            </div>

            <div style="font-size:9.5px;text-align:left;line-height:1.45;flex:1;">
              <div style="margin-bottom:4px;">
                <span style="color:rgba(255,255,255,0.5);font-size:8px;display:block;">REQUIRED BEARING</span>
                <strong id="readout-required-bearing" style="color:#00ffaa;font-size:11px;">${requiredBearing}° TRUE</strong> (<span id="readout-compass-dir">${compassDir}</span>)
              </div>
              <div style="margin-bottom:4px;">
                <span style="color:rgba(255,255,255,0.5);font-size:8px;display:block;">CURRENT HEADING</span>
                <strong style="color:#fff;font-size:10px;">${guidance.vesselHeading !== null ? `${guidance.vesselHeading}° TRUE` : 'UNAVAILABLE'}</strong>
              </div>
              <div>
                <span style="color:rgba(255,255,255,0.5);font-size:8px;display:block;">HEADING CORRECTION</span>
                <strong id="readout-heading-correction" style="font-size:9.5px;color:${guidance.headingErrorDegrees ? '#ffcc00' : 'rgba(255,255,255,0.7)'};">
                  ${guidance.headingErrorDegrees !== null ? (guidance.headingErrorDegrees > 0 ? `TURN ${Math.abs(guidance.headingErrorDegrees)}° RIGHT` : `TURN ${Math.abs(guidance.headingErrorDegrees)}° LEFT`) : 'UNAVAILABLE'}
                </strong>
              </div>
            </div>
          </div>
        </div>
      `;

      // Route Progress Bar HTML
      const progressBarHtml = `
        <div class="voyage-progress-container" style="background:rgba(0,0,0,0.4);border:1px solid rgba(0,229,255,0.25);padding:10px;border-radius:6px;display:flex;flex-direction:column;justify-content:space-between;margin:0;">
          <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:bold;color:#00e5ff;letter-spacing:1px;margin-bottom:6px;border-bottom:1px solid rgba(0,229,255,0.2);padding-bottom:4px;">
            <span>ROUTE PROGRESS</span>
            <span style="color:#00ffaa;">${progressPercent}% COMPLETED</span>
          </div>
          <div style="position:relative;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;margin-bottom:8px;">
            <div style="width:${progressPercent}%;height:100%;background:linear-gradient(90deg, #0088ff, #00e5ff, #00ffaa);border-radius:4px;"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;font-size:9.5px;color:rgba(255,255,255,0.85);">
            <div style="display:flex;justify-content:space-between;"><span style="color:rgba(255,255,255,0.5);">Completed:</span> <strong>${completedKm} km</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:rgba(255,255,255,0.5);">Remaining:</span> <strong>${remainingKm} km</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:rgba(255,255,255,0.5);">Total:</span> <strong>${totalKm} km</strong></div>
          </div>
        </div>
      `;

      // 3x3 Voyage Metrics Grid HTML
      const voyageMetricsGridHtml = `
        <div class="voyage-metrics-grid" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;background:rgba(0,0,0,0.4);padding:10px;border-radius:6px;border:1px solid rgba(0,229,255,0.25);margin:0;">
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">CROSS-TRACK</span>
            <strong style="color:${guidance.crossTrackErrorKm > 3 ? '#ff3366' : '#00ffaa'};font-size:10px;display:block;">${guidance.crossTrackErrorKm !== null ? `${guidance.crossTrackErrorKm} km` : 'UNAVAILABLE'}</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">AVG SEA ICE</span>
            <strong style="color:#fff;font-size:10px;display:block;">${Math.round(m.average_ice_concentration * 100)}%</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">MAX SEA ICE</span>
            <strong style="color:#fff;font-size:10px;display:block;">${Math.round((m.maximum_ice_concentration || m.average_ice_concentration) * 100)}%</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">ICEBERG CLEARANCE</span>
            <strong style="color:${m.minimum_iceberg_distance_km > 0 ? '#00ffaa' : '#ff3366'};font-size:10px;display:block;">${m.minimum_iceberg_distance_km !== undefined ? `${m.minimum_iceberg_distance_km} km` : 'UNAVAILABLE'}</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">RISK SCORE</span>
            <strong style="color:${m.risk_score > 50 ? '#ff3366' : '#00e5ff'};font-size:10px;display:block;">${m.risk_score} / 100</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">VESSEL SPEED</span>
            <strong style="color:#fff;font-size:10px;display:block;">${guidance.hasVesselPosition ? `${guidance.vesselSpeedKnots} kn` : `PLANNING ${guidance.vesselSpeedKnots} kn`}</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">ETA</span>
            <strong style="color:#00e5ff;font-size:10px;display:block;">${guidance.eta ? (guidance.eta.formattedDuration || `${guidance.eta.hours}h ${guidance.eta.minutes}m`) : 'UNAVAILABLE'}</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">EST. FUEL</span>
            <strong style="color:#fff;font-size:10px;display:block;">${m.fuel?.estimatedFuelLiters ? `${m.fuel.estimatedFuelLiters.toLocaleString()} L` : 'UNAVAILABLE'}</strong>
          </div>
          <div class="voyage-metric-item" style="background:rgba(0,229,255,0.04);padding:4px 6px;border-radius:4px;border:1px solid rgba(0,229,255,0.1);">
            <span style="color:rgba(255,255,255,0.5);display:block;font-size:7.5px;letter-spacing:0.3px;white-space:nowrap;">DETOUR</span>
            <strong style="color:${m.detour_km > 0 ? '#ffcc00' : '#00ffaa'};font-size:10px;display:block;">+${m.detour_km || 0} km</strong>
          </div>
        </div>
      `;

      // Next Waypoint Box
      const nextWpBoxHtml = `
        <div class="nextwp-card" style="background:rgba(0,0,0,0.4);border:1px solid rgba(0,229,255,0.25);padding:10px;border-radius:6px;display:flex;flex-direction:column;justify-content:space-between;margin:0;">
          <div style="font-size:10px;font-weight:bold;color:#00e5ff;letter-spacing:1px;margin-bottom:6px;border-bottom:1px solid rgba(0,229,255,0.2);padding-bottom:4px;">NEXT WAYPOINT TARGET</div>
          <div style="font-size:14px;font-weight:bold;color:#00ffaa;margin-bottom:6px;">${nextWp.id || 'WP-01'}</div>
          <div style="font-size:9.5px;line-height:1.55;color:rgba(255,255,255,0.9);">
            <div><span style="color:rgba(255,255,255,0.5);">COORDS:</span> <strong>${nextWp.latitude ? `${nextWp.latitude.toFixed(4)}°` : '0°'}, ${nextWp.longitude ? `${nextWp.longitude.toFixed(4)}°` : '0°'}</strong></div>
            <div><span style="color:rgba(255,255,255,0.5);">DISTANCE:</span> <strong>${guidance.distanceToNextKm != null ? `${guidance.distanceToNextKm} km` : '0 km'}</strong></div>
            <div><span style="color:rgba(255,255,255,0.5);">BEARING:</span> <strong style="color:#00e5ff;">${requiredBearing}° TRUE</strong></div>
            <div><span style="color:rgba(255,255,255,0.5);">DIRECTION:</span> <strong>${compassDir}</strong></div>
          </div>
        </div>
      `;

      // Multi-factor Route Comparison Cards (SHORTEST / SAFE / GENERAL)
      let alternativesHtml = '';
      const altUserModes = {
        SHORTEST: options.shortest,
        SAFE: options.lowest_risk,
        GENERAL: options.balanced,
      };
      const altModeBackend = { SHORTEST: 'shortest', SAFE: 'lowest_risk', GENERAL: 'balanced' };
      const altHasAny = Object.values(altUserModes).some(Boolean);

      if (altHasAny) {
        alternativesHtml = `
          <div class="route-alternatives-section" style="background:rgba(0,0,0,0.4);padding:10px;border-radius:6px;border:1px solid rgba(0,229,255,0.25);display:flex;flex-direction:column;justify-content:space-between;margin:0;">
            <div style="font-size:10px;font-weight:bold;color:#00e5ff;letter-spacing:1px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,229,255,0.2);padding-bottom:4px;">
              <span>ROUTE COMPARISON</span>
              <span style="font-size:8.5px;color:rgba(255,255,255,0.5);font-weight:normal;">SHORTEST | SAFE | GENERAL</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
              ${['SHORTEST', 'SAFE', 'GENERAL'].map((uMode) => {
                const modeData = altUserModes[uMode];
                const bKey = altModeBackend[uMode];
                const isSelected = (res.userMode === uMode) || (bKey === currentMode && !res.userMode);
                const mObj = modeData?.metrics || {};
                const distVal = mObj.distance_km ? `${mObj.distance_km} km` : 'N/A';
                const avgIceVal = mObj.average_ice_concentration != null ? `${Math.round(mObj.average_ice_concentration * 100)}%` : 'N/A';
                const maxIceVal = mObj.maximum_ice_concentration != null ? `${Math.round(mObj.maximum_ice_concentration * 100)}%` : avgIceVal;
                const clearanceVal = mObj.minimum_iceberg_distance_km != null ? `${mObj.minimum_iceberg_distance_km} km` : 'N/A';
                const riskVal = mObj.risk_score != null ? mObj.risk_score : 'N/A';
                const fuelVal = mObj.fuel?.estimatedFuelLiters ? `${Math.round(mObj.fuel.estimatedFuelLiters / 1000)}k L` : 'N/A';
                const detourVal = mObj.detour_km > 0 ? `+${mObj.detour_km} km` : '0 km';
                const modeColors = { SHORTEST: '#00e5ff', SAFE: '#00ffaa', GENERAL: '#ff9900' };
                const col = modeColors[uMode] || '#00e5ff';
                return `
                  <button class="result-mode-btn ${isSelected ? 'active' : ''}" data-mode="${bKey}" data-usermode="${uMode}"
                    style="padding:6px 6px;font-size:8.5px;font-family:monospace;background:${isSelected ? `rgba(${uMode === 'SHORTEST' ? '0,229,255' : uMode === 'SAFE' ? '0,255,170' : '255,153,0'},0.18)` : 'rgba(0,0,0,0.45)'};border:1.5px solid ${isSelected ? col : 'rgba(0,229,255,0.2)'};color:${isSelected ? col : '#fff'};border-radius:4px;cursor:pointer;text-align:left;line-height:1.35;transition:all 0.15s ease;display:flex;flex-direction:column;justify-content:space-between;min-width:0;box-sizing:border-box;">
                    <div>
                      <div style="font-weight:bold;font-size:10px;color:${col};letter-spacing:0.5px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
                        <span>${uMode}</span>
                        ${isSelected ? `<span style="font-size:7.5px;background:${col};color:#000;padding:1px 3px;border-radius:2px;font-weight:bold;white-space:nowrap;">[ ACTIVE ]</span>` : ''}
                      </div>
                      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:rgba(255,255,255,0.5);">DIST:</span> <strong>${distVal}</strong></div>
                      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:rgba(255,255,255,0.5);">AVG ICE:</span> <strong>${avgIceVal}</strong></div>
                      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:rgba(255,255,255,0.5);">MAX ICE:</span> <strong>${maxIceVal}</strong></div>
                      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:rgba(255,255,255,0.5);">CLEARANCE:</span> <strong>${clearanceVal}</strong></div>
                      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:rgba(255,255,255,0.5);">RISK:</span> <strong>${riskVal}/100</strong></div>
                      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:rgba(255,255,255,0.5);">EST FUEL:</span> <strong>${fuelVal}</strong></div>
                      <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:rgba(255,255,255,0.5);">DETOUR:</span> <strong style="color:${mObj.detour_km > 0 ? '#ffcc00' : '#00ffaa'};">${detourVal}</strong></div>
                    </div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      // Waypoints Table HTML with active waypoint highlighting (.active-wp)
      let waypointsListHtml = '';
      if (waypoints.length > 0) {
        waypointsListHtml = `
          <div class="route-waypoints-section" style="margin-top:2px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,229,255,0.25);border-radius:6px;padding:10px;">
            <div style="font-size:10px;font-weight:bold;color:#00e5ff;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,229,255,0.2);padding-bottom:4px;">
              <span>NAVIGATION WAYPOINTS (${waypoints.length})</span>
              <span style="font-size:8.5px;color:rgba(255,255,255,0.5);font-weight:normal;">Click row to inspect</span>
            </div>
            <div style="max-height:160px;overflow-y:auto;scrollbar-width:thin;">
              <table style="width:100%;font-size:9.5px;border-collapse:collapse;color:#fff;text-align:left;table-layout:fixed;">
                <thead>
                  <tr style="border-bottom:1px solid rgba(0,229,255,0.3);color:#00e5ff;font-family:monospace;font-size:9px;">
                    <th style="padding:6px 4px;width:10%;">ID</th>
                    <th style="padding:6px 4px;width:28%;">COORDINATES</th>
                    <th style="padding:6px 4px;width:15%;">BEARING</th>
                    <th style="padding:6px 4px;width:12%;">DIRECTION</th>
                    <th style="padding:6px 4px;width:15%;">DISTANCE</th>
                    <th style="padding:6px 4px;width:20%;">TYPE</th>
                  </tr>
                </thead>
                <tbody>
                  ${waypoints.map((wp, idx) => {
                    const seg = segments[idx];
                    const isActive = (nextWp.id && wp.id === nextWp.id) || (idx === guidance.nextWaypointIndex);
                    const wpType = wp.type || (idx === 0 ? 'START' : idx === waypoints.length - 1 ? 'DESTINATION' : 'CHECKPOINT');
                    const wpBearing = seg?.bearingDegrees != null ? `${seg.bearingDegrees}°` : (wp.bearing_to_next != null ? `${wp.bearing_to_next}°` : '—');
                    const wpDir = seg?.compassDirection || wp.compass_direction || '—';
                    const wpDist = seg?.distanceKm != null ? `${seg.distanceKm} km` : (wp.distance_to_next_km != null ? `${wp.distance_to_next_km} km` : '—');
                    return `
                      <tr class="wp-row ${isActive ? 'active-wp' : ''}" data-idx="${idx}" data-id="${wp.id}" data-lat="${wp.latitude}" data-lon="${wp.longitude}" data-type="${wpType}" data-reason="${wp.routing_reason || 'Route checkpoint'}" data-prevdist="${wp.distance_from_prev_km || ''}" data-nextdist="${wp.distance_to_next_km || ''}" data-bearing="${wpBearing}" data-compass="${wpDir}" data-turn="${wp.turn_text || ''}" style="border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;${isActive ? 'background:rgba(0,229,255,0.2);font-weight:bold;border-left:3px solid #00e5ff;' : ''}">
                        <td style="padding:5px 4px;color:${isActive ? '#00ffaa' : (wpType === 'START' || wpType === 'DESTINATION' ? '#00ffaa' : '#00e5ff')};font-weight:bold;white-space:nowrap;">${wp.id} ${isActive ? '◀' : ''}</td>
                        <td style="padding:5px 4px;white-space:nowrap;">${wp.latitude.toFixed(4)}, ${wp.longitude.toFixed(4)}</td>
                        <td style="padding:5px 4px;white-space:nowrap;color:#00ffaa;">${wpBearing}</td>
                        <td style="padding:5px 4px;white-space:nowrap;">${wpDir}</td>
                        <td style="padding:5px 4px;white-space:nowrap;">${wpDist}</td>
                        <td style="padding:5px 4px;white-space:nowrap;color:rgba(255,255,255,0.7);font-size:8.5px;">${wpType}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
            
            <div id="waypoint-reason-box" style="margin-top:8px;padding:8px;background:rgba(0,229,255,0.05);border-left:3px solid #00ffaa;display:none;font-size:10px;">
              <strong style="color:#00ffaa;font-size:9px;letter-spacing:1px;display:block;margin-bottom:3px;">WAYPOINT INSPECTOR</strong>
              <div id="waypoint-reason-id" style="color:#fff;font-weight:bold;margin-bottom:2px;"></div>
              <div id="waypoint-reason-type" style="color:rgba(255,255,255,0.6);margin-bottom:4px;"></div>
              <div id="waypoint-metrics-detail" style="color:rgba(255,255,255,0.85);font-size:9.5px;margin-bottom:4px;line-height:1.4;"></div>
              <div id="waypoint-reason-text" style="color:#00e5ff;font-style:italic;"></div>
            </div>
          </div>
        `;
      }

      resultDisplay.innerHTML = `
        <div class="route-result-card maritime-card" style="background:rgba(8,16,28,0.95);border:1px solid rgba(0,229,255,0.35);padding:12px;border-radius:8px;font-family:sans-serif;color:#fff;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;width:100%;">

          <!-- Top row disclaimer -->
          <div style="font-size:10px;color:rgba(255,255,255,0.7);display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,229,255,0.15);padding-bottom:6px;">
            <span>ANTARIS Tactical Maritime Engine &bull; Selected Mode: <strong style="color:#00e5ff;">${currentMode.toUpperCase()}</strong></span>
            <span style="font-size:9px;color:rgba(0,229,255,0.8);font-family:monospace;">DATA ACTIVE</span>
          </div>

          <!-- BLOCK 1: WHY THIS ROUTE Box & Distance Summary -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:8px;font-size:10px;background:rgba(0,0,0,0.4);padding:8px 10px;border-radius:6px;border:1px solid rgba(0,229,255,0.2);">
            <div>
              <span style="color:rgba(255,255,255,0.5);font-size:8px;display:block;letter-spacing:0.5px;">SELECTED DISTANCE</span>
              <div style="font-size:15px;font-weight:bold;color:#00e5ff;">${m.distance_km} km</div>
            </div>
            <div>
              <span style="color:rgba(255,255,255,0.5);font-size:8px;display:block;letter-spacing:0.5px;">DIRECT BASELINE</span>
              <div style="font-size:13px;color:#fff;font-weight:bold;">${m.direct_distance_km} km ${m.detour_km > 0 ? `<span style="color:#ffcc00;font-size:9px;">(+${m.detour_km} km)</span>` : ''}</div>
            </div>
            <div>
              <span style="color:rgba(255,255,255,0.5);font-size:8px;display:block;letter-spacing:0.5px;">ICEBERG ZONES</span>
              <div style="font-size:12px;color:${m.iceberg_zones_crossed > 0 ? '#ff3366' : '#00ffaa'};font-weight:bold;">${m.iceberg_zones_crossed || 0} Crossed (${m.iceberg_zones_avoided || 0} Avoided)</div>
            </div>
          </div>

          <div class="route-reasoning-box" style="background:rgba(0,229,255,0.08);border-left:4px solid #00e5ff;padding:8px 10px;font-size:10px;line-height:1.45;color:rgba(255,255,255,0.95);border-radius:0 4px 4px 0;">
            <strong style="color:#00e5ff;display:block;margin-bottom:3px;font-size:9.5px;letter-spacing:1px;">WHY THIS ROUTE?</strong>
            <div>${m.why_this_route_reason || 'Direct geodesic path is clear of land and detected iceberg safety zones.'}</div>
          </div>

          <!-- BLOCK 2: MID ROW (Tactical Compass | Route Progress | Voyage Metrics) -->
          <div class="nav-metrics-row" style="display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:10px;align-items:stretch;">
            ${compassHtml}
            ${progressBarHtml}
            ${voyageMetricsGridHtml}
          </div>

          <!-- BLOCK 3: TARGET & COMPARISON ROW (Next Waypoint Target | Route Comparison) -->
          <div class="nextwp-comparison-row" style="display:grid;grid-template-columns:220px 1fr;gap:10px;align-items:stretch;">
            ${nextWpBoxHtml}
            ${alternativesHtml}
          </div>

          <!-- BLOCK 4: NAVIGATION WAYPOINTS TABLE -->
          ${waypointsListHtml}
        </div>
      `;

      // Wire up result mode buttons inside card
      const resModeBtns = resultDisplay.querySelectorAll('.result-mode-btn');
      resModeBtns.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          // Prefer the named user-mode (SHORTEST/SAFE/GENERAL); fall back to backend mode key
          const clickedUserMode = e.currentTarget.getAttribute('data-usermode') || e.currentTarget.getAttribute('data-mode');
          if (clickedUserMode) {
            selectedUserMode = clickedUserMode;
            const initialVal = initialInput?.value || planner.initialPinData;
            const finalVal = finalInput?.value || planner.finalPinData;
            const newRes = await planner.calculateRoute(initialVal, finalVal, clickedUserMode);
            updateResultUI(newRes);
          }
        });
      });

      // Wire up click on waypoint table rows to fly camera, show reason, and update tactical compass
      const wpRows = resultDisplay.querySelectorAll('.wp-row');
      const wpReasonBox = resultDisplay.querySelector('#waypoint-reason-box');
      const wpReasonId = resultDisplay.querySelector('#waypoint-reason-id');
      const wpReasonType = resultDisplay.querySelector('#waypoint-reason-type');
      const wpMetricsDetail = resultDisplay.querySelector('#waypoint-metrics-detail');
      const wpReasonText = resultDisplay.querySelector('#waypoint-reason-text');
      const compassNeedleGroup = resultDisplay.querySelector('#compass-needle-group');
      const readoutReqBearing = resultDisplay.querySelector('#readout-required-bearing');
      const readoutCompassDir = resultDisplay.querySelector('#readout-compass-dir');

      wpRows.forEach((row) => {
        row.addEventListener('click', (e) => {
          const lat = parseFloat(e.currentTarget.getAttribute('data-lat'));
          const lon = parseFloat(e.currentTarget.getAttribute('data-lon'));
          const wpId = e.currentTarget.getAttribute('data-id');
          const wpType = e.currentTarget.getAttribute('data-type');
          const wpReason = e.currentTarget.getAttribute('data-reason');
          const prevDist = e.currentTarget.getAttribute('data-prevdist');
          const nextDist = e.currentTarget.getAttribute('data-nextdist');
          const bearingVal = e.currentTarget.getAttribute('data-bearing');
          const compassVal = e.currentTarget.getAttribute('data-compass');
          const turnVal = e.currentTarget.getAttribute('data-turn');

          // Highlight active row
          wpRows.forEach((r) => r.style.background = '');
          e.currentTarget.style.background = 'rgba(0,229,255,0.2)';

          if (wpReasonBox) {
            wpReasonId.textContent = `WAYPOINT ${wpId} (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`;
            wpReasonType.textContent = 'TYPE: ' + wpType;
            
            let metricsStr = '';
            if (prevDist) metricsStr += `Dist Prev: ${prevDist} km | `;
            if (nextDist) metricsStr += `Dist Next: ${nextDist} km | `;
            if (bearingVal) metricsStr += `Bearing: ${bearingVal}° TRUE (${compassVal}) | `;
            if (turnVal) metricsStr += `Turn: ${turnVal}`;
            wpMetricsDetail.textContent = metricsStr;

            wpReasonText.textContent = wpReason;
            wpReasonBox.style.display = 'block';
          }

          // Update Tactical Compass to target selected waypoint
          if (bearingVal && compassNeedleGroup) {
            const bDegrees = parseFloat(bearingVal);
            if (Number.isFinite(bDegrees)) {
              compassNeedleGroup.style.transform = `rotate(${bDegrees}deg)`;
              if (readoutReqBearing) readoutReqBearing.textContent = `${bDegrees}° TRUE`;
              if (readoutCompassDir) readoutCompassDir.textContent = compassVal || 'N';
            }
          }

          if (planner.viewer && Number.isFinite(lat) && Number.isFinite(lon)) {
            planner.viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, 25000),
              duration: 1.5,
            });
          }
        });
      });
    } else {
      resultDisplay.innerHTML = `
        <div class="route-result-card" style="background:rgba(8,16,28,0.95);border:1px solid rgba(0,229,255,0.35);padding:12px;border-radius:8px;font-family:sans-serif;color:#fff;">
          <div class="route-result-section" style="margin-bottom:8px;">
            <span class="route-result-label" style="font-size:9px;color:rgba(255,255,255,0.5);display:block;">START PIN</span>
            <div class="route-result-val" style="font-size:12px;font-weight:bold;">${res.initial.label || formatPinLabel(res.initial.lat, res.initial.lon)}</div>
          </div>
          <div class="route-result-section" style="margin-bottom:8px;">
            <span class="route-result-label" style="font-size:9px;color:rgba(255,255,255,0.5);display:block;">DESTINATION PIN</span>
            <div class="route-result-val" style="font-size:12px;font-weight:bold;">${res.final.label || formatPinLabel(res.final.lat, res.final.lon)}</div>
          </div>
          <div class="route-result-section" style="margin-bottom:8px;">
            <span class="route-result-label" style="font-size:9px;color:rgba(255,255,255,0.5);display:block;">GEODESIC DISTANCE</span>
            <div class="route-result-val route-dist" style="font-size:15px;font-weight:bold;color:#00e5ff;">${res.distanceKm?.toLocaleString()} km</div>
          </div>
          <div class="route-result-section">
            <span class="route-result-label" style="font-size:9px;color:rgba(255,255,255,0.5);display:block;">ROUTE METHOD</span>
            <div class="route-result-val" style="font-size:11px;color:rgba(255,255,255,0.85);">Shortest Geodesic Path (Land/Direct Fallback)</div>
          </div>
        </div>
      `;
    }
  };

  const handleCalculate = async () => {
    const initialVal = initialInput?.value || planner.initialPinData;
    const finalVal = finalInput?.value || planner.finalPinData;

    const res = await planner.calculateRoute(initialVal, finalVal, selectedUserMode);
    updateResultUI(res);
  };

  const handleTogglePins = () => {
    if (planner.isPlacingPins) {
      planner.stopPinPlacement();
      if (placePinsBtn) {
        placePinsBtn.classList.remove('active');
        placePinsBtn.textContent = '📍 PLACE PINS';
      }
    } else {
      if (placePinsBtn) {
        placePinsBtn.classList.add('active');
        placePinsBtn.textContent = 'Click Globe (Initial Pin)...';
      }
      planner.startPinPlacement((type, pinData) => {
        if (type === 'initial') {
          if (initialInput) initialInput.value = formatPinLabel(pinData.lat, pinData.lon);
          if (placePinsBtn) placePinsBtn.textContent = 'Click Globe (Final Pin)...';
        } else if (type === 'final') {
          if (finalInput) finalInput.value = formatPinLabel(pinData.lat, pinData.lon);
          if (placePinsBtn) {
            placePinsBtn.classList.remove('active');
            placePinsBtn.textContent = '📍 PLACE PINS';
          }
          handleCalculate();
        }
      });
    }
  };

  const handleClear = () => {
    planner.clearAll();
    if (placePinsBtn) {
      placePinsBtn.classList.remove('active');
      placePinsBtn.textContent = '📍 PLACE PINS';
    }
    if (initialInput) initialInput.value = '';
    if (finalInput) finalInput.value = '';
    if (resultDisplay) resultDisplay.innerHTML = '';
  };

  if (calculateBtn) calculateBtn.addEventListener('click', handleCalculate);
  if (placePinsBtn) placePinsBtn.addEventListener('click', handleTogglePins);
  if (clearBtn) clearBtn.addEventListener('click', handleClear);

  const handleKeydown = (e) => {
    if (e.key === 'Enter') handleCalculate();
  };

  if (initialInput) initialInput.addEventListener('keydown', handleKeydown);
  if (finalInput) finalInput.addEventListener('keydown', handleKeydown);

  return planner;
}
