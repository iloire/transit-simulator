import { PRESETS } from './behavior.js';

const STORAGE_KEY = 'transit-sim-config';

/** All configurable settings with their defaults */
function defaultConfig() {
  return {
    lanes: 3,
    speedLimit: 80,
    truckSpeedLimit: 80,
    spawnRate: 15,
    mixCars: 60,
    mixTrucks: 25,
    mixBikes: 15,
    mixOptimal: 40,
    mixCenterhog: 20,
    mixAggressive: 25,
    mixCautious: 15,
    preset: '',
    // Advanced behavior profiles (null = use code defaults)
    profileOverrides: null,
    // Event parameters (null = use code defaults)
    eventOverrides: null,
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
  simulation.truckSpeedLimit = config.truckSpeedLimit / 3.6;
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
  syncSlider('#truck-speed-limit', config.truckSpeedLimit, ' km/h');
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

  bindSlider('#truck-speed-limit', (v) => {
    set('truckSpeedLimit', v);
    simulation.truckSpeedLimit = v / 3.6;
  });

  bindSlider('#spawn-rate', (v) => {
    set('spawnRate', v);
    set('preset', '');
    if ($('#country-preset')) $('#country-preset').value = '';
    simulation.spawnRate = v / 10;
  });

  // Linked slider group: when one changes, others rebalance to keep sum = 100
  function setupLinkedGroup(sliders) {
    for (const item of sliders) {
      const el = $(item.sel);
      if (!el) continue;
      el.addEventListener('input', () => {
        const newVal = Math.min(100, Math.max(0, parseInt(el.value)));
        const others = sliders.filter(s => s.sel !== item.sel);
        const othersSum = others.reduce((s, o) => s + parseInt($(o.sel).value), 0);
        const remaining = 100 - newVal;

        // Distribute remaining proportionally among others
        if (othersSum > 0) {
          let distributed = 0;
          for (let i = 0; i < others.length; i++) {
            const o = others[i];
            const oldVal = parseInt($(o.sel).value);
            let share;
            if (i === others.length - 1) {
              share = remaining - distributed; // last one gets the rounding remainder
            } else {
              share = Math.round((oldVal / othersSum) * remaining);
            }
            share = Math.max(0, Math.min(100, share));
            distributed += share;
            $(o.sel).value = share;
            $(o.sel).setAttribute('value', share);
            $(o.sel + '-val').textContent = share + '%';
            o.apply(share);
          }
        } else {
          // All others are 0 — split evenly
          const share = Math.floor(remaining / others.length);
          let leftover = remaining - share * others.length;
          for (const o of others) {
            const v = share + (leftover > 0 ? 1 : 0);
            if (leftover > 0) leftover--;
            $(o.sel).value = v;
            $(o.sel).setAttribute('value', v);
            $(o.sel + '-val').textContent = v + '%';
            o.apply(v);
          }
        }

        // Update the changed slider's display and state
        $(item.sel + '-val').textContent = newVal + '%';
        item.apply(newVal);

        // Clear preset if behavior group
        set('preset', '');
        if ($('#country-preset')) $('#country-preset').value = '';
        saveConfig(config);
      });
    }
  }

  // Behavior mix group
  setupLinkedGroup([
    { sel: '#mix-optimal', apply: (v) => { config.mixOptimal = v; simulation.behaviorMix.optimal = v; } },
    { sel: '#mix-centerhog', apply: (v) => { config.mixCenterhog = v; simulation.behaviorMix.centerHog = v; } },
    { sel: '#mix-aggressive', apply: (v) => { config.mixAggressive = v; simulation.behaviorMix.aggressive = v; } },
    { sel: '#mix-cautious', apply: (v) => { config.mixCautious = v; simulation.behaviorMix.cautious = v; } },
  ]);

  // Vehicle mix group
  setupLinkedGroup([
    { sel: '#mix-cars', apply: (v) => { config.mixCars = v; simulation.vehicleMix.car = v; } },
    { sel: '#mix-trucks', apply: (v) => { config.mixTrucks = v; simulation.vehicleMix.truck = v; } },
    { sel: '#mix-bikes', apply: (v) => { config.mixBikes = v; simulation.vehicleMix.motorbike = v; } },
  ]);

  // Country presets — only affect driver behavior mix
  const countryPresets = {
    germany:     { optimal: 55, centerHog: 10, aggressive: 25, cautious: 10, rightOvertakeAllowed: false },
    uk:          { optimal: 40, centerHog: 30, aggressive: 10, cautious: 20, rightOvertakeAllowed: false },
    usa:         { optimal: 30, centerHog: 25, aggressive: 30, cautious: 15, rightOvertakeAllowed: true },
    italy:       { optimal: 20, centerHog: 15, aggressive: 50, cautious: 15, rightOvertakeAllowed: false },
    india:       { optimal: 10, centerHog: 20, aggressive: 55, cautious: 15, rightOvertakeAllowed: true },
    japan:       { optimal: 50, centerHog: 15, aggressive:  5, cautious: 30, rightOvertakeAllowed: false },
    france:      { optimal: 30, centerHog: 25, aggressive: 30, cautious: 15, rightOvertakeAllowed: false },
    brazil:      { optimal: 15, centerHog: 20, aggressive: 50, cautious: 15, rightOvertakeAllowed: true },
    netherlands: { optimal: 55, centerHog: 15, aggressive: 10, cautious: 20, rightOvertakeAllowed: false },
    saudi:       { optimal: 15, centerHog: 15, aggressive: 60, cautious: 10, rightOvertakeAllowed: true },
  };

  const presetSelect = $('#country-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const key = presetSelect.value;
      if (!key) return;
      const p = countryPresets[key];
      if (!p) return;

      // Update config & simulation — behavior mix only
      config.preset = key;
      config.mixOptimal = p.optimal;
      config.mixCenterhog = p.centerHog;
      config.mixAggressive = p.aggressive;
      config.mixCautious = p.cautious;
      saveConfig(config);

      simulation.behaviorMix.optimal = p.optimal;
      simulation.behaviorMix.centerHog = p.centerHog;
      simulation.behaviorMix.aggressive = p.aggressive;
      simulation.behaviorMix.cautious = p.cautious;

      // Set right-overtake culture
      simulation.events.rightOvertakeAllowed = p.rightOvertakeAllowed;
      const rightOvertakeToggle = document.querySelector('#evt-right-overtake');
      if (rightOvertakeToggle) rightOvertakeToggle.checked = p.rightOvertakeAllowed;
      config.eventOverrides = { ...simulation.events };
      saveConfig(config);

      syncSlider('#mix-optimal', p.optimal, '%');
      syncSlider('#mix-centerhog', p.centerHog, '%');
      syncSlider('#mix-aggressive', p.aggressive, '%');
      syncSlider('#mix-cautious', p.cautious, '%');

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

  // Advanced behavior panel
  setupAdvancedPanel($, config, saveConfig);

  // Event parameter sliders
  setupEventSliders(simulation, config, saveConfig);
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

/** Advanced panel: per-profile IDM/MOBIL parameter tuning */
function setupAdvancedPanel($, config, saveConfig) {
  const toggle = $('#advanced-toggle');
  const body = $('#advanced-body');
  if (!toggle || !body) return;

  // Restore saved profile overrides into PRESETS
  if (config.profileOverrides) {
    for (const [profileKey, overrides] of Object.entries(config.profileOverrides)) {
      if (PRESETS[profileKey]) {
        Object.assign(PRESETS[profileKey], overrides);
      }
    }
  }

  function persistProfiles() {
    // Save a snapshot of all profile params
    const snapshot = {};
    for (const [key, preset] of Object.entries(PRESETS)) {
      snapshot[key] = { ...preset };
    }
    config.profileOverrides = snapshot;
    saveConfig(config);
  }

  // Toggle open/close
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    toggle.textContent = open ? 'Advanced Behavior Tuning ▴' : 'Advanced Behavior Tuning ▾';
  });

  // Profile tabs
  let activeProfile = 'optimal';
  const tabs = document.querySelectorAll('.profile-tab');
  const sliders = document.querySelectorAll('.adv-slider');
  const selects = document.querySelectorAll('.adv-select');

  // Value formatting per parameter
  const paramUnits = {
    v0Factor: { suffix: '', decimals: 2 },
    T: { suffix: 's', decimals: 1 },
    aMax: { suffix: '', decimals: 1 },
    b: { suffix: '', decimals: 1 },
    s0: { suffix: 'm', decimals: 1 },
    politeness: { suffix: '', decimals: 2 },
    aThreshold: { suffix: '', decimals: 2 },
    bSafe: { suffix: '', decimals: 1 },
    laneBias: { suffix: '', decimals: 1 },
  };

  function loadProfileToUI(profileKey) {
    const preset = PRESETS[profileKey];
    sliders.forEach(sl => {
      const param = sl.dataset.param;
      if (preset[param] !== undefined) {
        sl.value = preset[param];
        const fmt = paramUnits[param];
        const valEl = sl.nextElementSibling;
        if (valEl) valEl.textContent = Number(preset[param]).toFixed(fmt.decimals) + fmt.suffix;
      }
    });
    selects.forEach(sel => {
      const param = sel.dataset.param;
      if (param === 'lanePreference') {
        sel.value = preset[param] || '';
      }
    });
  }

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeProfile = tab.dataset.profile;
      loadProfileToUI(activeProfile);
    });
  });

  // Slider changes — write back to PRESETS and persist
  sliders.forEach(sl => {
    sl.addEventListener('input', () => {
      const param = sl.dataset.param;
      const val = parseFloat(sl.value);
      PRESETS[activeProfile][param] = val;
      const fmt = paramUnits[param];
      const valEl = sl.nextElementSibling;
      if (valEl) valEl.textContent = val.toFixed(fmt.decimals) + fmt.suffix;
      persistProfiles();
    });
  });

  // Select changes
  selects.forEach(sel => {
    sel.addEventListener('change', () => {
      const param = sel.dataset.param;
      PRESETS[activeProfile][param] = sel.value || null;
      persistProfiles();
    });
  });

  // Load initial profile
  loadProfileToUI(activeProfile);
}

/** Wire up the Accidents & Events panel toggle and sliders */
function setupEventSliders(simulation, config, saveConfig) {
  const toggle = document.querySelector('#events-toggle');
  const body = document.querySelector('#events-body');
  if (toggle && body) {
    toggle.addEventListener('click', () => {
      const open = body.classList.toggle('open');
      toggle.textContent = open ? 'Accidents & Events ▴' : 'Accidents & Events ▾';
    });
  }

  // Restore saved event overrides
  if (config.eventOverrides) {
    Object.assign(simulation.events, config.eventOverrides);
  }

  const evtSliders = document.querySelectorAll('.evt-slider');

  const evtUnits = {
    crashSpeedThreshold: { suffix: ' km/h', decimals: 0 },
    crashRate:           { suffix: '‰', decimals: 0 },
    crashClearMin:       { suffix: 's', decimals: 0 },
    crashClearMax:       { suffix: 's', decimals: 0 },
    lateralTolerance:    { suffix: '', decimals: 2 },
    longitudinalTolerance: { suffix: '', decimals: 2 },
    reactionJitter:      { suffix: '%', decimals: 0 },
    breakdownChance:     { suffix: '%', decimals: 1 },
  };

  evtSliders.forEach(sl => {
    const key = sl.dataset.event;

    // Initialize slider from (possibly restored) simulation values
    sl.value = simulation.events[key];
    const fmt = evtUnits[key];
    const valEl = sl.nextElementSibling;
    if (valEl && fmt) {
      valEl.textContent = Number(simulation.events[key]).toFixed(fmt.decimals) + fmt.suffix;
    }

    sl.addEventListener('input', () => {
      const val = parseFloat(sl.value);
      simulation.events[key] = val;
      if (valEl && fmt) {
        valEl.textContent = val.toFixed(fmt.decimals) + fmt.suffix;
      }
      // Persist
      config.eventOverrides = { ...simulation.events };
      saveConfig(config);
    });
  });

  // Right-overtake toggle
  const rightOvertakeToggle = document.querySelector('#evt-right-overtake');
  if (rightOvertakeToggle) {
    rightOvertakeToggle.checked = simulation.events.rightOvertakeAllowed;
    rightOvertakeToggle.addEventListener('change', () => {
      simulation.events.rightOvertakeAllowed = rightOvertakeToggle.checked;
      config.eventOverrides = { ...simulation.events };
      saveConfig(config);
    });
  }
}
