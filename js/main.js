import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { setupUI, COUNTRY_PRESETS } from './ui.js';
import { ComparisonMode } from './comparison.js';

const canvas = document.getElementById('sim-canvas');
const simulation = new Simulation({
  laneCount: 3,
  speedLimit: 22.2, // ~80 km/h
  spawnRate: 1.5,
});

const renderer = new Renderer(canvas);
setupUI(simulation, renderer);

// Center camera on middle of road
renderer.camera.x = simulation.road.roadLength / 2;

// Comparison mode
const comparison = new ComparisonMode();
const btnCompare = document.getElementById('btn-compare');

btnCompare.addEventListener('click', () => {
  if (comparison.active) {
    // Exit comparison mode
    comparison.stop();
    btnCompare.textContent = 'Compare Countries';
    btnCompare.classList.remove('active');
    simulation.paused = false;
    lastTime = performance.now();
    accumulator = 0;
  } else {
    // Enter comparison mode — pause main sim
    simulation.paused = true;
    btnCompare.textContent = 'Exit Comparison';
    btnCompare.classList.add('active');

    // Snapshot current config for all comparison sims
    const baseConfig = {
      lanes: simulation.road.laneCount,
      speedLimit: simulation.road.speedLimit * 3.6,
      truckSpeedLimit: simulation.truckSpeedLimit * 3.6,
      roadLength: simulation.road.roadLength,
      spawnRate: simulation.spawnRate * 10,
      mixCars: simulation.vehicleMix.car,
      mixTrucks: simulation.vehicleMix.truck,
      mixBikes: simulation.vehicleMix.motorbike,
      eventOverrides: { ...simulation.events },
    };

    comparison.start(Object.keys(COUNTRY_PRESETS), baseConfig);
  }
});

// Fixed timestep physics with render interpolation
const PHYSICS_DT = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();

function loop(now) {
  if (!comparison.active) {
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;

    const simSpeed = window.__simSpeed ?? 1;
    accumulator += rawDt * simSpeed;

    // Cap accumulator to prevent spiral of death
    if (accumulator > 0.25) accumulator = 0.25;

    while (accumulator >= PHYSICS_DT) {
      simulation.tick(PHYSICS_DT);
      accumulator -= PHYSICS_DT;
    }

    renderer.render(simulation);
  } else {
    lastTime = now;
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
