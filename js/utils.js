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

/** Generate a vehicle color from a curated palette */
const CAR_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#ecf0f1', '#34495e', '#c0392b',
  '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#16a085',
  '#d35400', '#bdc3c7', '#7f8c8d', '#c23616', '#0097e6',
];

const TRUCK_COLORS = [
  '#2c3e50', '#4a6741', '#5d4e37', '#3d3d6b', '#6b3d3d',
  '#4a4a4a', '#2d4a2d', '#4a3d2d', '#2d3d4a', '#5a4a3a',
];

const BIKE_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b',
  '#ff6348', '#ffa502', '#2ed573', '#1e90ff', '#ff4757',
];

export function vehicleColor(type) {
  if (type === 'truck') return TRUCK_COLORS[randomInt(0, TRUCK_COLORS.length - 1)];
  if (type === 'motorbike') return BIKE_COLORS[randomInt(0, BIKE_COLORS.length - 1)];
  return CAR_COLORS[randomInt(0, CAR_COLORS.length - 1)];
}

let _nextId = 0;
export function nextId() {
  return _nextId++;
}
