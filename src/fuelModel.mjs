/**
 * ANTARIS Maritime Vessel Fuel Consumption Model
 *
 * Provides configurable vessel fuel consumption calculations based on speed, distance,
 * engine rating, and vessel profiles.
 *
 * Features:
 * - Pre-configured vessel profiles (Polar Research Icebreaker, Supply Vessel, Cargo Ship, Custom)
 * - Time-based (L/h) and distance-based (L/100km) fuel estimation models
 * - Explicit estimation labeling (isEstimated: true)
 * - Safe fallback handling (returns status: 'UNAVAILABLE' if parameters are disabled/invalid)
 */

export const VESSEL_PROFILES = Object.freeze({
  polar_icebreaker: Object.freeze({
    id: 'polar_icebreaker',
    name: 'Polar Research Icebreaker',
    cruiseSpeedKnots: 18.0,
    fuelRateLitersPerHour: 1200.0,
    fuelType: 'Marine Gas Oil (MGO)',
    enginePowerKw: 15000,
    displacementTons: 12500,
  }),
  supply_vessel: Object.freeze({
    id: 'supply_vessel',
    name: 'Polar Supply Vessel',
    cruiseSpeedKnots: 14.0,
    fuelRateLitersPerHour: 750.0,
    fuelType: 'Marine Gas Oil (MGO)',
    enginePowerKw: 8500,
    displacementTons: 8000,
  }),
  cargo_ship: Object.freeze({
    id: 'cargo_ship',
    name: 'Ice-Class Cargo Ship',
    cruiseSpeedKnots: 12.0,
    fuelRateLitersPerHour: 550.0,
    fuelType: 'Heavy Fuel Oil (HFO)',
    enginePowerKw: 6000,
    displacementTons: 18000,
  }),
});

/** Default active vessel profile */
export const DEFAULT_VESSEL_PROFILE = VESSEL_PROFILES.polar_icebreaker;

/**
 * Calculate estimated fuel consumption for a route.
 * @param {number} distanceKm - Total route distance in kilometers
 * @param {number} [speedKnots] - Vessel speed in knots
 * @param {object|null} [vesselProfile] - Custom or standard vessel profile
 * @returns {object} Calculated fuel metrics or UNAVAILABLE status
 */
export function calculateFuelConsumption(distanceKm, speedKnots = null, vesselProfile = null) {
  const dist = Number(distanceKm);
  if (!Number.isFinite(dist) || dist <= 0) {
    return {
      status: 'UNAVAILABLE',
      reason: 'Invalid or zero distance provided',
      estimatedFuelLiters: null,
      fuelRateLitersPerHour: null,
      estimatedTravelTimeHours: null,
      fuelPer100Km: null,
      formattedFuelText: 'FUEL UNAVAILABLE',
      isEstimated: false,
    };
  }

  const profile = vesselProfile || DEFAULT_VESSEL_PROFILE;

  if (vesselProfile === false || vesselProfile === 'disabled') {
    return {
      status: 'UNAVAILABLE',
      reason: 'Vessel fuel configuration disabled',
      estimatedFuelLiters: null,
      fuelRateLitersPerHour: null,
      estimatedTravelTimeHours: null,
      fuelPer100Km: null,
      formattedFuelText: 'FUEL UNAVAILABLE',
      isEstimated: false,
    };
  }

  const speed = (speedKnots !== null && speedKnots !== undefined && Number.isFinite(Number(speedKnots)) && Number(speedKnots) > 0.1)
    ? Number(speedKnots)
    : (profile.cruiseSpeedKnots || 18.0);

  const fuelRateLph = profile.fuelRateLitersPerHour || 1200.0;
  const speedKmh = speed * 1.852;
  const travelTimeHours = dist / speedKmh;
  const fuelLiters = travelTimeHours * fuelRateLph;
  const fuelPer100Km = (fuelLiters / dist) * 100;

  return {
    status: 'ESTIMATED',
    isEstimated: true,
    vesselType: profile.name || 'Polar Vessel',
    fuelType: profile.fuelType || 'Marine Gas Oil',
    distanceKm: Math.round(dist * 10) / 10,
    speedKnots: Math.round(speed * 10) / 10,
    fuelRateLitersPerHour: Math.round(fuelRateLph),
    estimatedTravelTimeHours: Math.round(travelTimeHours * 10) / 10,
    estimatedFuelLiters: Math.round(fuelLiters),
    fuelPer100Km: Math.round(fuelPer100Km * 10) / 10,
    formattedFuelText: `${Math.round(fuelLiters).toLocaleString()} L (Est.)`,
    formattedFuelRateText: `${Math.round(fuelRateLph)} L/h`,
    formattedPer100KmText: `${Math.round(fuelPer100Km * 10) / 10} L/100km`,
  };
}
