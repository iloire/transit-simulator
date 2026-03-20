import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { COUNTRY_PRESETS } from './ui.js';

const COUNTRY_LABELS = Object.fromEntries(
  Object.entries(COUNTRY_PRESETS).map(([k, v]) => [k, v.name])
);

export class ComparisonMode {
  constructor() {
    this.tiles = []; // { key, sim, renderer, canvas }
    this.active = false;
    this._frameId = null;
  }

  /**
   * Start comparison mode.
   * @param {string[]} countryKeys - which countries to compare
   * @param {object} baseConfig - current road/vehicle/event settings to hold constant
   */
  start(countryKeys, baseConfig) {
    if (this.active) this.stop();
    this.active = true;

    // Hide main canvas and controls, show comparison grid
    const mainWrap = document.querySelector('.canvas-wrap');
    mainWrap.style.display = 'none';
    const bottomSection = document.querySelector('.bottom-section');
    if (bottomSection) bottomSection.style.display = 'none';

    const grid = document.getElementById('comparison-grid');
    grid.style.display = 'grid';
    grid.innerHTML = '';

    // Create a tile for each country
    for (const key of countryKeys) {
      const preset = COUNTRY_PRESETS[key];
      if (!preset) continue;

      const tile = document.createElement('div');
      tile.className = 'compare-tile';

      const canvas = document.createElement('canvas');
      tile.appendChild(canvas);
      grid.appendChild(tile);

      // Create simulation with the base road config
      const sim = new Simulation({
        laneCount: baseConfig.lanes,
        speedLimit: baseConfig.speedLimit / 3.6,
        roadLength: baseConfig.roadLength || 600,
        spawnRate: baseConfig.spawnRate / 10,
        truckSpeedLimit: baseConfig.truckSpeedLimit / 3.6,
      });

      // Apply country behavior mix
      sim.behaviorMix.optimal = preset.optimal;
      sim.behaviorMix.laneCamper = preset.laneCamper;
      sim.behaviorMix.aggressive = preset.aggressive;
      sim.behaviorMix.cautious = preset.cautious;
      sim.politenessFactor = preset.politeness / 50;
      sim.events.rightOvertakeAllowed = preset.rightOvertakeAllowed;

      // Apply vehicle mix from base config
      sim.vehicleMix.car = baseConfig.mixCars;
      sim.vehicleMix.truck = baseConfig.mixTrucks;
      sim.vehicleMix.motorbike = baseConfig.mixBikes;

      // Apply event overrides if any
      if (baseConfig.eventOverrides) {
        Object.assign(sim.events, baseConfig.eventOverrides);
        // But keep the country-specific rightOvertakeAllowed
        sim.events.rightOvertakeAllowed = preset.rightOvertakeAllowed;
      }

      // Re-seed with the new config
      sim.reset();

      this.tiles.push({ key, sim, renderer: null, canvas });
    }

    // Defer renderer creation until layout is computed
    requestAnimationFrame(() => {
      for (const tile of this.tiles) {
        tile.renderer = new Renderer(tile.canvas, { interactive: false });
        tile.renderer.autoFit(tile.sim.road);
      }
      this._lastTime = performance.now();
      this._loop(performance.now());
    });
  }

  _loop(now) {
    if (!this.active) return;

    const rawDt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    const simSpeed = window.__simSpeed ?? 1;
    const dt = Math.min(rawDt * simSpeed, 0.25);
    const PHYSICS_DT = 1 / 60;

    for (const tile of this.tiles) {
      if (!tile.renderer) continue;

      let acc = dt;
      while (acc >= PHYSICS_DT) {
        tile.sim.tick(PHYSICS_DT);
        acc -= PHYSICS_DT;
      }

      tile.renderer.render(tile.sim);
      tile.renderer.renderOverlay(
        COUNTRY_LABELS[tile.key] || tile.key,
        tile.sim.stats
      );
    }

    this._frameId = requestAnimationFrame((t) => this._loop(t));
  }

  stop() {
    this.active = false;
    if (this._frameId) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }

    // Clean up renderers
    for (const tile of this.tiles) {
      if (tile.renderer) tile.renderer.destroy();
    }
    this.tiles = [];

    // Hide grid, show main canvas
    const grid = document.getElementById('comparison-grid');
    if (grid) {
      grid.style.display = 'none';
      grid.innerHTML = '';
    }
    const mainWrap = document.querySelector('.canvas-wrap');
    if (mainWrap) mainWrap.style.display = '';
    const bottomSection = document.querySelector('.bottom-section');
    if (bottomSection) bottomSection.style.display = '';
  }
}
