export class Road {
  constructor({ laneCount = 3, laneWidth = 3.5, roadLength = 600, speedLimit = 22.2 }) {
    this.laneCount = laneCount;
    this.laneWidth = laneWidth;       // meters
    this.roadLength = roadLength;     // meters (toroidal)
    this.speedLimit = speedLimit;     // m/s (default ~80 km/h)
  }

  get totalWidth() {
    return this.laneCount * this.laneWidth;
  }

  /** Returns the center Y position of a lane in road-local meters (0 = top edge) */
  laneCenterY(laneIndex) {
    return (laneIndex + 0.5) * this.laneWidth;
  }

  /** Returns the center lane index (or lower-center for even lane counts) */
  get centerLane() {
    return Math.floor((this.laneCount - 1) / 2);
  }

  /** Wrap an x position within road bounds */
  wrapX(x) {
    const m = x % this.roadLength;
    return m < 0 ? m + this.roadLength : m;
  }

  /** Signed distance from a to b on the toroidal road (positive = b is ahead) */
  distAhead(fromX, toX) {
    let d = toX - fromX;
    if (d < -this.roadLength / 2) d += this.roadLength;
    if (d > this.roadLength / 2) d -= this.roadLength;
    return d;
  }
}
