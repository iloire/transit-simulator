import { Road } from './road.js';
import { Vehicle } from './vehicle.js';
import { createBehavior, PRESETS } from './behavior.js';
import { weightedPick, randomBetween, vehicleColor } from './utils.js';

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

    // Separate truck speed limit (m/s), default 80 km/h
    this.truckSpeedLimit = config.truckSpeedLimit ?? (80 / 3.6);

    // Tunable event parameters
    this.events = {
      reactionJitter: 10,         // % variation in driver reaction time (+/-)
      rightOvertakeAllowed: false, // whether right-side overtaking is culturally normal
    };

    // Cultural politeness multiplier (0–1, applied on top of per-profile politeness)
    this.politenessFactor = config.politenessFactor ?? 1.0;

    // Behavior mix (weights, will be normalized)
    this.behaviorMix = {
      optimal: 40,
      laneCamper: 20,
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

  _pickBehavior(vehicleType) {
    const keys = Object.keys(this.behaviorMix);
    const weights = keys.map(k => {
      let w = this.behaviorMix[k];
      // Trucks are professional drivers — much less likely to be lane campers
      if (vehicleType === 'truck' && k === 'laneCamper') w *= 0.2;
      return w;
    });
    return weightedPick(keys, weights);
  }

  _pickVehicleType() {
    const keys = Object.keys(this.vehicleMix);
    const weights = keys.map(k => this.vehicleMix[k]);
    return weightedPick(keys, weights);
  }

  _spawnAt(x, lane) {
    const vehicleType = this._pickVehicleType();
    const behaviorKey = this._pickBehavior(vehicleType);
    const behavior = this._createBehavior(behaviorKey, vehicleType);

    // Trucks must spawn in allowed lanes
    if (behavior.maxLane !== null && lane < behavior.maxLane) {
      lane = behavior.maxLane;
    }

    const jitterPct = this.events.reactionJitter / 100;
    const v = new Vehicle(x, lane, behavior, this.road, jitterPct);
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

    // MOBIL lane changes — shuffle order to prevent systematic bias,
    // and update lane lookup after each change so vehicles don't pile into the same gap
    const shuffled = [...this.vehicles];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const v of shuffled) {
      const newLane = v.evaluateLaneChange(getLaneVehicles, this.events.rightOvertakeAllowed);
      if (newLane !== null) {
        v.startLaneChange(newLane);
        // Immediately register in target lane so next vehicles see the gap is taken
        if (laneLookup[newLane]) {
          laneLookup[newLane].push(v);
        }
      }
    }

    // IDM update — also compute left-lane speed limit to prevent right-overtaking
    for (const v of this.vehicles) {
      const leader = v._findLeader(v.effectiveLane, getLaneVehicles);
      let leftLaneSpeed = null;
      if (!this.events.rightOvertakeAllowed && v.effectiveLane > 0) {
        leftLaneSpeed = this._getNearbySpeeds(v, v.effectiveLane - 1, getLaneVehicles);
      }
      v.update(dt, leader, leftLaneSpeed);
    }

    // Cap vehicle count
    if (this.vehicles.length > 250) {
      this.vehicles.splice(250);
    }

    // Flow measurement — count vehicles crossing the measurement point
    for (const v of this.vehicles) {
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

  /** Get the minimum speed of nearby vehicles in a given lane (within ~60m) */
  _getNearbySpeeds(vehicle, lane, getLaneVehicles) {
    const vehicles = getLaneVehicles(lane);
    let minSpeed = Infinity;
    let found = false;
    for (const v of vehicles) {
      const distAhead = this.road.distAhead(vehicle.x, v.x);
      const absDist = Math.abs(distAhead);
      if (absDist < 60) {
        minSpeed = Math.min(minSpeed, v.v);
        found = true;
      }
    }
    return found ? minSpeed : null;
  }

  _updateStats() {
    this.stats.vehicleCount = this.vehicles.length;
    this.stats.avgSpeed = this.vehicles.length > 0
      ? this.vehicles.reduce((s, v) => s + v.v, 0) / this.vehicles.length * 3.6
      : 0;
    this.stats.density = this.vehicles.length / (this.road.roadLength / 1000);
  }

  /** Create a behavior with the current politeness factor applied */
  _createBehavior(presetKey, vehicleType) {
    const behavior = createBehavior(
      presetKey, vehicleType,
      this.road.speedLimit, this.road.laneCount, this.truckSpeedLimit
    );
    behavior.politeness *= this.politenessFactor;
    return behavior;
  }

  /** Recalculate desired speeds for all vehicles after speed limit change */
  updateVehicleSpeeds() {
    for (const v of this.vehicles) {
      const personalRatio = v.behavior.v0 > 0 ? v.personalV0 / v.behavior.v0 : 1;
      const newBehavior = this._createBehavior(v.behavior.presetKey, v.behavior.vehicleType);
      v.personalV0 = newBehavior.v0 * personalRatio;
      v.behavior = { ...newBehavior, v0: v.personalV0 };
    }
  }

  /** Reassign behaviors to existing vehicles to match current behavior mix */
  updateVehicleBehaviors() {
    for (const v of this.vehicles) {
      const newKey = this._pickBehavior(v.type);
      if (newKey === v.behavior.presetKey) continue;

      const personalRatio = v.behavior.v0 > 0 ? v.personalV0 / v.behavior.v0 : 1;
      const newBehavior = this._createBehavior(newKey, v.type);
      v.personalV0 = newBehavior.v0 * personalRatio;
      v.behavior = { ...newBehavior, v0: v.personalV0 };
      v.color = vehicleColor(v.type, newKey);
      v.reactionJitter = randomBetween(
        1 - this.events.reactionJitter / 100,
        1 + this.events.reactionJitter / 100
      );
    }
  }

  /** Update politeness for all existing vehicles */
  updatePoliteness() {
    for (const v of this.vehicles) {
      const baseBehavior = createBehavior(
        v.behavior.presetKey, v.behavior.vehicleType,
        this.road.speedLimit, this.road.laneCount, this.truckSpeedLimit
      );
      v.behavior.politeness = baseBehavior.politeness * this.politenessFactor;
    }
  }

  reset() {
    this.vehicles = [];
    this.time = 0;
    this.spawnTimer = 0;
    this._flowCounter = 0;
    this._flowTimer = 0;
    this._seed();
  }
}
