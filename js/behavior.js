/**
 * Behavior profiles for IDM + MOBIL parameters.
 *
 * IDM params: v0 (desired speed m/s), T (time headway s), aMax (max accel m/s²),
 *             b (comfort decel m/s²), s0 (min gap m), delta (accel exponent)
 *
 * MOBIL params: politeness, aThreshold (min incentive to change lane),
 *               bSafe (max safe braking for new follower)
 *
 * Lane preference: null | 'left' | 'right', with bias strength
 */

export const PRESETS = {
  optimal: {
    name: 'Optimal',
    v0Factor: 1.0,
    T: 1.2,
    aMax: 1.5,
    b: 2.0,
    s0: 3,
    delta: 4,
    politeness: 0.3,
    aThreshold: 0.2,
    bSafe: 4.0,
    lanePreference: 'right',
    laneBias: 1.2,
  },
  laneCamper: {
    name: 'Lane Camper',
    v0Factor: 0.9,
    T: 1.5,
    aMax: 1.2,
    b: 1.5,
    s0: 4,
    delta: 4,
    politeness: 0.5,
    aThreshold: 1.5,
    bSafe: 4.0,
    lanePreference: 'left',
    laneBias: 2.0,
  },
  aggressive: {
    name: 'Aggressive',
    v0Factor: 1.2,
    T: 0.5,
    aMax: 2.5,
    b: 3.5,
    s0: 1.5,
    delta: 4,
    politeness: 0.0,
    aThreshold: 0.05,
    bSafe: 8.0,
    lanePreference: null,
    laneBias: 0,
  },
  cautious: {
    name: 'Cautious',
    v0Factor: 0.85,
    T: 2.5,
    aMax: 0.8,
    b: 1.0,
    s0: 6,
    delta: 4,
    politeness: 0.8,
    aThreshold: 0.8,
    bSafe: 2.0,
    lanePreference: 'right',
    laneBias: 1.5,
  },
};

/** Vehicle type physical modifiers */
export const VEHICLE_TYPES = {
  car: {
    length: 4.5,   // meters
    width: 2.0,
    aMaxMul: 1.0,
    v0Mul: 1.0,
    canLaneSplit: false,
  },
  truck: {
    length: 10,
    width: 2.5,
    aMaxMul: 0.5,
    v0Mul: 0.75,
    canLaneSplit: false,
  },
  motorbike: {
    length: 2.2,
    width: 0.8,
    aMaxMul: 1.6,
    v0Mul: 1.1,
    canLaneSplit: true,
  },
};

/**
 * @param {number} laneCount - total lanes on the road, used for truck lane restriction
 * @param {number} truckSpeedLimit - separate speed limit for trucks (m/s), defaults to 80 km/h
 */
export function createBehavior(presetKey, vehicleType, speedLimit, laneCount = 3, truckSpeedLimit = 22.2) {
  const preset = PRESETS[presetKey];
  const vType = VEHICLE_TYPES[vehicleType];

  // Trucks use their own (lower) speed limit
  const effectiveSpeedLimit = vehicleType === 'truck' ? truckSpeedLimit : speedLimit;

  // Truck lane restriction: can only use rightmost lanes
  // Aggressive trucks may use one more lane to the left
  let maxLane = null; // null = no restriction
  if (vehicleType === 'truck' && laneCount > 2) {
    // Trucks restricted to right half of road (lane 0 = leftmost)
    // On 3 lanes: can use lanes 1-2 (right two), aggressive can use 0-2
    // On 4 lanes: can use lanes 2-3, aggressive can use 1-3
    // On 5 lanes: can use lanes 3-4, aggressive can use 2-4
    const rightLanes = Math.max(2, Math.ceil(laneCount / 2));
    const minAllowedLane = laneCount - rightLanes;
    // Aggressive trucks get one extra lane left, but never the leftmost (fast lane)
    maxLane = presetKey === 'aggressive' ? Math.max(1, minAllowedLane - 1) : minAllowedLane;
  }

  return {
    presetKey,
    vehicleType,
    v0: effectiveSpeedLimit * preset.v0Factor * vType.v0Mul,
    T: preset.T,
    aMax: preset.aMax * vType.aMaxMul,
    b: preset.b,
    s0: preset.s0,
    delta: preset.delta,
    politeness: preset.politeness,
    aThreshold: preset.aThreshold,
    bSafe: preset.bSafe,
    lanePreference: preset.lanePreference,
    laneBias: preset.laneBias,
    length: vType.length,
    width: vType.width,
    canLaneSplit: vType.canLaneSplit,
    maxLane,  // minimum lane index truck can use (null = no restriction)
  };
}
