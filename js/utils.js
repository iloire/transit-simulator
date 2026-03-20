export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

/** Poisson-distributed random number (Knuth algorithm) */
export function randomPoisson(lambda) {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/** Pick from array with weights */
export function weightedPick(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Generate a vehicle color based on driver behavior.
 * Each behavior has a base hue; vehicle type shifts lightness.
 * Slight random variation keeps it from looking flat.
 */
// Base HSL per behavior: [hue, saturation]
const BEHAVIOR_HSL = {
  optimal:    [140, 65],  // green
  laneCamper: [36,  80],  // orange/amber
  aggressive: [0,   75],  // red
  cautious:   [210, 70],  // blue
};

// Vehicle type lightness ranges: [min, max]
const TYPE_LIGHTNESS = {
  car:       [40, 55],
  truck:     [28, 38],
  motorbike: [55, 68],
};

export function vehicleColor(vehicleType, behaviorKey) {
  const [h, s] = BEHAVIOR_HSL[behaviorKey] || [0, 0];
  const [lMin, lMax] = TYPE_LIGHTNESS[vehicleType] || [40, 55];
  // Add slight hue and lightness jitter for variety
  const hJitter = randomBetween(-12, 12);
  const l = randomBetween(lMin, lMax);
  return `hsl(${Math.round(h + hJitter)}, ${s}%, ${Math.round(l)}%)`;
}

let _nextId = 0;
export function nextId() {
  return _nextId++;
}
