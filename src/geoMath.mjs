/**
 * GeoMath utility module for pure geometric and geodesic math calculations.
 * Safe to import in both Node.js backends and browser frontends.
 */

/**
 * Calculate Great-Circle / Geodesic distance in km between two lat/lon points.
 */
export function geodesicDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088; // Earth mean radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

/**
 * Calculate initial True geographic bearing from point 1 (lat1, lon1) to point 2 (lat2, lon2) in degrees [0, 360).
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  let theta = (Math.atan2(y, x) * 180) / Math.PI;
  theta = (theta + 360) % 360;
  return Math.round(theta * 10) / 10;
}

/**
 * Convert a true bearing angle in degrees into a 16-wind compass rose direction label.
 */
export function bearingToCompassDirection(bearing) {
  const b = (Number(bearing) % 360 + 360) % 360;
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.floor((b + 11.25) / 22.5) % 16;
  return directions[index];
}

/**
 * Calculate the smallest signed angular heading error/correction between current heading and required bearing on [-180, +180].
 */
export function calculateHeadingDifference(currentHeading, targetBearing) {
  const cur = (Number(currentHeading) % 360 + 360) % 360;
  const tgt = (Number(targetBearing) % 360 + 360) % 360;
  let diff = ((tgt - cur + 540) % 360) - 180;
  return Math.round(diff * 10) / 10;
}

/**
 * Calculate cross-track perpendicular distance offset in kilometers from planned segment (segLat1, segLon1) -> (segLat2, segLon2).
 */
export function calculateCrossTrackDistance(vesselLat, vesselLon, segLat1, segLon1, segLat2, segLon2) {
  const R = 6371.0088;
  const d13 = geodesicDistanceKm(segLat1, segLon1, vesselLat, vesselLon) / R;
  const theta13 = (calculateBearing(segLat1, segLon1, vesselLat, vesselLon) * Math.PI) / 180;
  const theta12 = (calculateBearing(segLat1, segLon1, segLat2, segLon2) * Math.PI) / 180;

  const xt = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12)) * R;
  return Math.round(Math.abs(xt) * 10) / 10;
}

/**
 * Calculate estimated arrival time (ETA) based on remaining distance in km and vessel speed in knots.
 */
export function calculateETA(distanceRemainingKm, speedKnots) {
  const spd = Number(speedKnots);
  if (!Number.isFinite(spd) || spd <= 0.1) {
    return {
      hoursRemaining: null,
      etaTimestamp: null,
      formattedDuration: 'Unknown (0 kn)',
      formattedEtaTime: 'Speed required for ETA',
    };
  }
  const speedKmh = spd * 1.852;
  const hours = distanceRemainingKm / speedKmh;
  const etaDate = new Date(Date.now() + hours * 3600 * 1000);

  const hrsInt = Math.floor(hours);
  const minsInt = Math.round((hours - hrsInt) * 60);

  return {
    hoursRemaining: Math.round(hours * 10) / 10,
    etaTimestamp: etaDate.toISOString(),
    formattedDuration: `${hrsInt}h ${minsInt}m`,
    formattedEtaTime: etaDate.toUTCString().replace('GMT', 'UTC'),
  };
}
