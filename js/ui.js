const STORAGE_KEY = 'transit-sim-config';

/** All configurable settings with their defaults */
function defaultConfig() {
  return {
    lanes: 3,
    speedLimit: 80,
    spawnRate: 15,
    mixCars: 60,
    mixTrucks: 25,
    mixBikes: 15,
    mixOptimal: 40,
    mixCenterhog: 20,
    mixAggressive: 25,
    mixCautious: 15,
    preset: '',
  };
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {}
  return defaultConfig();
}

function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

/** Apply a config object to the simulation and all UI sliders */
function applyConfig(config, simulation) {
  // Road
  simulation.road.laneCount = config.lanes;
  simulation.road.speedLimit = config.speedLimit / 3.6;
  simulation.spawnRate = config.spawnRate / 10;

  // Behavior mix
  simulation.behaviorMix.optimal = config.mixOptimal;
  simulation.behaviorMix.centerHog = config.mixCenterhog;
  simulation.behaviorMix.aggressive = config.mixAggressive;
  simulation.behaviorMix.cautious = config.mixCautious;

  // Vehicle mix
  simulation.vehicleMix.car = config.mixCars;
  simulation.vehicleMix.truck = config.mixTrucks;
  simulation.vehicleMix.motorbike = config.mixBikes;

  // Sync all DOM elements
  syncSlider('#lanes', config.lanes);
  syncSlider('#speed-limit', config.speedLimit, ' km/h');
  syncSlider('#spawn-rate', config.spawnRate);
  syncSlider('#mix-cars', config.mixCars, '%');
  syncSlider('#mix-trucks', config.mixTrucks, '%');
  syncSlider('#mix-bikes', config.mixBikes, '%');
  syncSlider('#mix-optimal', config.mixOptimal, '%');
  syncSlider('#mix-centerhog', config.mixCenterhog, '%');
  syncSlider('#mix-aggressive', config.mixAggressive, '%');
  syncSlider('#mix-cautious', config.mixCautious, '%');

  const presetEl = document.querySelector('#country-preset');
  if (presetEl) presetEl.value = config.preset;
}

export function setupUI(simulation, renderer) {
  const $ = (sel) => document.querySelector(sel);

  // Load persisted config and apply before first render
  const config = loadConfig();
  applyConfig(config, simulation);
  simulation.reset();

  // Helper: update config, persist, and apply to simulation
  function set(key, value) {
    config[key] = value;
    saveConfig(config);
  }

  // Road controls
  bindSlider('#lanes', (v) => {
    set('lanes', v);
    set('preset', '');
    if ($('#country-preset')) $('#country-preset').value = '';
    simulation.road.laneCount = v;
    simulation.reset();
  });

  bindSlider('#speed-limit', (v) => {
    set('speedLimit', v);
    set('preset', '');
    if ($('#country-preset')) $('#country-preset').value = '';
    simulation.road.speedLimit = v / 3.6;
  });

  bindSlider('#spawn-rate', (v) => {
    set('spawnRate', v);
    set('preset', '');
    if ($('#country-preset')) $('#country-preset').value = '';
    simulation.spawnRate = v / 10;
  });

  // Behavior mix
  const behaviorMap = {
    '#mix-optimal': 'mixOptimal',
    '#mix-centerhog': 'mixCenterhog',
    '#mix-aggressive': 'mixAggressive',
    '#mix-cautious': 'mixCautious',
  };
  const simBehaviorMap = {
    mixOptimal: 'optimal',
    mixCenterhog: 'centerHog',
    mixAggressive: 'aggressive',
    mixCautious: 'cautious',
  };

  for (const [sel, configKey] of Object.entries(behaviorMap)) {
    const slider = $(sel);
    if (!slider) continue;
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value);
      set(configKey, v);
      set('preset', '');
      if ($('#country-preset')) $('#country-preset').value = '';
      simulation.behaviorMix[simBehaviorMap[configKey]] = v;
      $(sel + '-val').textContent = v + '%';
    });
  }

  // Vehicle mix
  bindSlider('#mix-cars', (v) => {
    set('mixCars', v);
    set('preset', '');
    if ($('#country-preset')) $('#country-preset').value = '';
    simulation.vehicleMix.car = v;
  });
  bindSlider('#mix-trucks', (v) => {
    set('mixTrucks', v);
    set('preset', '');
    if ($('#country-preset')) $('#country-preset').value = '';
    simulation.vehicleMix.truck = v;
  });
  bindSlider('#mix-bikes', (v) => {
    set('mixBikes', v);
    set('preset', '');
    if ($('#country-preset')) $('#country-preset').value = '';
    simulation.vehicleMix.motorbike = v;
  });

  // Country presets
  const countryPresets = {
    germany: {
      lanes: 3, speedLimit: 130, spawnRate: 20,
      behavior: { optimal: 55, centerHog: 10, aggressive: 25, cautious: 10 },
      vehicles: { car: 60, truck: 30, motorbike: 10 },
    },
    uk: {
      lanes: 3, speedLimit: 110, spawnRate: 18,
      behavior: { optimal: 40, centerHog: 30, aggressive: 10, cautious: 20 },
      vehicles: { car: 70, truck: 20, motorbike: 10 },
    },
    usa: {
      lanes: 4, speedLimit: 105, spawnRate: 22,
      behavior: { optimal: 30, centerHog: 25, aggressive: 30, cautious: 15 },
      vehicles: { car: 55, truck: 35, motorbike: 10 },
    },
    italy: {
      lanes: 3, speedLimit: 130, spawnRate: 20,
      behavior: { optimal: 20, centerHog: 15, aggressive: 50, cautious: 15 },
      vehicles: { car: 55, truck: 20, motorbike: 25 },
    },
    india: {
      lanes: 3, speedLimit: 80, spawnRate: 35,
      behavior: { optimal: 10, centerHog: 20, aggressive: 55, cautious: 15 },
      vehicles: { car: 35, truck: 30, motorbike: 35 },
    },
    japan: {
      lanes: 3, speedLimit: 100, spawnRate: 20,
      behavior: { optimal: 50, centerHog: 15, aggressive: 5, cautious: 30 },
      vehicles: { car: 70, truck: 20, motorbike: 10 },
    },
    france: {
      lanes: 3, speedLimit: 130, spawnRate: 18,
      behavior: { optimal: 30, centerHog: 25, aggressive: 30, cautious: 15 },
      vehicles: { car: 65, truck: 20, motorbike: 15 },
    },
    brazil: {
      lanes: 3, speedLimit: 110, spawnRate: 25,
      behavior: { optimal: 15, centerHog: 20, aggressive: 50, cautious: 15 },
      vehicles: { car: 50, truck: 25, motorbike: 25 },
    },
    netherlands: {
      lanes: 3, speedLimit: 100, spawnRate: 22,
      behavior: { optimal: 55, centerHog: 15, aggressive: 10, cautious: 20 },
      vehicles: { car: 65, truck: 25, motorbike: 10 },
    },
    saudi: {
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

      // Update config
      config.preset = key;
      config.lanes = p.lanes;
      config.speedLimit = p.speedLimit;
      config.spawnRate = p.spawnRate;
      config.mixOptimal = p.behavior.optimal;
      config.mixCenterhog = p.behavior.centerHog;
      config.mixAggressive = p.behavior.aggressive;
      config.mixCautious = p.behavior.cautious;
      config.mixCars = p.vehicles.car;
      config.mixTrucks = p.vehicles.truck;
      config.mixBikes = p.vehicles.motorbike;
      saveConfig(config);

      // Apply everything
      applyConfig(config, simulation);
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
      const suffix = el.dataset.suffix || '';
      valEl.textContent = v + suffix;
    }
    onChange(v);
  });
}

/** Force-sync a range input's visual thumb and its label */
function syncSlider(selector, value, suffix) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.value = String(value);
  el.setAttribute('value', String(value));
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
