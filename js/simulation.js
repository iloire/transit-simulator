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

    // Separate truck speed limit (m/s), default 80 km/h
    this.truckSpeedLimit = config.truckSpeedLimit ?? (80 / 3.6);

    // Tunable event parameters
    this.events = {
      crashSpeedThreshold: 25,    // km/h — min speed diff to trigger crash
      crashRate: 5,               // crashes per 1,000 dangerous encounters (0.5% per encounter)
      crashClearMin: 8,           // seconds — min time to clear a crash
      crashClearMax: 20,          // seconds — max time to clear a crash
      lateralTolerance: 0.8,      // multiplier on combined width for lateral overlap
      longitudinalTolerance: 0.4, // multiplier on combined length for longitudinal overlap
      reactionJitter: 10,         // % variation in driver reaction time (+/-)
      breakdownChance: 0,         // per-vehicle-per-minute chance of random breakdown (%)
      rightOvertakeAllowed: false, // whether right-side overtaking is culturally normal
    };

    // Track active dangerous encounters so we only roll once per pair
    this._activeEncounters = new Set();

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
    const behavior = createBehavior(
      behaviorKey, vehicleType, this.road.speedLimit,
      this.road.laneCount, this.truckSpeedLimit
    );

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

    // MOBIL lane changes
    for (const v of this.vehicles) {
      if (v.crashed) continue;
      const newLane = v.evaluateLaneChange(getLaneVehicles, this.events.rightOvertakeAllowed);
      if (newLane !== null) {
        v.startLaneChange(newLane);
      }
    }

    // IDM update — also compute left-lane speed limit to prevent right-overtaking
    for (const v of this.vehicles) {
      const leader = v._findLeader(v.effectiveLane, getLaneVehicles);
      let leftLaneSpeed = null;
      if (!this.events.rightOvertakeAllowed && v.effectiveLane > 0 && !v.crashed) {
        leftLaneSpeed = this._getNearbySpeeds(v, v.effectiveLane - 1, getLaneVehicles);
      }
      v.update(dt, leader, leftLaneSpeed);
    }

    // Collision detection
    this._detectCollisions();

    // Random breakdowns
    this._processBreakdowns(dt);

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
    const { crashSpeedThreshold, crashRate, lateralTolerance, longitudinalTolerance } = this.events;
    const currentEncounters = new Set();

    for (let i = 0; i < this.vehicles.length; i++) {
      const a = this.vehicles[i];
      if (a.crashed) continue;

      for (let j = i + 1; j < this.vehicles.length; j++) {
        const b = this.vehicles[j];
        if (b.crashed) continue;

        // Check lateral overlap using actual Y positions
        const lateralDist = Math.abs(a.effectiveY - b.effectiveY);
        const lateralThreshold = (a.width + b.width) / 2 * lateralTolerance;
        if (lateralDist > lateralThreshold) continue;

        // Longitudinal overlap
        const dist = Math.abs(this.road.distAhead(a.x, b.x));
        const longThreshold = (a.length + b.length) / 2 * longitudinalTolerance;
        if (dist > longThreshold) continue;

        // Speed differential check
        const speedDiff = Math.abs(a.v - b.v);
        if (speedDiff < crashSpeedThreshold / 3.6) continue;

        // This is a dangerous encounter — track it
        const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        currentEncounters.add(pairKey);

        // Only roll the dice once when the encounter first begins
        if (this._activeEncounters.has(pairKey)) continue;

        // Compute effective crash rate based on driver behavior
        let effectiveRate = crashRate;

        // Aggressive drivers have much higher crash rates
        // (low politeness, low time headway = reckless)
        const minPoliteness = Math.min(a.behavior.politeness, b.behavior.politeness);
        const minHeadway = Math.min(a.behavior.T, b.behavior.T);
        if (minPoliteness <= 0.05) effectiveRate *= 8;       // zero-politeness drivers
        else if (minPoliteness < 0.2) effectiveRate *= 3;    // low politeness
        if (minHeadway < 0.6) effectiveRate *= 4;            // extreme tailgaters
        else if (minHeadway < 1.0) effectiveRate *= 2;       // close followers

        // Right-side overtaking risk (faster vehicle in a higher lane index)
        const aLane = a.effectiveLane;
        const bLane = b.effectiveLane;
        const isRightOvertake = (a.v > b.v && aLane > bLane) || (b.v > a.v && bLane > aLane);
        if (isRightOvertake) {
          // More dangerous when it's not culturally expected
          effectiveRate *= this.events.rightOvertakeAllowed ? 2 : 5;
        }

        // New encounter — roll against effective crashRate per 1,000
        if (Math.random() * 1000 >= effectiveRate) continue;

        a.crashed = true;
        b.crashed = true;
        a.v = 0;
        b.v = 0;
        a.crashDuration = randomBetween(this.events.crashClearMin, this.events.crashClearMax);
        b.crashDuration = a.crashDuration;
        this.stats.totalAccidents++;
      }
    }

    // Update active encounters — remove pairs that are no longer overlapping
    this._activeEncounters = currentEncounters;
  }

  /** Get the minimum speed of nearby vehicles in a given lane (within ~60m) */
  _getNearbySpeeds(vehicle, lane, getLaneVehicles) {
    const vehicles = getLaneVehicles(lane);
    let minSpeed = Infinity;
    let found = false;
    for (const v of vehicles) {
      if (v.crashed) continue;
      // Check vehicles roughly alongside us (within ~60m ahead or behind)
      const distAhead = this.road.distAhead(vehicle.x, v.x);
      const absDist = Math.abs(distAhead);
      if (absDist < 60) {
        minSpeed = Math.min(minSpeed, v.v);
        found = true;
      }
    }
    return found ? minSpeed : null;
  }

  _processBreakdowns(dt) {
    if (this.events.breakdownChance <= 0) return;
    // Convert per-minute chance to per-tick probability
    const pPerTick = 1 - Math.pow(1 - this.events.breakdownChance / 100, dt / 60);
    for (const v of this.vehicles) {
      if (v.crashed) continue;
      if (Math.random() < pPerTick) {
        v.crashed = true;
        v.v = 0;
        v.crashDuration = randomBetween(this.events.crashClearMin, this.events.crashClearMax);
        this.stats.totalAccidents++;
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
    this._activeEncounters = new Set();
    this._seed();
  }
}
