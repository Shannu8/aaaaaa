/**
 * ANTARIS Live Voyage Guidance & Navigation Engine
 *
 * Calculates real-time navigational metrics for following planned maritime routes:
 * - Waypoint sequence progress & arrival radius detection
 * - True bearings (° TRUE) & 16-wind compass directions
 * - Smallest signed heading error correction [-180°, +180°]
 * - Cross-track perpendicular error distance & deviation status
 * - Distance remaining & speed-based ETA estimation
 */

import {
  geodesicDistanceKm,
  calculateBearing,
  bearingToCompassDirection,
  calculateHeadingDifference,
  calculateCrossTrackDistance,
  calculateETA,
} from './geoMath.mjs';

/** Default arrival radius in kilometers for automatically advancing to next waypoint (~2.7 NM) */
export const DEFAULT_WAYPOINT_ARRIVAL_RADIUS_KM = 5.0;

/**
 * Calculate comprehensive voyage guidance metrics for a planned route.
 * @param {object} routeData - Canonical route object from calculateMaritimeRoute
 * @param {object|null} vesselState - Optional vessel position { latitude, longitude, heading, speedKnots }
 * @param {object} [options]
 * @returns {object} Voyage guidance status & navigation parameters
 */
export function calculateVoyageGuidance(routeData, vesselState = null, options = {}) {
  const arrivalRadiusKm = options.arrivalRadiusKm || DEFAULT_WAYPOINT_ARRIVAL_RADIUS_KM;
  const plannedSpeedKnots = options.plannedSpeedKnots || 18.0; // 18 knots default cruising speed

  if (!routeData || !Array.isArray(routeData.waypoints) || routeData.waypoints.length === 0) {
    return {
      active: false,
      reason: 'No active maritime route available',
    };
  }

  const waypoints = routeData.waypoints;
  const segments = routeData.segments || [];

  // Determine current vessel position (from live AIS or initial route waypoint)
  const hasVesselPosition = Boolean(
    vesselState &&
    Number.isFinite(Number(vesselState.latitude)) &&
    Number.isFinite(Number(vesselState.longitude))
  );

  const vesselLat = hasVesselPosition ? Number(vesselState.latitude) : waypoints[0].latitude;
  const vesselLon = hasVesselPosition ? Number(vesselState.longitude) : waypoints[0].longitude;

  const vesselHeading = (hasVesselPosition && Number.isFinite(Number(vesselState.heading)))
    ? Number(vesselState.heading)
    : null;

  const vesselSpeed = (hasVesselPosition && Number.isFinite(Number(vesselState.speedKnots)))
    ? Number(vesselState.speedKnots)
    : plannedSpeedKnots;

  // 1. DETERMINE NEXT WAYPOINT PROGRESSION
  let nextWpIdx = 1;
  if (options.targetWaypointIndex !== undefined && options.targetWaypointIndex !== null && options.targetWaypointIndex >= 0 && options.targetWaypointIndex < waypoints.length) {
    nextWpIdx = options.targetWaypointIndex;
  } else {
    let minDistToWp = Infinity;
    // Search waypoint sequence for current target waypoint
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const prevWp = waypoints[i - 1];
      const distToWp = geodesicDistanceKm(vesselLat, vesselLon, wp.latitude, wp.longitude);

      if (distToWp < minDistToWp) {
        minDistToWp = distToWp;
        nextWpIdx = i;
      }

      // Check if vessel has entered arrival radius of previous waypoint
      const distToPrev = geodesicDistanceKm(vesselLat, vesselLon, prevWp.latitude, prevWp.longitude);
      if (distToPrev <= arrivalRadiusKm && i < waypoints.length) {
        nextWpIdx = Math.min(waypoints.length - 1, i);
      }
    }
  }

  const nextWaypoint = waypoints[nextWpIdx];
  const prevWaypoint = waypoints[Math.max(0, nextWpIdx - 1)];

  // 2. CALCULATE BEARING & COMPASS DIRECTION TO NEXT WAYPOINT
  const requiredBearing = calculateBearing(vesselLat, vesselLon, nextWaypoint.latitude, nextWaypoint.longitude);
  const compassDir = bearingToCompassDirection(requiredBearing);

  // 3. CALCULATE DISTANCES
  const distanceToNextKm = Math.round(geodesicDistanceKm(vesselLat, vesselLon, nextWaypoint.latitude, nextWaypoint.longitude) * 10) / 10;

  // Remaining route distance from next waypoint to destination + distance to next waypoint
  let remainingRouteKm = distanceToNextKm;
  for (let i = nextWpIdx; i < waypoints.length - 1; i++) {
    remainingRouteKm += geodesicDistanceKm(waypoints[i].latitude, waypoints[i].longitude, waypoints[i + 1].latitude, waypoints[i + 1].longitude);
  }
  remainingRouteKm = Math.round(remainingRouteKm * 10) / 10;

  // 4. HEADING CORRECTION
  const headingCorrection = vesselHeading !== null
    ? calculateHeadingDifference(vesselHeading, requiredBearing)
    : null;

  // 5. CROSS-TRACK ERROR & STATUS
  let crossTrackErrorKm = null;
  let crossTrackStatus = 'ON_TRACK';

  if (hasVesselPosition && prevWaypoint && nextWaypoint && prevWaypoint.id !== nextWaypoint.id) {
    crossTrackErrorKm = calculateCrossTrackDistance(
      vesselLat, vesselLon,
      prevWaypoint.latitude, prevWaypoint.longitude,
      nextWaypoint.latitude, nextWaypoint.longitude
    );

    if (crossTrackErrorKm > 10.0) {
      crossTrackStatus = 'SIGNIFICANT_DEVIATION';
    } else if (crossTrackErrorKm > 3.0) {
      crossTrackStatus = 'SLIGHT_DEVIATION';
    } else {
      crossTrackStatus = 'ON_TRACK';
    }
  }

  // 6. ETA ESTIMATION
  const etaInfo = calculateETA(remainingRouteKm, vesselSpeed);

  // 7. ROUTE STATUS CLASSIFICATION (PLANNED, NAVIGATING, OFF_ROUTE, ARRIVED)
  const destWp = waypoints[waypoints.length - 1];
  const distToDest = geodesicDistanceKm(vesselLat, vesselLon, destWp.latitude, destWp.longitude);

  let routeStatus = 'PLANNED';
  if (distToDest <= arrivalRadiusKm) {
    routeStatus = 'ARRIVED';
  } else if (!hasVesselPosition) {
    routeStatus = 'PLANNED';
  } else if (crossTrackStatus === 'SIGNIFICANT_DEVIATION') {
    routeStatus = 'OFF_ROUTE';
  } else {
    routeStatus = 'NAVIGATING';
  }

  const fuelInfo = routeData.metrics?.fuel || routeData.fuel || null;

  return {
    active: true,
    hasVesselPosition,
    vesselPosition: { latitude: vesselLat, longitude: vesselLon },
    vesselHeading,
    vesselSpeedKnots: vesselSpeed,
    nextWaypointIndex: nextWpIdx,
    nextWaypoint: {
      id: nextWaypoint.id,
      sequence: nextWaypoint.sequence,
      latitude: nextWaypoint.latitude,
      longitude: nextWaypoint.longitude,
      sea_ice_concentration: nextWaypoint.sea_ice_concentration,
      type: nextWaypoint.type,
      routing_reason: nextWaypoint.routing_reason || 'Course waypoint',
    },
    requiredBearingDegrees: requiredBearing,
    compassDirection: compassDir,
    distanceToNextKm,
    distanceRemainingKm: remainingRouteKm,
    totalDistanceKm: routeData.metrics?.distance_km || 0,
    headingErrorDegrees: headingCorrection,
    crossTrackErrorKm,
    crossTrackStatus,
    eta: etaInfo,
    fuel: fuelInfo,
    routeStatus,
    whyThisRouteReason: routeData.metrics?.why_this_route_reason || routeData.whyThisRouteReason || '',
  };
}
