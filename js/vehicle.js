import { clamp, nextId, vehicleColor, randomBetween } from './utils.js';

export class Vehicle {
  constructor(x, lane, behavior, road, jitterPct = 0.1) {
    this.id = nextId();
    this.x = x;
    this.lane = lane;
    this.targetLane = lane;
    this.laneProgress = 0;    // 0 = at current lane, 1 = at target lane
    this.v = behavior.v0 * randomBetween(0.7, 1.0); // initial speed with some variance
    this.a = 0;
    this.behavior = behavior;
    this.road = road;

    this.type = behavior.vehicleType;
    this.length = behavior.length;
    this.width = behavior.width;
    this.color = vehicleColor(this.type);

    this.crashed = false;
    this.crashTimer = 0;
    this.crashDuration = randomBetween(8, 20); // seconds before cleared

    // Add slight randomness to reaction time
    this.reactionJitter = randomBetween(1 - jitterPct, 1 + jitterPct);
  }

  /** IDM: compute acceleration given a leader vehicle (or null for free road) */
  computeIDM(leader) {
    const { v0, T, aMax, b, s0, delta } = this.behavior;
    const v = this.v;
    const T_jittered = T * this.reactionJitter;

    if (this.crashed) return 0;

    // Free road acceleration
    const aFree = aMax * (1 - Math.pow(v / v0, delta));

    if (!leader) return aFree;

    // Gap to leader (bumper to bumper)
    const gap = this.road.distAhead(this.x + this.length / 2, leader.x - leader.length / 2);

    if (gap < 0.1) {
      // Overlapping or very close — emergency brake
      return -b * 3;
    }

    // Desired gap
    const dv = v - leader.v;
    const sStar = s0 + Math.max(0, v * T_jittered + (v * dv) / (2 * Math.sqrt(aMax * b)));

    const aInt = -aMax * Math.pow(sStar / gap, 2);

    return aFree + aInt;
  }

  /** MOBIL: evaluate whether to change to an adjacent lane */
  evaluateLaneChange(getLaneVehicles, rightOvertakeAllowed = false) {
    if (this.crashed) return null;
    if (this.lane !== this.targetLane) return null; // already changing

    const { politeness, aThreshold, bSafe, lanePreference, laneBias } = this.behavior;
    const currentLane = this.lane;

    let bestLane = null;
    let bestIncentive = aThreshold;

    const candidates = [];
    const minLane = this.behavior.maxLane ?? 0; // truck lane restriction
    if (currentLane > minLane) candidates.push(currentLane - 1);
    if (currentLane < this.road.laneCount - 1) candidates.push(currentLane + 1);

    // Current acceleration with current leader
    const myLeader = this._findLeader(currentLane, getLaneVehicles);
    const aCurrent = this.computeIDM(myLeader);

    // Current follower's acceleration
    const myFollower = this._findFollower(currentLane, getLaneVehicles);
    const aFollowerCurrent = myFollower ? myFollower.computeIDM(this) : 0;

    for (const targetLane of candidates) {
      const targetLeader = this._findLeader(targetLane, getLaneVehicles);
      const targetFollower = this._findFollower(targetLane, getLaneVehicles);

      // My acceleration in target lane
      const aNew = this.computeIDM(targetLeader);

      // New follower's acceleration after I move in
      const aFollowerNew = targetFollower ? targetFollower.computeIDM(this) : 0;

      // Safety: new follower must not brake too hard
      if (aFollowerNew < -bSafe) continue;

      // Check gap is physically possible
      if (targetLeader) {
        const gapAhead = this.road.distAhead(this.x + this.length / 2, targetLeader.x - targetLeader.length / 2);
        if (gapAhead < this.length * 0.5) continue;
      }
      if (targetFollower) {
        const gapBehind = this.road.distAhead(targetFollower.x + targetFollower.length / 2, this.x - this.length / 2);
        if (gapBehind < this.length * 0.3) continue;
      }

      // Old follower's acceleration after I leave
      const aFollowerOldNew = myFollower ? myFollower.computeIDM(myLeader) : 0;

      // MOBIL incentive
      let incentive = (aNew - aCurrent)
        + politeness * ((aFollowerNew - aFollowerCurrent) + (aFollowerOldNew - aFollowerCurrent));

      // Right-overtake penalty: moving to a higher lane index to go faster = right overtake
      // Polite/cautious drivers heavily penalize this; aggressive drivers mostly ignore it
      if (!rightOvertakeAllowed && targetLane > currentLane) {
        const leader = this._findLeader(currentLane, getLaneVehicles);
        const wouldOvertakeOnRight = leader && this.v > leader.v * 0.9;
        if (wouldOvertakeOnRight) {
          // Penalty scaled by politeness: polite drivers almost never do it
          const penalty = 2.0 * (0.3 + politeness * 2.0);
          incentive -= penalty;
        }
      }

      // Lane preference bias
      if (lanePreference === 'center') {
        const center = this.road.centerLane;
        const currentDist = Math.abs(currentLane - center);
        const targetDist = Math.abs(targetLane - center);
        incentive += laneBias * (currentDist - targetDist); // positive if moving toward center
      } else if (lanePreference === 'right') {
        if (targetLane > currentLane) {
          // Moving right: strong pull if not blocked in right lane
          const rightLeader = this._findLeader(targetLane, getLaneVehicles);
          const canMaintainSpeed = !rightLeader || rightLeader.v > this.v * 0.85;
          incentive += laneBias * (canMaintainSpeed ? 1.5 : 0.3);
        } else {
          // Moving left: only do it if current leader is actually slow
          const myLeaderHere = this._findLeader(currentLane, getLaneVehicles);
          const isBlocked = myLeaderHere && myLeaderHere.v < this.v * 0.8;
          if (!isBlocked) {
            // Not blocked — penalize moving left (stay right)
            incentive -= laneBias * 1.0;
          }
        }
      }

      if (incentive > bestIncentive) {
        bestIncentive = incentive;
        bestLane = targetLane;
      }
    }

    return bestLane;
  }

  _findLeader(lane, getLaneVehicles) {
    const vehicles = getLaneVehicles(lane);
    let bestDist = Infinity;
    let leader = null;
    for (const v of vehicles) {
      if (v.id === this.id) continue;
      const dist = this.road.distAhead(this.x, v.x);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        leader = v;
      }
    }
    return leader;
  }

  _findFollower(lane, getLaneVehicles) {
    const vehicles = getLaneVehicles(lane);
    let bestDist = Infinity;
    let follower = null;
    for (const v of vehicles) {
      if (v.id === this.id) continue;
      const dist = this.road.distAhead(v.x, this.x);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        follower = v;
      }
    }
    return follower;
  }

  /** Get the effective lane Y (interpolated during lane changes) */
  get effectiveY() {
    const fromY = this.road.laneCenterY(this.lane);
    const toY = this.road.laneCenterY(this.targetLane);
    return fromY + (toY - fromY) * this.laneProgress;
  }

  /** Get the effective lane (the lane the vehicle occupies most) */
  get effectiveLane() {
    return this.laneProgress < 0.5 ? this.lane : this.targetLane;
  }

  update(dt, leader, leftLaneSpeed = null) {
    if (this.crashed) {
      this.crashTimer += dt;
      this.v = 0;
      this.a = 0;
      return;
    }

    // Compute IDM acceleration
    this.a = clamp(this.computeIDM(leader), -8, this.behavior.aMax);

    // Update velocity and position
    let maxV = this.behavior.v0 * 1.3;

    // Right-overtake prevention: cap speed to left-lane traffic speed
    // Polite drivers fully match, aggressive drivers ignore
    if (leftLaneSpeed !== null && leftLaneSpeed < this.v) {
      // politeness 0.0 → ignore, 0.1 → partial, 0.25+ → fully match left-lane speed
      const respect = Math.min(1, this.behavior.politeness * 4);
      if (respect > 0.05) {
        // Allow a small margin (2 km/h) so we don't brake to exact same speed
        const cap = leftLaneSpeed + 0.5; // +0.5 m/s ≈ 2 km/h margin
        const effectiveCap = this.v * (1 - respect) + cap * respect;
        maxV = Math.min(maxV, effectiveCap);
      }
    }

    this.v = clamp(this.v + this.a * dt, 0, maxV);
    this.x = this.road.wrapX(this.x + this.v * dt + 0.5 * this.a * dt * dt);

    // Lane change progress
    if (this.lane !== this.targetLane) {
      this.laneProgress += dt / 0.8; // ~0.8s to complete lane change
      if (this.laneProgress >= 1) {
        this.lane = this.targetLane;
        this.laneProgress = 0;
      }
    }
  }

  startLaneChange(targetLane) {
    if (this.lane === targetLane) return;
    this.targetLane = targetLane;
    this.laneProgress = 0;
  }
}
