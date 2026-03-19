import { Road } from './road.js';
import { Vehicle } from './vehicle.js';
import { createBehavior, PRESETS } from './behavior.js';
import { weightedPick, randomBetween } from './utils.js';

export class Simulation {
  constructor(config = {}) {
    this.road = new Road({
      laneCount: config.laneCount ?? 3,
      speedLimit: config.speedLimit ?? 22.2,
      roadLength: config.roadLength ?? 600,
    });

    this.vehicles = [];
    this.time = 0;
    this.spawnTimer = 0;
    this.paused = false;

    // Vehicles per second spawn rate
    this.spawnRate = config.spawnRate ?? 1.5;

    // Behavior mix (weights, will be normalized)
    this.behaviorMix = {
      optimal: 40,
      centerHog: 20,
      aggressive: 25,
      cautious: 15,
    };

    // Vehicle type mix
    this.vehicleMix = {
      car: 60,
      truck: 25,
      motorbike: 15,
    };

    // Stats
    this.stats = {
      flowRate: 0,
      avgSpeed: 0,
      accidentCount: 0,
      totalAccidents: 0,
      vehicleCount: 0,
      density: 0,
    };

    // Flow measurement
    this._flowCounter = 0;
    this._flowTimer = 0;
    this._flowMeasurePoint = this.road.roadLength / 2;

    // Pre-populate
    this._seed();
  }

  _seed() {
    const count = Math.floor(this.road.roadLength / 30) * this.road.laneCount;
    for (let i = 0; i < count; i++) {
      const lane = i % this.road.laneCount;
      const spacing = this.road.roadLength / Math.ceil(count / this.road.laneCount);
      const x = (Math.floor(i / this.road.laneCount) * spacing + randomBetween(-5, 5) + this.road.roadLength) % this.road.roadLength;
      this._spawnAt(x, lane);
    }
  }

  _pickBehavior() {
    const keys = Object.keys(this.behaviorMix);
    const weights = keys.map(k => this.behaviorMix[k]);
    return weightedPick(keys, weights);
  }

  _pickVehicleType() {
    const keys = Object.keys(this.vehicleMix);
    const weights = keys.map(k => this.vehicleMix[k]);
    return weightedPick(keys, weights);
  }

  _spawnAt(x, lane) {
    const behaviorKey = this._pickBehavior();
    const vehicleType = this._pickVehicleType();
    const behavior = createBehavior(behaviorKey, vehicleType, this.road.speedLimit);
    const v = new Vehicle(x, lane, behavior, this.road);
    this.vehicles.push(v);
    return v;
  }

  _spawnVehicle() {
    // Pick a random lane, find a gap at the spawn region (x ≈ 0)
    const lane = Math.floor(Math.random() * this.road.laneCount);
    const spawnX = randomBetween(0, 20);

    // Check if there's room
    const laneVehicles = this.vehicles.filter(v => v.effectiveLane === lane);
    const tooClose = laneVehicles.some(v => {
      const dist = Math.abs(this.road.distAhead(spawnX, v.x));
      return dist < 20;
    });

    if (!tooClose) {
      this._spawnAt(spawnX, lane);
    }
  }

  /** Get all vehicles in a given lane (including those transitioning into it) */
  getLaneVehicles(lane) {
    return this.vehicles.filter(v => {
      if (v.lane === lane) return true;
      if (v.targetLane === lane && v.laneProgress > 0.3) return true;
      return false;
    });
  }

  tick(dt) {
    if (this.paused) return;
    if (dt > 0.1) dt = 0.1; // cap for stability

    this.time += dt;

    // Spawn
    this.spawnTimer += dt;
    const spawnInterval = 1 / this.spawnRate;
    while (this.spawnTimer >= spawnInterval) {
      this.spawnTimer -= spawnInterval;
      this._spawnVehicle();
    }

    // Build lane lookup
    const laneLookup = new Array(this.road.laneCount);
    for (let i = 0; i < this.road.laneCount; i++) {
      laneLookup[i] = [];
    }
    for (const v of this.vehicles) {
      laneLookup[v.lane].push(v);
      if (v.targetLane !== v.lane && v.laneProgress > 0.3) {
        laneLookup[v.targetLane].push(v);
      }
    }

    const getLaneVehicles = (lane) => laneLookup[lane] || [];

    // MOBIL lane changes
    for (const v of this.vehicles) {
      if (v.crashed) continue;
      const newLane = v.evaluateLaneChange(getLaneVehicles);
      if (newLane !== null) {
        v.startLaneChange(newLane);
      }
    }

    // IDM update
    for (const v of this.vehicles) {
      const leader = v._findLeader(v.effectiveLane, getLaneVehicles);
      v.update(dt, leader);
    }

    // Collision detection
    this._detectCollisions();

    // Remove cleared crashes
    this.vehicles = this.vehicles.filter(v => {
      if (v.crashed && v.crashTimer > v.crashDuration) return false;
      return true;
    });

    // Cap vehicle count
    if (this.vehicles.length > 250) {
      // Remove vehicles furthest from camera (just oldest non-crashed)
      this.vehicles.splice(250);
    }

    // Flow measurement — count vehicles crossing the measurement point
    for (const v of this.vehicles) {
      if (v.crashed) continue;
      const prevX = this.road.wrapX(v.x - v.v * dt);
      const mp = this._flowMeasurePoint;
      // Check if vehicle crossed the measurement point this tick (handling wrap)
      const crossedForward = (prevX < mp && v.x >= mp)
        || (prevX > mp + this.road.roadLength / 2 && v.x < mp); // wrapped
      if (crossedForward) this._flowCounter++;
    }
    this._flowTimer += dt;
    if (this._flowTimer >= 5) {
      this.stats.flowRate = Math.round((this._flowCounter / this._flowTimer) * 3600);
      this._flowCounter = 0;
      this._flowTimer = 0;
    }

    // Update stats
    this._updateStats();
  }

  _detectCollisions() {
    for (let i = 0; i < this.vehicles.length; i++) {
      const a = this.vehicles[i];
      if (a.crashed) continue;

      for (let j = i + 1; j < this.vehicles.length; j++) {
        const b = this.vehicles[j];
        if (b.crashed) continue;

        // Must be in overlapping lanes
        const sameLane = a.effectiveLane === b.effectiveLane
          || (a.lane !== a.targetLane && (a.lane === b.effectiveLane || a.targetLane === b.effectiveLane))
          || (b.lane !== b.targetLane && (b.lane === a.effectiveLane || b.targetLane === a.effectiveLane));

        if (!sameLane) continue;

        const dist = Math.abs(this.road.distAhead(a.x, b.x));
        const minDist = (a.length + b.length) / 2 * 0.7;

        if (dist < minDist) {
          const speedDiff = Math.abs(a.v - b.v);
          if (speedDiff > 2) {
            a.crashed = true;
            b.crashed = true;
            a.v = 0;
            b.v = 0;
            this.stats.totalAccidents++;
          }
        }
      }
    }
  }

  _updateStats() {
    const active = this.vehicles.filter(v => !v.crashed);
    this.stats.vehicleCount = this.vehicles.length;
    this.stats.accidentCount = this.vehicles.filter(v => v.crashed).length;
    this.stats.avgSpeed = active.length > 0
      ? active.reduce((s, v) => s + v.v, 0) / active.length * 3.6 // m/s to km/h
      : 0;
    this.stats.density = this.vehicles.length / (this.road.roadLength / 1000); // vehicles per km
  }

  reset() {
    this.vehicles = [];
    this.time = 0;
    this.spawnTimer = 0;
    this.stats.totalAccidents = 0;
    this._flowCounter = 0;
    this._flowTimer = 0;
    this._seed();
  }
}
