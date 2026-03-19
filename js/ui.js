export function setupUI(simulation, renderer) {
  const $ = (sel) => document.querySelector(sel);

  // Road controls
  bindSlider('#lanes', (v) => {
    simulation.road.laneCount = v;
    simulation.reset();
  });

  bindSlider('#speed-limit', (v) => {
    simulation.road.speedLimit = v / 3.6; // km/h to m/s
  });

  bindSlider('#spawn-rate', (v) => {
    simulation.spawnRate = v / 10;
  });

  // Behavior mix — constrained to sum ~100
  const behaviorSliders = ['#mix-optimal', '#mix-centerhog', '#mix-aggressive', '#mix-cautious'];
  const behaviorKeys = ['optimal', 'centerHog', 'aggressive', 'cautious'];

  for (let i = 0; i < behaviorSliders.length; i++) {
    const sel = behaviorSliders[i];
    const key = behaviorKeys[i];
    const slider = $(sel);
    if (!slider) continue;

    slider.addEventListener('input', () => {
      simulation.behaviorMix[key] = parseInt(slider.value);
      $(sel + '-val').textContent = slider.value + '%';
    });
  }

  // Vehicle mix
  bindSlider('#mix-cars', (v) => { simulation.vehicleMix.car = v; });
  bindSlider('#mix-trucks', (v) => { simulation.vehicleMix.truck = v; });
  bindSlider('#mix-bikes', (v) => { simulation.vehicleMix.motorbike = v; });

  // Pause / Reset
  $('#btn-pause')?.addEventListener('click', () => {
    simulation.paused = !simulation.paused;
    $('#btn-pause').textContent = simulation.paused ? '▶ Play' : '⏸ Pause';
  });

  $('#btn-reset')?.addEventListener('click', () => {
    simulation.reset();
  });

  // Speed control
  const speedSlider = $('#sim-speed');
  const speedVal = $('#sim-speed-val');
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      const v = parseFloat(speedSlider.value);
      window.__simSpeed = v / 10;
      if (speedVal) speedVal.textContent = (v / 10).toFixed(1) + 'x';
    });
  }
  window.__simSpeed = 1;

  // Stats update
  setInterval(() => {
    updateStat('#stat-flow', Math.round(simulation.stats.flowRate).toLocaleString() + ' veh/hr');
    updateStat('#stat-speed', Math.round(simulation.stats.avgSpeed) + ' km/h');
    updateStat('#stat-accidents', simulation.stats.totalAccidents.toString());
    updateStat('#stat-active-crashes', simulation.stats.accidentCount.toString());
    updateStat('#stat-vehicles', simulation.stats.vehicleCount.toString());
    updateStat('#stat-density', Math.round(simulation.stats.density) + ' veh/km');
    updateStat('#stat-time', formatTime(simulation.time));
  }, 200);
}

function bindSlider(selector, onChange) {
  const el = document.querySelector(selector);
  if (!el) return;
  const valEl = document.querySelector(selector + '-val');

  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (valEl) {
      let suffix = el.dataset.suffix || '';
      valEl.textContent = v + suffix;
    }
    onChange(v);
  });
}

function updateStat(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
