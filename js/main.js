import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { setupUI } from './ui.js';

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

// Fixed timestep physics with render interpolation
const PHYSICS_DT = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();

function loop(now) {
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
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
