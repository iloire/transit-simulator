/**
 * Behavior profiles for IDM + MOBIL parameters.
 *
 * IDM params: v0 (desired speed m/s), T (time headway s), aMax (max accel m/s²),
 *             b (comfort decel m/s²), s0 (min gap m), delta (accel exponent)
 *
 * MOBIL params: politeness, aThreshold (min incentive to change lane),
 *               bSafe (max safe braking for new follower)
 *
 * Lane preference: null | 'center' | 'right', with bias strength
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
    lanePreference: null,
    laneBias: 0,
  },
  centerHog: {
    name: 'Center Hog',
    v0Factor: 0.9,
    T: 1.5,
    aMax: 1.2,
    b: 1.5,
    s0: 4,
    delta: 4,
    politeness: 0.5,
    aThreshold: 1.5,
    bSafe: 4.0,
    lanePreference: 'center',
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
    laneBias: 0.8,
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

export function createBehavior(presetKey, vehicleType, speedLimit) {
  const preset = PRESETS[presetKey];
  const vType = VEHICLE_TYPES[vehicleType];

  return {
    presetKey,
    vehicleType,
    v0: speedLimit * preset.v0Factor * vType.v0Mul,
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
  };
}
