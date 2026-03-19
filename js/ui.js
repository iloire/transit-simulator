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

  // Country presets
  const countryPresets = {
    germany: {
      name: 'Germany (Autobahn)',
      lanes: 3, speedLimit: 130, spawnRate: 20,
      behavior: { optimal: 55, centerHog: 10, aggressive: 25, cautious: 10 },
      vehicles: { car: 60, truck: 30, motorbike: 10 },
    },
    uk: {
      name: 'United Kingdom',
      lanes: 3, speedLimit: 110, spawnRate: 18,
      behavior: { optimal: 40, centerHog: 30, aggressive: 10, cautious: 20 },
      vehicles: { car: 70, truck: 20, motorbike: 10 },
    },
    usa: {
      name: 'United States',
      lanes: 4, speedLimit: 105, spawnRate: 22,
      behavior: { optimal: 30, centerHog: 25, aggressive: 30, cautious: 15 },
      vehicles: { car: 55, truck: 35, motorbike: 10 },
    },
    italy: {
      name: 'Italy',
      lanes: 3, speedLimit: 130, spawnRate: 20,
      behavior: { optimal: 20, centerHog: 15, aggressive: 50, cautious: 15 },
      vehicles: { car: 55, truck: 20, motorbike: 25 },
    },
    india: {
      name: 'India',
      lanes: 3, speedLimit: 80, spawnRate: 35,
      behavior: { optimal: 10, centerHog: 20, aggressive: 55, cautious: 15 },
      vehicles: { car: 35, truck: 30, motorbike: 35 },
    },
    japan: {
      name: 'Japan',
      lanes: 3, speedLimit: 100, spawnRate: 20,
      behavior: { optimal: 50, centerHog: 15, aggressive: 5, cautious: 30 },
      vehicles: { car: 70, truck: 20, motorbike: 10 },
    },
    france: {
      name: 'France',
      lanes: 3, speedLimit: 130, spawnRate: 18,
      behavior: { optimal: 30, centerHog: 25, aggressive: 30, cautious: 15 },
      vehicles: { car: 65, truck: 20, motorbike: 15 },
    },
    brazil: {
      name: 'Brazil',
      lanes: 3, speedLimit: 110, spawnRate: 25,
      behavior: { optimal: 15, centerHog: 20, aggressive: 50, cautious: 15 },
      vehicles: { car: 50, truck: 25, motorbike: 25 },
    },
    netherlands: {
      name: 'Netherlands',
      lanes: 3, speedLimit: 100, spawnRate: 22,
      behavior: { optimal: 55, centerHog: 15, aggressive: 10, cautious: 20 },
      vehicles: { car: 65, truck: 25, motorbike: 10 },
    },
    saudi: {
      name: 'Saudi Arabia',
      lanes: 4, speedLimit: 120, spawnRate: 18,
      behavior: { optimal: 15, centerHog: 15, aggressive: 60, cautious: 10 },
      vehicles: { car: 75, truck: 15, motorbike: 10 },
    },
  };

  const presetSelect = $('#country-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const key = presetSelect.value;
      if (!key) return;
      const p = countryPresets[key];
      if (!p) return;

      // Apply road settings
      setSlider('#lanes', p.lanes);
      simulation.road.laneCount = p.lanes;

      setSlider('#speed-limit', p.speedLimit);
      simulation.road.speedLimit = p.speedLimit / 3.6;

      setSlider('#spawn-rate', p.spawnRate);
      simulation.spawnRate = p.spawnRate / 10;

      // Apply behavior mix
      const bKeys = ['optimal', 'centerHog', 'aggressive', 'cautious'];
      const bSliders = ['#mix-optimal', '#mix-centerhog', '#mix-aggressive', '#mix-cautious'];
      for (let i = 0; i < bKeys.length; i++) {
        simulation.behaviorMix[bKeys[i]] = p.behavior[bKeys[i]];
        setSlider(bSliders[i], p.behavior[bKeys[i]], '%');
      }

      // Apply vehicle mix
      simulation.vehicleMix.car = p.vehicles.car;
      simulation.vehicleMix.truck = p.vehicles.truck;
      simulation.vehicleMix.motorbike = p.vehicles.motorbike;
      setSlider('#mix-cars', p.vehicles.car, '%');
      setSlider('#mix-trucks', p.vehicles.truck, '%');
      setSlider('#mix-bikes', p.vehicles.motorbike, '%');

      simulation.reset();
    });
  }

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

function setSlider(selector, value, suffix) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.value = value;
  const valEl = document.querySelector(selector + '-val');
  if (valEl) {
    const s = suffix || el.dataset.suffix || '';
    valEl.textContent = value + s;
  }
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
