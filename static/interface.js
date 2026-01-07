// ============================================================================
// Object-Oriented Design Framework
// ============================================================================

/**
 * StateManager - Manages JSON state with proper validation and synchronization
 */
class StateManager {
  constructor(socket) {
    this.socket = socket;
    this.state = null;
    this.listeners = new Set();
  }

  /**
   * Update state and notify listeners
   * @param {Object} newState - JSON state object
   */
  setState(newState) {
    if (!this.isValidState(newState)) {
      console.warn("Invalid state structure", newState);
      return;
    }
    this.state = this.normalizeState(newState);
    this.notifyListeners();
  }

  /**
   * Get current state
   * @returns {Object} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Validate state structure
   * @param {Object} state - State to validate
   * @returns {boolean} True if valid
   */
  isValidState(state) {
    return state && typeof state === "object" && Array.isArray(state.layout || state.modules);
  }

  /**
   * Normalize state to ensure consistent structure
   * @param {Object} state - State to normalize
   * @returns {Object} Normalized state
   */
  normalizeState(state) {
    // Ensure modules array exists
    if (!state.layout && !state.modules) {
      state.modules = [];
    }
    // Normalize layout to modules for consistency
    if (state.layout && !state.modules) {
      state.modules = state.layout;
    }
    // Ensure each module has required fields
    if (state.modules) {
      state.modules = state.modules.map(m => this.normalizeModule(m));
    }
    return state;
  }

  /**
   * Normalize a single module
   * @param {Object} module - Module to normalize
   * @returns {Object} Normalized module
   */
  normalizeModule(module) {
    return {
      id: module.id || `module_${Date.now()}_${Math.random()}`,
      type: module.type || "ActionButton",
      x: module.x ?? 0,
      y: module.y ?? 0,
      w: module.w ?? 1,
      h: module.h ?? 1,
      value: module.value ?? 0,
      locked: module.locked ?? false,
      ...module
    };
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Callback function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of state change
   */
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error("State listener error:", error);
      }
    });
  }
}

/**
 * EventManager - Manages event emission with JSON payload support
 */
class EventManager {
  constructor(socket) {
    this.socket = socket;
    this.eventHandlers = new Map();
  }

  /**
   * Send a module event with optional JSON payload
   * @param {string} moduleId - Module ID
   * @param {string} eventType - Event type (press, release, change, toggle)
   * @param {number} value - Event value
   * @param {Object} payload - Optional JSON payload to include
   */
  sendModuleEvent(moduleId, eventType, value, payload = null) {
    const eventData = {
      id: moduleId,
      etype: eventType,
      value: value
    };

    // Add payload if provided
    if (payload && typeof payload === "object") {
      eventData.payload = payload;
    }

    this.socket.emit("user:module_event", eventData);
  }

  /**
   * Register an event handler
   * @param {string} eventType - Event type
   * @param {Function} handler - Handler function
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Emit an internal event
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Event handler error for ${eventType}:`, error);
      }
    });
  }
}

/**
 * ModuleManager - Manages module lifecycle and rendering
 */
class ModuleManager {
  constructor(stateManager, eventManager) {
    this.stateManager = stateManager;
    this.eventManager = eventManager;
    this.componentInstances = new Map();
    this.componentFactory = new ComponentFactory(eventManager);
  }

  /**
   * Render all modules
   * @param {HTMLElement} container - Container element
   * @param {Object} state - State object
   */
  renderModules(container, state) {
    // Clear existing modules
    this.componentInstances.forEach(instance => {
      if (instance.destroy) {
        instance.destroy();
      }
    });
    this.componentInstances.clear();
    container.innerHTML = "";

    // Render each module
    const modules = state.modules || state.layout || [];
    modules.forEach(module => {
      const instance = this.componentFactory.createComponent(module, container);
      if (instance) {
        this.componentInstances.set(module.id, instance);
      }
    });
  }

  /**
   * Update a specific module
   * @param {string} moduleId - Module ID
   * @param {Object} updates - Updates to apply
   */
  updateModule(moduleId, updates) {
    const instance = this.componentInstances.get(moduleId);
    if (instance && instance.update) {
      instance.update(updates);
    }
  }

  /**
   * Destroy all modules
   */
  destroy() {
    this.componentInstances.forEach(instance => {
      if (instance.destroy) {
        instance.destroy();
      }
    });
    this.componentInstances.clear();
  }
}

/**
 * ComponentFactory - Creates component instances with proper isolation
 */
class ComponentFactory {
  constructor(eventManager) {
    this.eventManager = eventManager;
    this.componentClasses = new Map();
    this.registerDefaultComponents();
  }

  /**
   * Register a component class
   * @param {string} type - Component type
   * @param {Function} ComponentClass - Component class constructor
   */
  registerComponent(type, ComponentClass) {
    this.componentClasses.set(type, ComponentClass);
  }

  /**
   * Create a component instance
   * @param {Object} module - Module configuration
   * @param {HTMLElement} container - Container element
   * @returns {Object} Component instance
   */
  createComponent(module, container) {
    const ComponentClass = this.componentClasses.get(module.type);
    if (!ComponentClass) {
      console.warn(`Unknown component type: ${module.type}`);
      return null;
    }

    try {
      return new ComponentClass(module, container, this.eventManager);
    } catch (error) {
      console.error(`Error creating component ${module.type}:`, error);
      return null;
    }
  }

  /**
   * Register default component classes
   */
  registerDefaultComponents() {
    // These will be registered after component classes are defined
    // For now, we'll use a factory pattern
  }
}

/**
 * BaseComponent - Base class for all components
 */
class BaseComponent {
  constructor(module, container, eventManager) {
    this.module = module;
    this.container = container;
    this.eventManager = eventManager;
    this.element = null;
    this.eventHandlers = new Map();
    this.uniqueId = `component_${module.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.init();
  }

  /**
   * Initialize component
   */
  init() {
    this.createElement();
    this.attachEventHandlers();
    this.update(this.module);
  }

  /**
   * Create DOM element (to be overridden)
   */
  createElement() {
    throw new Error("createElement must be implemented by subclass");
  }

  /**
   * Attach event handlers (to be overridden)
   */
  attachEventHandlers() {
    // Base implementation - subclasses override
  }

  /**
   * Update component with new module data
   * @param {Object} module - Updated module data
   */
  update(module) {
    this.module = { ...this.module, ...module };
    // Subclasses should override to update visual state
  }

  /**
   * Send event with optional payload
   * @param {string} eventType - Event type
   * @param {number} value - Event value
   * @param {Object} payload - Optional JSON payload
   */
  sendEvent(eventType, value, payload = null) {
    // Get payload from module configuration if not provided
    if (!payload && this.module.payload) {
      payload = typeof this.module.payload === "string" 
        ? JSON.parse(this.module.payload) 
        : this.module.payload;
    }
    this.eventManager.sendModuleEvent(this.module.id, eventType, value, payload);
  }

  /**
   * Clean up component
   */
  destroy() {
    // Remove all event listeners
    this.eventHandlers.forEach((handler, event) => {
      if (this.element) {
        this.element.removeEventListener(event, handler);
      }
    });
    this.eventHandlers.clear();

    // Remove element from DOM
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }
}

// ============================================================================
// End OOP Framework
// ============================================================================

const $ = (id) => document.getElementById(id);

// Prevent double-tap zoom on iOS Safari
(function () {
  // Check if the target is an interactive element
  function isInteractiveElement(target) {
    if (!target) return false;
    // Check if it has the interactive class
    if (target.classList && target.classList.contains("interactive"))
      return true;
    // Check if it's a button, input, select, or textarea
    if (
      target.tagName === "BUTTON" ||
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA"
    )
      return true;
    // Check if any parent has the interactive class
    let parent = target.parentElement;
    while (parent) {
      if (parent.classList && parent.classList.contains("interactive"))
        return true;
      parent = parent.parentElement;
    }
    return false;
  }

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    function (event) {
      // Don't prevent default on interactive elements
      if (isInteractiveElement(event.target)) {
        lastTouchEnd = Date.now();
        return;
      }
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    false
  );

  // Prevent zoom on double tap
  let touchStartTime = 0;
  document.addEventListener(
    "touchstart",
    function (event) {
      // Don't prevent default on interactive elements
      if (isInteractiveElement(event.target)) {
        touchStartTime = Date.now();
        return;
      }
      const now = Date.now();
      if (now - touchStartTime < 300) {
        event.preventDefault();
      }
      touchStartTime = now;
    },
    { passive: false }
  );

  // Disable pinch zoom
  document.addEventListener("gesturestart", function (e) {
    e.preventDefault();
  });
  document.addEventListener("gesturechange", function (e) {
    e.preventDefault();
  });
  document.addEventListener("gestureend", function (e) {
    e.preventDefault();
  });
})();

// Prevent hover states from persisting on mobile after touch
// Mobile browsers can apply hover states on tap, which persist until another tap
(function () {
  // Check if device is touch-capable
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    // Remove hover states after touch events
    document.addEventListener(
      "touchend",
      function (e) {
        // Small delay to ensure hover state is applied (if browser applies it)
        setTimeout(function () {
          // Force remove hover by briefly removing and re-adding the element
          // or by blurring any focused elements
          if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
          }

          // For interactive elements, ensure they don't have hover state
          const target = e.target;
          if (target && target.classList) {
            // Trigger a mouseout event to clear hover state
            const mouseOutEvent = new MouseEvent("mouseout", {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            target.dispatchEvent(mouseOutEvent);

            // Also check parent elements with interactive class
            let parent = target.closest(".interactive");
            if (parent) {
              parent.dispatchEvent(mouseOutEvent);
            }
          }
        }, 10);
      },
      { passive: true }
    );

    // Also handle touchstart to prevent hover from being applied
    document.addEventListener(
      "touchstart",
      function (e) {
        // Blur any currently focused element to clear its hover state
        if (
          document.activeElement &&
          document.activeElement !== document.body
        ) {
          document.activeElement.blur();
        }
      },
      { passive: true }
    );
  }
})();

function setTab(which) {
  const wiz = which === "wizard";
  $("tabWizard").classList.toggle("active", wiz);
  $("tabInterface").classList.toggle("active", !wiz);
  $("panelWizard").classList.toggle("hidden", !wiz);
  $("panelInterface").classList.toggle("hidden", wiz);
}
setTab("wizard");
$("tabWizard").addEventListener("click", () => {
  ensureAudio();
  playJoyousBell(523, 0.3);
  setTab("wizard");
});
$("tabInterface").addEventListener("click", () => {
  ensureAudio();
  playJoyousBell(659, 0.3);
  setTab("interface");
});

// ---------- socket ----------
const socket = io();
let state = null;

// Status indicator removed

// Initialize OOP framework
const stateManager = new StateManager(socket);
const eventManager = new EventManager(socket);
const moduleManager = new ModuleManager(stateManager, eventManager);

socket.on("state", (s) => {
  // Update state through StateManager for proper validation
  stateManager.setState(s);
  state = stateManager.getState();
  applyThemeFromState(state);
  hydrateWizard(state);
  renderSurface(state);
});

// ---------- audio (ethereal, abstract, joyous) ----------
let audioEnabled = false;
let audioCtx = null;
let masterGain = null;

function ensureAudio() {
  if (audioEnabled) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.4; // Master volume control
  masterGain.connect(audioCtx.destination);
  audioEnabled = true;
}

// Create ethereal, echo-rich sound with delay and reverb
function playEtherealSound(freq = 440, dur = 0.3, gain = 0.15, type = "bell") {
  if (!audioEnabled || !audioCtx) return;

  const t = audioCtx.currentTime;

  // Main oscillator with detuning for richness
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const osc3 = audioCtx.createOscillator();

  // Choose waveform based on type
  const waveType =
    type === "bell" ? "sine" : type === "synth" ? "triangle" : "sine";
  osc1.type = waveType;
  osc2.type = waveType;
  osc3.type = waveType;

  // Detuned oscillators for chorus effect
  osc1.frequency.value = freq;
  osc2.frequency.value = freq * 1.005; // Slight detune
  osc3.frequency.value = freq * 0.995;

  // Create gain envelope with ethereal fade
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(gain, t + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(gain * 0.3, t + dur * 0.3);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t + dur);

  // Connect oscillators
  osc1.connect(gainNode);
  osc2.connect(gainNode);
  osc3.connect(gainNode);

  // Add delay/echo effect
  const delay = audioCtx.createDelay(0.5);
  delay.delayTime.value = 0.15;
  const delayGain = audioCtx.createGain();
  delayGain.gain.value = 0.4;

  gainNode.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(gainNode); // Feedback loop

  // Add vibrato (frequency modulation)
  const vibrato = audioCtx.createOscillator();
  vibrato.type = "sine";
  vibrato.frequency.value = 5; // Vibrato rate
  const vibratoGain = audioCtx.createGain();
  vibratoGain.gain.value = freq * 0.02; // Vibrato depth
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc1.frequency);
  vibratoGain.connect(osc2.frequency);
  vibratoGain.connect(osc3.frequency);

  // Add subtle low-pass filter for warmth
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4000;
  filter.Q.value = 1;

  gainNode.connect(filter);
  filter.connect(masterGain);

  // Start oscillators
  osc1.start(t);
  osc2.start(t);
  osc3.start(t);
  vibrato.start(t);

  // Stop oscillators
  osc1.stop(t + dur);
  osc2.stop(t + dur);
  osc3.stop(t + dur);
  vibrato.stop(t + dur);
}

// Play a bright, joyous bell-like sound
function playJoyousBell(freq = 523, dur = 0.4) {
  playEtherealSound(freq, dur, 0.18, "bell");
}

// Play a synth-like sound with more character
function playSynthSound(freq = 330, dur = 0.25, value = 0.5) {
  // Map value to frequency range for continuous sounds
  const mappedFreq = freq + value * 200;
  playEtherealSound(mappedFreq, dur, 0.12, "synth");
}

// Create a sustained polyphonic synth chord that can be started, updated, and stopped
// Inspired by Tone.PolySynth with ascending harmonic chords
function createSustainedChord(value = 0.5) {
  if (!audioEnabled || !audioCtx) return null;

  const t = audioCtx.currentTime;

  // Map value to a base note that ascends harmonically
  // Start from D4 (293.66 Hz) and ascend to E5 (659.25 Hz)
  const baseNote = 293.66 + value * 365.59; // D4 to E5 range

  // Create a beautiful ascending chord voicing
  // Using a major 9th chord structure: Root, Major Third, Perfect Fifth, Major Seventh, Major Ninth
  const notes = [
    baseNote, // Root (D4 at 0, ascending)
    baseNote * 1.2599, // Major Third (F4)
    baseNote * 1.4983, // Perfect Fifth (A4)
    baseNote * 1.8877, // Major Seventh (C5)
    baseNote * 2.2449, // Major Ninth (E5)
  ];

  // Create oscillators for each note in the chord
  const oscillators = [];
  const noteGains = [];

  // Create synth-like oscillators (triangle for warmth, sine for smoothness)
  notes.forEach((noteFreq, index) => {
    const osc = audioCtx.createOscillator();
    // Use triangle for lower notes (warmer), sine for higher notes (smoother)
    osc.type = index < 2 ? "triangle" : "sine";
    osc.frequency.value = noteFreq;

    const noteGain = audioCtx.createGain();
    // Balance: lower notes slightly stronger, higher notes add color
    noteGain.gain.value =
      index === 0 ? 0.4 : index === 1 ? 0.3 : index === 2 ? 0.25 : 0.15;

    // Smooth attack
    noteGain.gain.setValueAtTime(0, t);
    noteGain.gain.linearRampToValueAtTime(noteGain.gain.value, t + 0.02);

    osc.connect(noteGain);
    oscillators.push(osc);
    noteGains.push(noteGain);
  });

  // Master gain node
  const masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = 0.15; // Overall volume control

  // Connect all note gains to master
  noteGains.forEach((noteGain) => {
    noteGain.connect(masterGainNode);
  });

  // Add subtle delay/reverb for depth
  const delay = audioCtx.createDelay(0.5);
  delay.delayTime.value = 0.12;
  const delayGain = audioCtx.createGain();
  delayGain.gain.value = 0.2;

  masterGainNode.connect(delay);
  delay.connect(delayGain);

  // Warm low-pass filter for polished synth sound
  const lowPass = audioCtx.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 4000;
  lowPass.Q.value = 0.7;

  // Connect to output
  masterGainNode.connect(lowPass);
  lowPass.connect(masterGain);
  delayGain.connect(lowPass);

  // Start all oscillators (they will play continuously)
  oscillators.forEach((osc) => {
    osc.start(t);
  });

  // Return control object
  return {
    oscillators,
    noteGains,
    masterGainNode,
    updateValue(newValue) {
      const newBaseNote = 293.66 + newValue * 365.59;
      const newNotes = [
        newBaseNote,
        newBaseNote * 1.2599,
        newBaseNote * 1.4983,
        newBaseNote * 1.8877,
        newBaseNote * 2.2449,
      ];
      // Update frequencies smoothly
      oscillators.forEach((osc, index) => {
        osc.frequency.setValueAtTime(newNotes[index], audioCtx.currentTime);
      });
    },
    stop() {
      const stopTime = audioCtx.currentTime;
      // Smooth release
      noteGains.forEach((noteGain) => {
        noteGain.gain.cancelScheduledValues(stopTime);
        noteGain.gain.setValueAtTime(noteGain.gain.value, stopTime);
        noteGain.gain.exponentialRampToValueAtTime(0.001, stopTime + 0.1);
      });
      // Stop oscillators after release
      oscillators.forEach((osc) => {
        osc.stop(stopTime + 0.15);
      });
    },
  };
}

// Legacy function for backwards compatibility (short sounds)
function playAngelicContinuous(freq = 440, dur = 0.25, value = 0.5) {
  const chord = createSustainedChord(value);
  if (chord) {
    setTimeout(() => chord.stop(), dur * 1000);
  }
}

// Create a low humming tone that increases in pitch
function createHummingTone(value = 0.5) {
  if (!audioEnabled || !audioCtx) return null;

  const t = audioCtx.currentTime;

  // Map value to frequency: low humming starts at 60 Hz (very low), goes up to 200 Hz
  const baseFreq = 60 + value * 140; // 60 Hz to 200 Hz range

  // Create a single oscillator for a simple, clean humming tone
  const osc = audioCtx.createOscillator();
  osc.type = "sine"; // Sine wave for smooth, pure humming
  osc.frequency.value = baseFreq;

  // Gain node with smooth attack
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(0.12, t + 0.1); // Gentle fade in

  osc.connect(gainNode);

  // Add subtle low-pass filter for warmth
  const lowPass = audioCtx.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 500; // Keep it low and warm
  lowPass.Q.value = 0.7;

  gainNode.connect(lowPass);
  lowPass.connect(masterGain);

  // Start oscillator
  osc.start(t);

  // Return control object
  return {
    oscillator: osc,
    gainNode: gainNode,
    updateValue(newValue) {
      const newFreq = 60 + newValue * 140;
      // Smoothly update frequency
      osc.frequency.setValueAtTime(newFreq, audioCtx.currentTime);
    },
    stop() {
      const stopTime = audioCtx.currentTime;
      // Smooth release
      gainNode.gain.cancelScheduledValues(stopTime);
      gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + 0.2);
      // Stop oscillator after release
      osc.stop(stopTime + 0.3);
    },
  };
}

// Play a liminal, drone-like sound
function playDroneSound(freq = 220, dur = 0.5) {
  if (!audioEnabled || !audioCtx) return;

  const t = audioCtx.currentTime;

  // Multiple oscillators for rich drone
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const osc3 = audioCtx.createOscillator();

  osc1.type = "sine";
  osc2.type = "triangle";
  osc3.type = "sawtooth";

  osc1.frequency.value = freq;
  osc2.frequency.value = freq * 1.5; // Fifth
  osc3.frequency.value = freq * 2; // Octave

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(0.1, t + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t + dur);

  // Add reverb-like delay
  const delay = audioCtx.createDelay(0.8);
  delay.delayTime.value = 0.3;
  const delayGain = audioCtx.createGain();
  delayGain.gain.value = 0.3;

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  osc3.connect(gainNode);

  gainNode.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(gainNode);

  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;

  gainNode.connect(filter);
  filter.connect(masterGain);

  osc1.start(t);
  osc2.start(t);
  osc3.start(t);

  osc1.stop(t + dur);
  osc2.stop(t + dur);
  osc3.stop(t + dur);
}

// Play a vibration-like sound with tremolo
function playVibrationSound(freq = 440, dur = 0.2) {
  if (!audioEnabled || !audioCtx) return;

  const t = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  // Tremolo effect
  const tremolo = audioCtx.createOscillator();
  tremolo.type = "sine";
  tremolo.frequency.value = 8; // Tremolo rate
  const tremoloGain = audioCtx.createGain();
  tremoloGain.gain.value = 0.3;
  tremolo.connect(tremoloGain);

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(0.15, t + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, t + dur);

  tremoloGain.connect(gainNode.gain);
  osc.connect(gainNode);

  // Add echo
  const delay = audioCtx.createDelay(0.3);
  delay.delayTime.value = 0.1;
  const delayGain = audioCtx.createGain();
  delayGain.gain.value = 0.5;

  gainNode.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(masterGain);
  gainNode.connect(masterGain);

  osc.start(t);
  tremolo.start(t);

  osc.stop(t + dur);
  tremolo.stop(t + dur);
}

// Play a bright click with ethereal tail
function playEtherealClick(freq = 800, dur = 0.15) {
  playEtherealSound(freq, dur, 0.2, "bell");
}

// Play a happy ascending sound
function playAscendingSound(baseFreq = 220, dur = 0.3) {
  if (!audioEnabled || !audioCtx) return;

  const t = audioCtx.currentTime;
  const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2];

  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gainNode = audioCtx.createGain();
    const noteStart = t + i * 0.05;
    const noteDur = 0.15;

    gainNode.gain.setValueAtTime(0, noteStart);
    gainNode.gain.linearRampToValueAtTime(0.12, noteStart + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDur);

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    osc.start(noteStart);
    osc.stop(noteStart + noteDur);
  });
}

// Legacy functions for compatibility
function tick(freq = 220, dur = 0.04, gain = 0.05) {
  playEtherealSound(freq, dur * 2, gain * 2, "bell");
}

function blip() {
  playEtherealClick(600, 0.12);
}

document.addEventListener("pointerdown", () => ensureAudio(), { once: false });

// Throttle hover sounds to prevent excessive triggering
let lastHoverSound = 0;
const hoverSoundThrottle = 150; // ms

// Only add hover sounds on devices with fine pointer (mouse), not touch devices
// Check if device supports hover AND has fine pointer (not touch)
const hoverMediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
if (hoverMediaQuery.matches) {
  // Add hover sounds to all buttons using event delegation
  document.addEventListener(
    "mouseenter",
    (e) => {
      if (
        e.target &&
        e.target.classList &&
        e.target.classList.contains("btn")
      ) {
        const now = Date.now();
        if (now - lastHoverSound > hoverSoundThrottle) {
          ensureAudio();
          playEtherealClick(600, 0.08);
          lastHoverSound = now;
        }
      }
    },
    true
  );
}

// Add focus sounds to inputs using event delegation
document.addEventListener(
  "focus",
  (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "TEXTAREA"
    ) {
      ensureAudio();
      playEtherealClick(523, 0.1);
    }
  },
  true
);

// Only add hover sounds on devices that support hovering (not touch devices)
if (hoverMediaQuery.matches) {
  // Add hover sounds to wizard grid cells using event delegation
  let lastCellHoverSound = 0;
  document.addEventListener(
    "mouseover",
    (e) => {
      if (
        e.target &&
        e.target.classList &&
        e.target.classList.contains("wizCell") &&
        !e.target.classList.contains("occupied") &&
        !e.target.classList.contains("sel")
      ) {
        const now = Date.now();
        if (now - lastCellHoverSound > hoverSoundThrottle) {
          ensureAudio();
          playEtherealClick(700, 0.05);
          lastCellHoverSound = now;
        }
      }
    },
    true
  );
}

// ---------- themes ----------
// Theme-specific complementary color pairs
const themeColorPairs = {
  space: {
    primary: "#00ffdc", // Teal
    complement: "#ff008c", // Magenta
    primaryName: "Teal",
    complementName: "Magenta",
  },
  glitch: {
    primary: "#FF8C00", // Orange
    complement: "#007bff", // Blue
    primaryName: "Orange",
    complementName: "Blue",
  },
  poem: {
    primary: "#4A90E2", // Blue
    complement: "#FF8C00", // Orange
    primaryName: "Blue",
    complementName: "Orange",
  },
  network: {
    primary: "#87CEEB", // Light blue
    complement: "#FFA500", // Light orange/peach
    primaryName: "Light Blue",
    complementName: "Orange",
  },
  halftone: {
    primary: "#ffffff", // White
    complement: "#808080", // Gray
    primaryName: "White",
    complementName: "Gray",
  },
};

// Universal accent presets map to theme colors
const accentPresetMap = {
  cool: "primary", // Primary color (teal/orange/blue/etc)
  warm: "complement", // Complementary color (magenta/blue/orange/etc)
  mint: "primary",
  magenta: "complement",
};

function themePreset(mode, accentPreset) {
  const colorPair = themeColorPairs[mode] || themeColorPairs.space;

  // Determine which color to use based on preset
  let accent;
  if (accentPreset && accentPreset !== "auto") {
    const colorKey = accentPresetMap[accentPreset] || "primary";
    accent = colorPair[colorKey];
  } else {
    // Auto mode uses primary color
    accent = colorPair.primary;
  }

  // Theme-specific base colors (background and foreground)
  if (mode === "glitch") {
    return {
      bg: "#f5f5f5", // Light gray background
      fg: "#1a1a1a", // Dark text for contrast
      accent,
      primary: colorPair.primary,
      complement: colorPair.complement,
    };
  } else if (mode === "poem") {
    return {
      bg: "#fafafa", // Lighter off-white background
      fg: "#2a2a2a", // Dark text for good contrast
      accent,
      primary: colorPair.primary,
      complement: colorPair.complement,
    };
  } else if (mode === "network") {
    return {
      bg: "#ffffff", // Pure white background
      fg: "#2a2a2a", // Dark text for contrast
      accent,
      primary: colorPair.primary,
      complement: colorPair.complement,
    };
  } else if (mode === "halftone") {
    return {
      bg: "#000000", // Pure black background
      fg: "#ffffff", // White text for high contrast
      accent,
      primary: colorPair.primary,
      complement: colorPair.complement,
    };
  } else {
    // Space theme: console aesthetic
    return {
      bg: "#000000",
      fg: "#e0e0e0",
      accent,
      primary: colorPair.primary,
      complement: colorPair.complement,
    };
  }
}

function applyThemeVars(t, mode) {
  document.documentElement.style.setProperty("--bg", t.bg);
  document.documentElement.style.setProperty("--fg", t.fg);

  // Add theme class to body for theme-specific styling
  document.body.classList.remove(
    "theme-space",
    "theme-glitch",
    "theme-poem",
    "theme-network",
    "theme-halftone"
  );
  document.body.classList.add(`theme-${mode}`);

  if (mode === "glitch") {
    // Glitch theme colors - inspired by digital/ASCII art
    document.documentElement.style.setProperty("--chassis", "#e8e8e8");
    document.documentElement.style.setProperty(
      "--panelBorder",
      "rgba(0,0,0,0.15)"
    );
    document.documentElement.style.setProperty(
      "--bevelLight",
      "rgba(255,255,255,0.6)"
    );
    document.documentElement.style.setProperty(
      "--bevelDark",
      "rgba(0,0,0,0.15)"
    );
    // Glitch theme: Orange (primary) and Blue (complement)
    document.documentElement.style.setProperty("--accentTeal", t.primary); // Orange channel
    document.documentElement.style.setProperty("--accentMagenta", t.complement); // Blue channel
    document.documentElement.style.setProperty("--accent", t.accent);
  } else if (mode === "poem") {
    // Poem theme colors - inspired by fragmented poetry/collage aesthetic
    // Use transparent/outline style instead of solid fills
    document.documentElement.style.setProperty(
      "--chassis",
      "rgba(255,255,255,0.95)"
    ); // Off-white with slight transparency
    document.documentElement.style.setProperty(
      "--panelBorder",
      "rgba(128,128,128,0.4)"
    ); // Gray outline
    document.documentElement.style.setProperty(
      "--bevelLight",
      "rgba(255,255,255,0.8)"
    );
    document.documentElement.style.setProperty(
      "--bevelDark",
      "rgba(0,0,0,0.1)"
    );
    // Poem theme: Blue (primary) and Orange (complement)
    document.documentElement.style.setProperty("--accentTeal", t.primary); // Blue channel
    document.documentElement.style.setProperty("--accentMagenta", t.complement); // Orange channel
    document.documentElement.style.setProperty("--accent", t.accent);
  } else if (mode === "network") {
    // Network theme colors - inspired by diagram/network visualization
    // Clean white with light blue/green accents
    document.documentElement.style.setProperty(
      "--chassis",
      "rgba(255,255,255,0.95)"
    ); // White with slight transparency
    document.documentElement.style.setProperty(
      "--panelBorder",
      "rgba(100,100,100,0.3)"
    ); // Medium gray outline
    document.documentElement.style.setProperty(
      "--bevelLight",
      "rgba(255,255,255,0.9)"
    );
    document.documentElement.style.setProperty(
      "--bevelDark",
      "rgba(0,0,0,0.08)"
    );
    // Network theme: Light blue (primary) and Light orange (complement)
    document.documentElement.style.setProperty("--accentTeal", t.primary); // Light blue channel
    document.documentElement.style.setProperty("--accentMagenta", t.complement); // Light orange channel
    document.documentElement.style.setProperty("--accent", t.accent);
  } else if (mode === "halftone") {
    // Halftone theme colors - inspired by monochromatic pixelated/halftone aesthetic
    document.documentElement.style.setProperty("--chassis", "#0a0a0a"); // Very dark gray/black
    document.documentElement.style.setProperty(
      "--panelBorder",
      "rgba(255,255,255,0.15)"
    ); // White borders for high contrast
    document.documentElement.style.setProperty(
      "--bevelLight",
      "rgba(255,255,255,0.1)"
    );
    document.documentElement.style.setProperty(
      "--bevelDark",
      "rgba(0,0,0,0.5)"
    );
    // Halftone theme: White (primary) and Gray (complement)
    document.documentElement.style.setProperty("--accentTeal", t.primary); // White channel
    document.documentElement.style.setProperty("--accentMagenta", t.complement); // Gray channel
    document.documentElement.style.setProperty("--accent", t.accent);
  } else {
    // Space theme colors (formerly dark) - cosmic/starfield aesthetic
    document.documentElement.style.setProperty("--chassis", "#0a0a0a");
    document.documentElement.style.setProperty(
      "--panelBorder",
      "rgba(255,255,255,0.08)"
    );
    document.documentElement.style.setProperty(
      "--bevelLight",
      "rgba(255,255,255,0.12)"
    );
    document.documentElement.style.setProperty(
      "--bevelDark",
      "rgba(0,0,0,0.4)"
    );
    // Space theme: Teal (primary) and Magenta (complement)
    document.documentElement.style.setProperty("--accentTeal", t.primary); // Teal channel
    document.documentElement.style.setProperty("--accentMagenta", t.complement); // Magenta channel
    document.documentElement.style.setProperty("--accent", t.accent);
  }
}

function updateChannelNames(mode) {
  const colorPair = themeColorPairs[mode] || themeColorPairs.space;
  const selChannel = $("selChannel");
  if (selChannel) {
    // Preserve current selection
    const currentValue = selChannel.value || "magenta";

    // Update option values and labels
    selChannel.innerHTML = `
      <option value="teal">${colorPair.primaryName}</option>
      <option value="magenta">${colorPair.complementName}</option>
    `;

    // Restore selection if it's still valid
    if (currentValue === "teal" || currentValue === "magenta") {
      selChannel.value = currentValue;
    }
  }
}

function applyThemeFromState(s) {
  const mode = s?.surface?.themeMode || "space";
  const preset = s?.surface?.accentPreset || "auto";
  const theme = themePreset(mode, preset);
  applyThemeVars(theme, mode);
  updateChannelNames(mode);
}

// ---------- state + schema ----------
function defaultState(cols = 12, rows = 12) {
  return {
    v: 3,
    surface: {
      cols,
      rows,
      themeMode: "space",
      accentPreset: "auto",
    },
    layout: [], // Array of positioned modules
  };
}

// New module schema: { id, type, x, y, w, h, styleChannel, value, mode, lines, values, locked }
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Collision detection: check if a module position/size overlaps with existing modules
function checkCollision(layout, x, y, w, h, excludeId = null) {
  for (const m of layout || []) {
    if (m.id === excludeId) continue;
    const mX = m.x || 0;
    const mY = m.y || 0;
    const mW = m.w || 1;
    const mH = m.h || 1;

    // Check if rectangles overlap
    if (x < mX + mW && x + w > mX && y < mY + mH && y + h > mY) {
      return true; // Collision detected
    }
  }
  return false; // No collision
}

// Get all occupied cells for a given layout
function getOccupiedCells(layout) {
  const occupied = new Set();
  for (const m of layout || []) {
    const x = m.x || 0;
    const y = m.y || 0;
    const w = m.w || 1;
    const h = m.h || 1;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        occupied.add(`${x + c},${y + r}`);
      }
    }
  }
  return occupied;
}

// ---------- Wizard: graphical module editor ----------
let selectedModuleId = null;
let dragState = null;

function hydrateWizard(s) {
  $("cols").value = s.surface.cols ?? 12;
  $("rows").value = s.surface.rows ?? 12;
  $("themeMode").value = s.surface.themeMode ?? "space";
  $("accentPreset").value = s.surface.accentPreset ?? "auto";

  // Update channel names based on theme
  const mode = s.surface.themeMode ?? "space";
  updateChannelNames(mode);

  buildWizardCanvas(s.surface.cols, s.surface.rows, s.layout || []);
  refreshSelectedPanel();
}

function buildWizardCanvas(cols, rows, modules) {
  const grid = $("wizardGrid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  // Track occupied cells
  const occupied = new Set();
  (modules || []).forEach((m) => {
    const w = m.w || 1;
    const h = m.h || 1;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        occupied.add(`${m.x + c},${m.y + r}`);
      }
    }
  });

  // Create all cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.className = "wizCell";
      cell.dataset.x = c;
      cell.dataset.y = r;
      const key = `${c},${r}`;
      if (occupied.has(key)) {
        cell.style.display = "none"; // Hide cells that are part of a module
        cell.classList.add("occupied");
      } else {
        cell.classList.remove("occupied");
      }
      grid.appendChild(cell);
    }
  }

  // Place modules (only on the top-left cell)
  (modules || []).forEach((m) => {
    const cell = grid.children[m.y * cols + m.x];
    if (cell) {
      cell.style.display = "block";
      cell.classList.add("sel");
      const w = m.w || 1;
      const h = m.h || 1;
      cell.style.gridColumn = `span ${w}`;
      cell.style.gridRow = `span ${h}`;
      cell.dataset.span = `${w}×${h}`;
      const tag = document.createElement("div");
      tag.className = "wizTag";
      tag.textContent = getModuleIcon(m.type);
      cell.appendChild(tag);
      cell.dataset.mid = m.id;
    }
  });

  // Add click handlers
  Array.from(grid.children).forEach((cell) => {
    if (cell.style.display === "none") return; // Skip hidden cells
    cell.addEventListener("click", (e) => {
      ensureAudio();
      const mid = cell.dataset.mid;
      if (mid) {
        playJoyousBell(523, 0.25);
        selectedModuleId = mid;
        buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
        refreshSelectedPanel();
      } else {
        // Click empty cell to add module (only if not occupied)
        if (!state) state = defaultState(cols, rows);
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);

        // Check if this cell is already occupied
        const occupied = getOccupiedCells(state.layout || []);
        if (occupied.has(`${x},${y}`)) {
          return; // Cell is occupied, don't place module
        }

        playAscendingSound(220, 0.3);
        const newId = `m${Date.now()}`;
        state.layout = state.layout || [];
        state.layout.push({
          id: newId,
          type: "ActionButton",
          x,
          y,
          w: 1,
          h: 1,
          styleChannel: "magenta",
          value: 0,
          locked: false,
        });
        selectedModuleId = newId;
        buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
        refreshSelectedPanel();
        renderSurface(state);
        autoPushState();
      }
    });
  });
}

function getModuleIcon(type) {
  const icons = {
    PhosphorScreen: "▦",
    ReadoutScreen: "▤",
    GlyphTag: "▥",
    ActionButton: "●",
    ToggleSwitch: "▬",
    FaderBank: "▮",
    RotaryDial: "◌",
    Arrow: "▸",
    IndicatorPips: "▴",
  };
  return icons[type] || "□";
}

function refreshSelectedPanel() {
  const none = $("noneSelected");
  const panel = $("selectedPanel");

  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) {
    none.classList.remove("hidden");
    panel.classList.add("hidden");
    selectedModuleId = null;
    return;
  }

  none.classList.add("hidden");
  panel.classList.remove("hidden");

  $("selType").value = m.type || "ActionButton";

  // Update channel names based on current theme before setting value
  const mode = state?.surface?.themeMode || "space";
  updateChannelNames(mode);

  $("selChannel").value = m.styleChannel || "magenta";
  $("selX").value = m.x ?? 0;
  $("selY").value = m.y ?? 0;
  $("selW").value = m.w ?? 1;
  $("selH").value = m.h ?? 1;
  $("selValue").value = m.value ?? 0.5;

  // Type-specific properties
  if (m.type === "PhosphorScreen") {
    // Ensure mode is set - default to particles if not set
    const mode = m.mode || "particles";
    m.mode = mode; // Ensure it's stored in the module
    $("selMode").value = mode;
    $("selModeRow").classList.remove("hidden");
  } else {
    $("selModeRow").classList.add("hidden");
  }
  if (m.type === "ReadoutScreen") {
    $("selLines").value = (m.lines || []).join("\n");
    $("selLinesRow").classList.remove("hidden");
  } else {
    $("selLinesRow").classList.add("hidden");
  }
  if (m.type === "FaderBank") {
    // Determine orientation: use stored value, or infer from dimensions, or default to horizontal
    let orientation = m.orientation;
    if (!orientation) {
      if (m.w > m.h) {
        orientation = "horizontal";
      } else if (m.h > m.w) {
        orientation = "vertical";
      } else {
        // 1x1: use stored orientation or default to horizontal
        orientation = m.orientation || "horizontal";
      }
    }
    m.orientation = orientation; // Store it
    $("selOrientation").value = orientation;
    $("selOrientationRow").classList.remove("hidden");
    // Update orientation options for FaderBank
    const selOrientation = $("selOrientation");
    selOrientation.innerHTML =
      '<option value="horizontal">Horizontal</option><option value="vertical">Vertical</option>';
  } else if (m.type === "Arrow") {
    // Arrow uses arrow orientations: up, right, down, left
    // Preserve existing orientation, only set default if truly missing
    // Don't overwrite if it's already set (even if it's "up")
    if (m.orientation === undefined || m.orientation === null) {
      m.orientation = "up";
    }
    const orientation = m.orientation;
    $("selOrientation").value = orientation;
    $("selOrientationRow").classList.remove("hidden");
    // Update orientation options for Arrow
    const selOrientation = $("selOrientation");
    selOrientation.innerHTML =
      '<option value="up">Up</option><option value="right">Right</option><option value="down">Down</option><option value="left">Left</option>';
  } else {
    $("selOrientationRow").classList.add("hidden");
  }
  if (m.type === "GlyphTag") {
    const label = m.label || "THT/31";
    if (
      [
        "THT/31",
        "SYS/01",
        "NET/12",
        "CTL/05",
        "IO/08",
        "PRC/22",
        "DBG/99",
      ].includes(label)
    ) {
      $("selLabel").value = label;
      $("selCustomLabelRow").classList.add("hidden");
    } else {
      $("selLabel").value = "CUSTOM";
      $("selCustomLabel").value = label;
      $("selCustomLabelRow").classList.remove("hidden");
    }
    $("selLabelRow").classList.remove("hidden");
  } else {
    $("selLabelRow").classList.add("hidden");
    $("selCustomLabelRow").classList.add("hidden");
  }
  // FaderBank is now a single slider, no fader count needed
  $("selFaderCountRow").classList.add("hidden");

  // Show payload input for interactive components (buttons, toggles, etc.)
  if (m.type === "ActionButton" || m.type === "ToggleSwitch" || m.type === "Arrow") {
    $("selPayloadRow").classList.remove("hidden");
    const payloadText = m.payload ? (typeof m.payload === "string" ? m.payload : JSON.stringify(m.payload, null, 2)) : "";
    $("selPayload").value = payloadText;
  } else {
    $("selPayloadRow").classList.add("hidden");
  }

  // Enable/disable width/height inputs based on component type
  const canSpan =
    m.type === "FaderBank" ||
    m.type === "PhosphorScreen" ||
    m.type === "ActionButton" ||
    m.type === "RotaryDial";

  if (m.type === "FaderBank") {
    // For slider: allow both width and height to be changed, orientation will auto-adjust
    $("selW").disabled = false;
    $("selH").disabled = false;
  } else {
    $("selW").disabled = !canSpan;
    $("selH").disabled =
      m.type !== "PhosphorScreen" &&
      m.type !== "ActionButton" &&
      m.type !== "RotaryDial";
  }
}

$("selType").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playJoyousBell(392, 0.25);
  const oldType = m.type;
  m.type = $("selType").value;

  // If changing to Arrow, set default orientation to "up" if not already set
  if (m.type === "Arrow" && !m.orientation) {
    m.orientation = "up";
  }

  // Reset width/height for non-spanning components
  if (
    m.type !== "FaderBank" &&
    m.type !== "PhosphorScreen" &&
    m.type !== "ActionButton" &&
    m.type !== "RotaryDial"
  ) {
    m.w = 1;
    m.h = 1;
  }
  // For slider: auto-determine orientation based on dimensions
  if (m.type === "FaderBank") {
    const orientation =
      m.w > m.h
        ? "horizontal"
        : m.h > m.w
        ? "vertical"
        : m.orientation || "horizontal";
    m.orientation = orientation;
    // Lock the smaller dimension to 1
    if (orientation === "horizontal") {
      m.h = 1; // Lock height to 1 for horizontal
    } else {
      m.w = 1; // Lock width to 1 for vertical
    }
  }

  // Update UI
  $("selW").value = m.w ?? 1;
  $("selH").value = m.h ?? 1;
  $("selW").disabled =
    m.type !== "FaderBank" &&
    m.type !== "PhosphorScreen" &&
    m.type !== "ActionButton" &&
    m.type !== "RotaryDial";
  $("selH").disabled =
    m.type !== "PhosphorScreen" &&
    m.type !== "ActionButton" &&
    m.type !== "RotaryDial" &&
    m.type !== "FaderBank";

  buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
  refreshSelectedPanel();
  renderSurface(state);
  autoPushState();
});

$("selChannel").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playEtherealClick(523, 0.2);
  m.styleChannel = $("selChannel").value;
  renderSurface(state);
  autoPushState();
});

$("selX").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playEtherealClick(440, 0.15);
  const newX = Math.max(
    0,
    Math.min(state.surface.cols - (m.w || 1), parseInt($("selX").value) || 0)
  );
  const w = m.w || 1;
  const h = m.h || 1;
  const y = m.y || 0;

  // Check collision before updating
  if (!checkCollision(state.layout || [], newX, y, w, h, m.id)) {
    m.x = newX;
    buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
    renderSurface(state);
    autoPushState();
  } else {
    // Revert to original value if collision
    $("selX").value = m.x ?? 0;
  }
});

$("selY").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playEtherealClick(440, 0.15);
  const newY = Math.max(
    0,
    Math.min(state.surface.rows - (m.h || 1), parseInt($("selY").value) || 0)
  );
  const w = m.w || 1;
  const h = m.h || 1;
  const x = m.x || 0;

  // Check collision before updating
  if (!checkCollision(state.layout || [], x, newY, w, h, m.id)) {
    m.y = newY;
    buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
    renderSurface(state);
    autoPushState();
  } else {
    // Revert to original value if collision
    $("selY").value = m.y ?? 0;
  }
});

$("selW").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;

  // Only allow width changes for Slider, PhosphorScreen, ActionButton, and RotaryDial
  if (
    m.type !== "FaderBank" &&
    m.type !== "PhosphorScreen" &&
    m.type !== "ActionButton" &&
    m.type !== "RotaryDial"
  ) {
    $("selW").value = m.w ?? 1;
    return;
  }

  ensureAudio();
  playEtherealClick(494, 0.15);

  const x = m.x || 0;
  const y = m.y || 0;
  const h = m.h || 1;
  const maxW = state.surface.cols - x;
  let newW = Math.max(1, Math.min(maxW, parseInt($("selW").value) || 1));

  // For slider: auto-adjust orientation based on which dimension is larger
  if (m.type === "FaderBank") {
    // Determine new orientation based on new width vs current height
    if (newW > h) {
      // Width is larger: horizontal orientation, lock height to 1
      m.orientation = "horizontal";
      m.h = 1;
      $("selH").value = 1;
    } else if (h > newW) {
      // Height is larger: vertical orientation, but we're changing width
      // Keep current orientation if it was vertical, otherwise switch
      if (m.orientation === "vertical") {
        // Already vertical, but width can't be > 1, so cap it
        m.w = 1;
        newW = 1;
        $("selW").value = 1;
      } else {
        // Was horizontal, switching to vertical
        m.orientation = "vertical";
        m.w = 1;
        newW = 1;
        $("selW").value = 1;
      }
    } else {
      // Equal dimensions: keep current orientation or default to horizontal
      m.orientation = m.orientation || "horizontal";
      if (m.orientation === "horizontal") {
        m.h = 1;
        $("selH").value = 1;
      } else {
        m.w = 1;
        newW = 1;
        $("selW").value = 1;
      }
    }

    // Update orientation selector
    $("selOrientation").value = m.orientation;
  }

  // Check collision before updating
  if (!checkCollision(state.layout || [], x, y, newW, h, m.id)) {
    m.w = newW;
    buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
    renderSurface(state);
    autoPushState();
  } else {
    // Revert to original value if collision
    $("selW").value = m.w ?? 1;
  }
});

$("selH").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;

  // Only allow height changes for PhosphorScreen, ActionButton, RotaryDial, and FaderBank
  if (
    m.type !== "PhosphorScreen" &&
    m.type !== "ActionButton" &&
    m.type !== "RotaryDial" &&
    m.type !== "FaderBank"
  ) {
    $("selH").value = m.h ?? 1;
    return;
  }

  ensureAudio();
  playEtherealClick(494, 0.15);

  const x = m.x || 0;
  const y = m.y || 0;
  const w = m.w || 1;
  const maxH = state.surface.rows - y;
  let newH = Math.max(1, Math.min(maxH, parseInt($("selH").value) || 1));

  // For slider: auto-adjust orientation based on which dimension is larger
  if (m.type === "FaderBank") {
    // Determine new orientation based on current width vs new height
    if (newH > w) {
      // Height is larger: vertical orientation, lock width to 1
      m.orientation = "vertical";
      m.w = 1;
      $("selW").value = 1;
    } else if (w > newH) {
      // Width is larger: horizontal orientation, but we're changing height
      // Keep current orientation if it was horizontal, otherwise switch
      if (m.orientation === "horizontal") {
        // Already horizontal, but height can't be > 1, so cap it
        m.h = 1;
        newH = 1;
        $("selH").value = 1;
      } else {
        // Was vertical, switching to horizontal
        m.orientation = "horizontal";
        m.h = 1;
        newH = 1;
        $("selH").value = 1;
      }
    } else {
      // Equal dimensions: keep current orientation or default to horizontal
      m.orientation = m.orientation || "horizontal";
      if (m.orientation === "horizontal") {
        m.h = 1;
        newH = 1;
        $("selH").value = 1;
      } else {
        m.w = 1;
        $("selW").value = 1;
      }
    }

    // Update orientation selector
    $("selOrientation").value = m.orientation;
  }

  // Check collision before updating
  if (!checkCollision(state.layout || [], x, y, w, newH, m.id)) {
    m.h = newH;
    buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
    renderSurface(state);
    autoPushState();
  } else {
    // Revert to original value if collision
    $("selH").value = m.h ?? 1;
  }
});

$("selValue").addEventListener("input", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  const val = clamp01(Number($("selValue").value));
  m.value = val;
  renderSurface(state);
  autoPushState();
});

$("selMode").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playJoyousBell(440, 0.25);
  // Update mode and ensure it persists
  m.mode = $("selMode").value;

  // Force immediate render to show mode change
  renderSurface(state);
  // Push state immediately to sync across platforms
  autoPushState();
});

$("selLines").addEventListener("input", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playEtherealClick(523, 0.12);
  m.lines = $("selLines")
    .value.split("\n")
    .filter((l) => l.trim());
  renderSurface(state);
  autoPushState();
});

$("selPayload").addEventListener("input", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  const payloadText = $("selPayload").value.trim();
  if (payloadText) {
    try {
      // Validate JSON
      const parsed = JSON.parse(payloadText);
      m.payload = parsed; // Store as object
      ensureAudio();
      playEtherealClick(523, 0.1);
    } catch (e) {
      // Invalid JSON - store as string for now, will be validated on send
      m.payload = payloadText;
    }
  } else {
    delete m.payload;
  }
  autoPushState();
});

$("selFaderCount").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  const count = Math.max(
    1,
    Math.min(8, parseInt($("selFaderCount").value) || 3)
  );
  m.values = Array(count)
    .fill(0)
    .map(() => Math.random() * 0.5 + 0.25);
});

$("selOrientation").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playJoyousBell(392, 0.25);
  const orientation = $("selOrientation").value;
  m.orientation = orientation; // Save orientation to module object

  // For Arrow, update immediately and re-render
  if (m.type === "Arrow") {
    // Update immediately in DOM if element exists
    const moduleEl = document.querySelector(`[data-mid="${m.id}"]`);
    if (moduleEl) {
      const arrow = moduleEl.querySelector(".arrowShape");
      if (arrow) {
        arrow.setAttribute("data-orientation", orientation);
      }
    }
    // Re-render the entire surface to ensure consistency
    renderSurface(state);
    autoPushState();
    return;
  }

  // Enforce orientation constraints: horizontal locks height to 1, vertical locks width to 1
  if (orientation === "horizontal") {
    m.h = 1;
  } else {
    m.w = 1;
  }

  $("selW").value = m.w ?? 1;
  $("selH").value = m.h ?? 1;
  buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
  renderSurface(state);
  autoPushState();
});

$("selLabel").addEventListener("change", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playEtherealClick(523, 0.2);
  const labelValue = $("selLabel").value;
  if (labelValue === "CUSTOM") {
    $("selCustomLabelRow").classList.remove("hidden");
    m.label = $("selCustomLabel").value || "THT/31";
  } else {
    $("selCustomLabelRow").classList.add("hidden");
    m.label = labelValue;
  }
  renderSurface(state);
  autoPushState();
});

$("selCustomLabel").addEventListener("input", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playEtherealClick(523, 0.1);
  m.label = $("selCustomLabel").value || "THT/31";
  renderSurface(state);
  autoPushState();
});

$("deleteSel").addEventListener("click", () => {
  if (!state || !selectedModuleId) return;
  ensureAudio();
  playVibrationSound(330, 0.25);
  state.layout = (state.layout || []).filter((x) => x.id !== selectedModuleId);
  selectedModuleId = null;
  buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
  refreshSelectedPanel();
  renderSurface(state);
  autoPushState();
});

$("toggleLock").addEventListener("click", () => {
  const m = (state?.layout || []).find((x) => x.id === selectedModuleId);
  if (!m) return;
  ensureAudio();
  playEtherealClick(440, 0.2);
  m.locked = !m.locked;
});

$("clearAll").addEventListener("click", () => {
  if (!state) return;
  ensureAudio();
  playDroneSound(220, 0.4);
  state.layout = [];
  selectedModuleId = null;
  buildWizardCanvas(state.surface.cols, state.surface.rows, state.layout);
  refreshSelectedPanel();
  renderSurface(state);
  autoPushState();
});

// Generate random layout with no collisions
function generateRandomLayout(cols, rows) {
  const layout = [];
  const occupied = new Set();
  const moduleIdCounter = { count: 0 };

  // All available component types
  const componentTypes = [
    "PhosphorScreen",
    "ReadoutScreen",
    "GlyphTag",
    "ActionButton",
    "ToggleSwitch",
    "FaderBank",
    "RotaryDial",
    "Arrow",
    "IndicatorPips",
  ];

  // Get random size constraints for each component type
  function getRandomSize(type, cols, rows) {
    let minW = 1,
      maxW = 1,
      minH = 1,
      maxH = 1;

    switch (type) {
      case "PhosphorScreen":
        minW = 3;
        maxW = Math.min(8, cols);
        minH = 2;
        maxH = Math.min(6, rows);
        break;
      case "ReadoutScreen":
        minW = 2;
        maxW = Math.min(4, cols);
        minH = 2;
        maxH = Math.min(4, rows);
        break;
      case "GlyphTag":
        minW = 1;
        maxW = Math.min(3, cols);
        minH = 1;
        maxH = 1;
        break;
      case "ActionButton":
        minW = 1;
        maxW = Math.min(2, cols);
        minH = 1;
        maxH = Math.min(2, rows);
        break;
      case "ToggleSwitch":
        minW = 1;
        maxW = 1;
        minH = 1;
        maxH = 1;
        break;
      case "FaderBank":
        minW = 2;
        maxW = Math.min(6, cols);
        minH = 1;
        maxH = Math.min(4, rows);
        break;
      case "RotaryDial":
        minW = 1;
        maxW = Math.min(3, cols);
        minH = 1;
        maxH = Math.min(3, rows);
        break;
      case "Arrow":
        minW = 1;
        maxW = 1;
        minH = 1;
        maxH = Math.min(3, rows);
        break;
      case "IndicatorPips":
        minW = 1;
        maxW = 1;
        minH = 2;
        maxH = Math.min(6, rows);
        break;
    }

    const w = Math.floor(Math.random() * (maxW - minW + 1)) + minW;
    const h = Math.floor(Math.random() * (maxH - minH + 1)) + minH;
    return { w, h };
  }

  // Try to find a valid position for a component
  function findValidPosition(w, h, cols, rows, maxAttempts = 100) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.floor(Math.random() * (cols - w + 1));
      const y = Math.floor(Math.random() * (rows - h + 1));

      // Check if position is available
      let canPlace = true;
      for (let r = 0; r < h && canPlace; r++) {
        for (let c = 0; c < w && canPlace; c++) {
          const key = `${x + c},${y + r}`;
          if (occupied.has(key)) {
            canPlace = false;
          }
        }
      }

      if (canPlace) {
        // Mark cells as occupied
        for (let r = 0; r < h; r++) {
          for (let c = 0; c < w; c++) {
            occupied.add(`${x + c},${y + r}`);
          }
        }
        return { x, y };
      }
    }
    return null; // Couldn't find a position
  }

  // Helper function to create a module with type-specific properties
  function createModuleWithType(type, x, y, w, h, idCounter) {
    const module = {
      id: `module_${idCounter.count++}`,
      type,
      x,
      y,
      w,
      h,
      styleChannel: Math.random() > 0.5 ? "teal" : "magenta",
      value: Math.random(),
    };

    // Type-specific properties
    switch (type) {
      case "PhosphorScreen":
        const modes = [
          "particles",
          "custom",
          "flocking",
          "contour",
          "grid",
          "blank",
        ];
        module.mode = modes[Math.floor(Math.random() * modes.length)];
        break;
      case "ReadoutScreen":
        const lineCount = Math.floor(Math.random() * 4) + 2;
        module.lines = Array(lineCount)
          .fill(0)
          .map(() => {
            const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            return Array(8)
              .fill(0)
              .map(() => chars[Math.floor(Math.random() * chars.length)])
              .join("");
          });
        break;
      case "GlyphTag":
        const labels = [
          "THT/31",
          "SYS/01",
          "NET/12",
          "CTL/05",
          "IO/08",
          "PRC/22",
          "DBG/99",
        ];
        module.label = labels[Math.floor(Math.random() * labels.length)];
        break;
      case "FaderBank":
        module.orientation = w > h ? "horizontal" : "vertical";
        module.values = Array(Math.floor(Math.random() * 5) + 2)
          .fill(0)
          .map(() => Math.random());
        break;
      case "Arrow":
        const orientations = ["up", "right", "down", "left"];
        module.orientation =
          orientations[Math.floor(Math.random() * orientations.length)];
        break;
      case "IndicatorPips":
        const pipCount = Math.floor(Math.random() * 5) + 3;
        module.values = Array(pipCount)
          .fill(0)
          .map(() => (Math.random() > 0.5 ? 1 : 0));
        break;
    }

    return module;
  }

  // Generate more components to fill the board - aim for 70-90% coverage
  const totalCells = cols * rows;
  const targetCoverage = 0.7 + Math.random() * 0.2; // 70-90% coverage
  const targetCells = Math.floor(totalCells * targetCoverage);

  // Calculate how many components we need (estimate based on average size)
  // Use a mix of small (1x1) and larger components
  const numComponents = Math.min(
    Math.floor(targetCells / 1.5) + Math.floor(Math.random() * 15),
    totalCells // Never exceed total cells
  );

  // Create a pool of component types with weights (more small components)
  const componentPool = [];
  // Add many small components (1x1)
  for (let i = 0; i < numComponents * 0.4; i++) {
    const smallTypes = ["ActionButton", "ToggleSwitch", "Arrow", "GlyphTag"];
    componentPool.push(
      smallTypes[Math.floor(Math.random() * smallTypes.length)]
    );
  }
  // Add medium components - 30% of pool
  for (let i = 0; i < numComponents * 0.3; i++) {
    const mediumTypes = [
      "ReadoutScreen",
      "RotaryDial",
      "IndicatorPips",
      "FaderBank",
    ];
    componentPool.push(
      mediumTypes[Math.floor(Math.random() * mediumTypes.length)]
    );
  }
  // Add large components - 20% of pool
  for (let i = 0; i < numComponents * 0.2; i++) {
    componentPool.push("PhosphorScreen");
  }

  // Shuffle the pool
  const shuffledTypes = componentPool.sort(() => Math.random() - 0.5);

  let placedCells = 0;
  let attempts = 0;
  const maxAttempts = numComponents * 5; // Allow many more attempts

  for (let i = 0; i < shuffledTypes.length && attempts < maxAttempts; i++) {
    attempts++;
    const type = shuffledTypes[i];
    const { w, h } = getRandomSize(type, cols, rows);
    const position = findValidPosition(w, h, cols, rows);

    if (!position) {
      // If we can't place this size, try progressively smaller sizes
      if (w > 1 || h > 1) {
        // Try half size
        const smallerW = Math.max(1, Math.floor(w * 0.5));
        const smallerH = Math.max(1, Math.floor(h * 0.5));
        const retryPosition = findValidPosition(smallerW, smallerH, cols, rows);
        if (retryPosition) {
          const module = createModuleWithType(
            type,
            retryPosition.x,
            retryPosition.y,
            smallerW,
            smallerH,
            moduleIdCounter
          );
          if (module) {
            layout.push(module);
            placedCells += smallerW * smallerH;
            // Mark cells as occupied
            for (let r = 0; r < smallerH; r++) {
              for (let c = 0; c < smallerW; c++) {
                occupied.add(`${retryPosition.x + c},${retryPosition.y + r}`);
              }
            }
          }
        } else if (
          type === "ActionButton" ||
          type === "ToggleSwitch" ||
          type === "Arrow" ||
          type === "GlyphTag"
        ) {
          // For small components, try 1x1
          const tinyPosition = findValidPosition(1, 1, cols, rows);
          if (tinyPosition) {
            const module = createModuleWithType(
              type,
              tinyPosition.x,
              tinyPosition.y,
              1,
              1,
              moduleIdCounter
            );
            if (module) {
              layout.push(module);
              placedCells += 1;
              occupied.add(`${tinyPosition.x},${tinyPosition.y}`);
            }
          }
        }
      }
      continue; // Skip if no valid position found
    }

    const module = createModuleWithType(
      type,
      position.x,
      position.y,
      w,
      h,
      moduleIdCounter
    );

    if (module) {
      layout.push(module);
      placedCells += w * h;
    }
  }

  // Fill remaining gaps with small 1x1 components to maximize coverage
  const remainingCells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occupied.has(`${x},${y}`)) {
        remainingCells.push({ x, y });
      }
    }
  }

  // Shuffle remaining cells and fill up to 90% of remaining space
  const shuffledRemaining = remainingCells.sort(() => Math.random() - 0.5);
  const smallTypes = ["ActionButton", "ToggleSwitch", "Arrow", "GlyphTag"];
  const fillTarget = Math.min(
    shuffledRemaining.length,
    Math.floor(remainingCells.length * 0.9)
  );

  for (let i = 0; i < fillTarget; i++) {
    const cell = shuffledRemaining[i];
    const type = smallTypes[Math.floor(Math.random() * smallTypes.length)];
    const module = createModuleWithType(
      type,
      cell.x,
      cell.y,
      1,
      1,
      moduleIdCounter
    );
    if (module) {
      layout.push(module);
      occupied.add(`${cell.x},${cell.y}`);
    }
  }

  return layout;
}

$("seed").addEventListener("click", () => {
  ensureAudio();
  playAscendingSound(220, 0.4);
  const cols = Number($("cols").value || 12);
  const rows = Number($("rows").value || 12);
  state = defaultState(cols, rows);
  state.surface.themeMode = $("themeMode").value;
  state.surface.accentPreset = $("accentPreset").value;

  // Generate completely random layout
  state.layout = generateRandomLayout(cols, rows);

  // Select first component if any exist
  selectedModuleId = state.layout.length > 0 ? state.layout[0].id : null;

  applyThemeFromState(state);
  hydrateWizard(state);
  renderSurface(state);
  autoPushState();
});

// Helper function to automatically push state changes
function autoPushState() {
  if (!state) {
    const cols = Number($("cols").value || 12);
    const rows = Number($("rows").value || 12);
    state = defaultState(cols, rows);
  }
  // Ensure state is synced with current UI values
  state.surface.cols = Number($("cols").value || 12);
  state.surface.rows = Number($("rows").value || 12);
  state.surface.themeMode = $("themeMode").value;
  state.surface.accentPreset = $("accentPreset").value;
  socket.emit("wizard:push_state", { state });
}

// Auto-update grid when cols/rows change
$("cols").addEventListener("change", () => {
  ensureAudio();
  playJoyousBell(440, 0.25);
  const cols = Number($("cols").value || 12);
  const rows = Number($("rows").value || 12);
  if (!state) state = defaultState(cols, rows);
  state.surface.cols = cols;
  state.surface.rows = rows;

  // Clamp module positions and remove overlaps
  const validLayout = [];
  const occupied = new Set();

  (state.layout || []).forEach((m) => {
    let x = Math.max(0, Math.min(cols - 1, m.x || 0));
    let y = Math.max(0, Math.min(rows - 1, m.y || 0));
    let w = Math.max(1, Math.min(cols - x, m.w || 1));
    let h = Math.max(1, Math.min(rows - y, m.h || 1));

    // Check if this position is available
    let canPlace = true;
    for (let r = 0; r < h && canPlace; r++) {
      for (let c = 0; c < w && canPlace; c++) {
        const key = `${x + c},${y + r}`;
        if (occupied.has(key)) {
          canPlace = false;
        }
      }
    }

    if (canPlace) {
      // Mark cells as occupied
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          occupied.add(`${x + c},${y + r}`);
        }
      }
      m.x = x;
      m.y = y;
      m.w = w;
      m.h = h;
      validLayout.push(m);
    }
    // If can't place, module is dropped (removed from layout)
  });

  state.layout = validLayout;
  hydrateWizard(state);
  renderSurface(state);
  autoPushState();
});

$("rows").addEventListener("change", () => {
  ensureAudio();
  playJoyousBell(440, 0.25);
  const cols = Number($("cols").value || 12);
  const rows = Number($("rows").value || 12);
  if (!state) state = defaultState(cols, rows);
  state.surface.cols = cols;
  state.surface.rows = rows;

  // Clamp module positions and remove overlaps
  const validLayout = [];
  const occupied = new Set();

  (state.layout || []).forEach((m) => {
    let x = Math.max(0, Math.min(cols - 1, m.x || 0));
    let y = Math.max(0, Math.min(rows - 1, m.y || 0));
    let w = Math.max(1, Math.min(cols - x, m.w || 1));
    let h = Math.max(1, Math.min(rows - y, m.h || 1));

    // Check if this position is available
    let canPlace = true;
    for (let r = 0; r < h && canPlace; r++) {
      for (let c = 0; c < w && canPlace; c++) {
        const key = `${x + c},${y + r}`;
        if (occupied.has(key)) {
          canPlace = false;
        }
      }
    }

    if (canPlace) {
      // Mark cells as occupied
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          occupied.add(`${x + c},${y + r}`);
        }
      }
      m.x = x;
      m.y = y;
      m.w = w;
      m.h = h;
      validLayout.push(m);
    }
    // If can't place, module is dropped (removed from layout)
  });

  state.layout = validLayout;
  hydrateWizard(state);
  renderSurface(state);
  autoPushState();
});

$("themeMode").addEventListener("change", () => {
  if (!state) state = defaultState();
  ensureAudio();
  playAscendingSound(220, 0.35);
  state.surface.themeMode = $("themeMode").value;
  applyThemeFromState(state);
  autoPushState();
});
$("accentPreset").addEventListener("change", () => {
  if (!state) state = defaultState();
  ensureAudio();
  playJoyousBell(523, 0.25);
  state.surface.accentPreset = $("accentPreset").value;
  applyThemeFromState(state);
  autoPushState();
});

// ---------- Console renderer ----------
function renderSurface(s) {
  const root = $("surfaceRoot");
  root.innerHTML = "";
  if (!s?.surface) return;

  const cols = s.surface.cols || 12;
  const rows = s.surface.rows || 12;

  const chassis = document.createElement("div");
  chassis.className = "consoleChassis";
  chassis.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  chassis.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  root.appendChild(chassis);

  // Filter out overlapping modules (keep first occurrence)
  const validModules = [];
  const occupied = new Set();

  (s.layout || []).forEach((m) => {
    const x = m.x || 0;
    const y = m.y || 0;
    const w = m.w || 1;
    const h = m.h || 1;

    // Check if this module overlaps
    let canPlace = true;
    for (let r = 0; r < h && canPlace; r++) {
      for (let c = 0; c < w && canPlace; c++) {
        const key = `${x + c},${y + r}`;
        if (occupied.has(key)) {
          canPlace = false;
        }
      }
    }

    if (canPlace) {
      // Mark cells as occupied
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          occupied.add(`${x + c},${y + r}`);
        }
      }
      validModules.push(m);
    }
  });

  validModules.forEach((m) => {
    const moduleEl = document.createElement("div");
    moduleEl.className = "module";
    moduleEl.style.gridColumn = `${(m.x || 0) + 1} / span ${m.w || 1}`;
    moduleEl.style.gridRow = `${(m.y || 0) + 1} / span ${m.h || 1}`;
    moduleEl.dataset.mid = m.id;
    if (m.locked) moduleEl.classList.add("locked");

    // Mount component based on type
    if (m.type === "PhosphorScreen") mountPhosphorScreen(moduleEl, m);
    else if (m.type === "ReadoutScreen") mountReadoutScreen(moduleEl, m);
    else if (m.type === "GlyphTag") mountGlyphTag(moduleEl, m);
    else if (m.type === "ActionButton") mountActionButton(moduleEl, m);
    else if (m.type === "ToggleSwitch") mountToggleSwitch(moduleEl, m);
    else if (m.type === "FaderBank") mountFaderBank(moduleEl, m);
    else if (m.type === "RotaryDial") mountRotaryDial(moduleEl, m);
    else if (m.type === "Arrow") mountArrow(moduleEl, m);
    else if (m.type === "IndicatorPips") mountIndicatorPips(moduleEl, m);

    chassis.appendChild(moduleEl);
  });
}

function sendEvent(id, etype, value, payload = null) {
  eventManager.sendModuleEvent(id, etype, value, payload);
}

function glowPulse(el, isMagenta = false) {
  el.classList.add(isMagenta ? "glowMagenta" : "glow");
  window.setTimeout(() => {
    el.classList.remove("glow", "glowMagenta");
  }, 140);
}

// ---------- Component mounters ----------
function mountPhosphorScreen(el, m) {
  // Clear any existing content to ensure clean mount
  // This is critical for proper updates on both desktop and mobile
  el.innerHTML = "";
  el.classList.add("phosphorScreen");
  const content = document.createElement("div");
  content.className = "phosphorContent";
  el.appendChild(content);

  // Ensure mode is set - default to particles if not set
  const mode = m.mode || "particles";
  m.mode = mode; // Ensure it's stored in the module

  // Force a reflow to ensure content is properly laid out before mounting
  // This helps with mobile rendering issues
  void content.offsetHeight;

  if (mode === "particles" || mode === "radar") {
    // Create particle field with variety
    const particleCount = Math.floor((m.w || 1) * (m.h || 1) * 8);
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement("div");
      particle.className = "phosphorParticle";

      // Random size (small, medium, large)
      const sizeType = Math.random();
      if (sizeType < 0.6) {
        particle.classList.add("small");
      } else if (sizeType < 0.9) {
        particle.classList.add("medium");
      } else {
        particle.classList.add("large");
      }

      // Random position
      particle.style.left = `${10 + Math.random() * 80}%`;
      particle.style.top = `${10 + Math.random() * 80}%`;

      // Random flicker timing
      const flickerDelay = Math.random() * 2;
      particle.style.animationDelay = `${flickerDelay}s`;

      // More random movement - multiple waypoints for wandering
      // Much larger range for movement "all over the place"
      const containerWidth = content.offsetWidth || 400;
      const containerHeight = content.offsetHeight || 300;
      const maxMoveX = containerWidth * 0.8; // Can move 80% of container width
      const maxMoveY = containerHeight * 0.8; // Can move 80% of container height

      const moveX1 = (Math.random() - 0.5) * maxMoveX;
      const moveY1 = (Math.random() - 0.5) * maxMoveY;
      const moveX2 = (Math.random() - 0.5) * maxMoveX;
      const moveY2 = (Math.random() - 0.5) * maxMoveY;
      const moveX3 = (Math.random() - 0.5) * maxMoveX;
      const moveY3 = (Math.random() - 0.5) * maxMoveY;
      particle.style.setProperty("--moveX1", `${moveX1}px`);
      particle.style.setProperty("--moveY1", `${moveY1}px`);
      particle.style.setProperty("--moveX2", `${moveX2}px`);
      particle.style.setProperty("--moveY2", `${moveY2}px`);
      particle.style.setProperty("--moveX3", `${moveX3}px`);
      particle.style.setProperty("--moveY3", `${moveY3}px`);

      // Random animation duration for variety (faster movement)
      const moveDuration = 4 + Math.random() * 4; // 4-8 seconds
      particle.style.setProperty("--moveDuration", `${moveDuration}s`);

      content.appendChild(particle);
    }
  } else if (mode === "flocking") {
    mountFlockingMode(content, m);
  } else if (mode === "contour") {
    mountContourMode(content, m);
  } else if (mode === "grid") {
    const grid = document.createElement("div");
    grid.className = "gridMode";
    content.appendChild(grid);
  }
}

// Custom image mode removed - no longer supported
// Function removed for cleaner codebase
  // Clear any existing canvas to ensure clean mount
  const existingCanvas = content.querySelector(".customCanvas");
  if (existingCanvas) {
    // Cancel any running animations
    const existingAnimationId = existingCanvas.dataset.animationId;
    if (existingAnimationId) {
      cancelAnimationFrame(parseInt(existingAnimationId));
    }
    // Check if image has changed - if so, force complete remount
    const existingImageUrl = existingCanvas.dataset.imageUrl || "";
    const newImageUrl = m.customImage || "";
    if (existingImageUrl !== newImageUrl) {
      // Image changed - remove old canvas completely
      existingCanvas.remove();
    } else {
      // Same image - might be a remount due to layout change, still remove to ensure clean state
      existingCanvas.remove();
    }
  }

  const canvas = document.createElement("canvas");
  canvas.className = "customCanvas";
  // Store the image URL in a data attribute to track changes
  canvas.dataset.imageUrl = m.customImage || "";
  // Store module ID to track which module this canvas belongs to
  canvas.dataset.moduleId = m.id || "";
  // Store timestamp to force updates on mobile
  canvas.dataset.mountTime = Date.now().toString();
  content.appendChild(canvas);

  // Force a reflow to ensure canvas is properly laid out
  // This is especially important for mobile devices
  void canvas.offsetHeight;

  let ctx = null;
  let pixelData = null; // Store pixelated grayscale data
  let animationFrameId = null;

  function initCanvas() {
    const w = content.offsetWidth || content.clientWidth;
    const h = content.offsetHeight || content.clientHeight;

    if (w === 0 || h === 0) return false;

    const dpr = window.devicePixelRatio || 1;

    // Always re-initialize context to ensure it's valid
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    return true;
  }

  function processImage(img) {
    // Ensure canvas is initialized
    if (!initCanvas()) {
      // Retry after a short delay if dimensions aren't ready
      setTimeout(() => processImage(img), 50);
      return;
    }

    const w = content.offsetWidth || content.clientWidth;
    const h = content.offsetHeight || content.clientHeight;

    if (w === 0 || h === 0) return;

    // Create offscreen canvas to process image
    const processCanvas = document.createElement("canvas");
    processCanvas.width = w;
    processCanvas.height = h;
    const processCtx = processCanvas.getContext("2d");

    // Stretch image to fill entire canvas (no aspect ratio preservation)
    processCtx.drawImage(img, 0, 0, w, h);

    // Get image data
    const imageData = processCtx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Pixelate: reduce resolution significantly for CRT-like discrete effect with gaps
    // More aggressive pixelation for stronger CRT effect
    const pixelSize = Math.max(4, Math.floor(Math.min(w, h) / 40)); // Larger pixels for more pixelation
    const step = 3; // Larger step size creates more pronounced gaps (CRT square effect)
    const pixelCols = Math.floor(w / step);
    const pixelRows = Math.floor(h / step);

    // Create pixelated grayscale data with discrete sampling (step-based like contours)
    pixelData = new Float32Array(pixelCols * pixelRows);

    for (let py = 0; py < pixelRows; py++) {
      for (let px = 0; px < pixelCols; px++) {
        // Sample at step intervals (creates gaps like contours)
        const sampleX = Math.floor(px * step);
        const sampleY = Math.floor(py * step);

        // Only sample if within bounds
        if (sampleX < w && sampleY < h) {
          const idx = (sampleY * w + sampleX) * 4;

          if (idx < data.length) {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Convert to grayscale - no filters, pass through as-is
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Convert to normalized grayscale - no contrast adjustment, just normalize
            let normalized = gray / 255;

            // Apply darkening curve: make image darker and darker
            // Use inverse gamma to darken (values > 1.0 darken the image)
            normalized = Math.pow(normalized, 1.4); // Darkening curve

            // Use darkened grayscale value
            pixelData[py * pixelCols + px] = Math.max(
              0,
              Math.min(1, normalized)
            );
          }
        } else {
          pixelData[py * pixelCols + px] = 0;
        }
      }
    }

    // Store dimensions for drawing
    pixelData.width = pixelCols;
    pixelData.height = pixelRows;
    pixelData.pixelSize = pixelSize;
    pixelData.step = step;

    // Debug: Count how many pixels will be visible
    let visibleCount = 0;
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i] > 0.05) visibleCount++;
    }
    console.log(
      `Custom image: ${visibleCount} visible pixels out of ${pixelData.length}`
    );

    drawPixels();
  }

  function drawPixels() {
    if (!pixelData || !pixelData.width || !pixelData.height) {
      return;
    }

    // Ensure canvas is initialized
    if (!initCanvas() || !ctx) {
      return;
    }

    const w = content.offsetWidth || content.clientWidth;
    const h = content.offsetHeight || content.clientHeight;

    if (w === 0 || h === 0) return;

    // Clear canvas with dark background
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(0, 0, w, h);

    // Get theme color
    const isHalftone = document.body.classList.contains("theme-halftone");
    const isPoem = document.body.classList.contains("theme-poem");
    const isNetwork = document.body.classList.contains("theme-network");
    const isGlitch = document.body.classList.contains("theme-glitch");

    let r, g, b;
    if (isHalftone) {
      r = 255;
      g = 255;
      b = 255; // White for halftone
    } else if (isPoem) {
      r = 74;
      g = 144;
      b = 226; // Blue for poem
    } else if (isNetwork) {
      r = 135;
      g = 206;
      b = 235; // Light blue for network
    } else if (isGlitch) {
      r = 255;
      g = 140;
      b = 0; // Orange for glitch
    } else {
      r = 0;
      g = 255;
      b = 220; // Teal for space (default)
    }

    const pixelCols = pixelData.width;
    const pixelRows = pixelData.height;
    const pixelSize = pixelData.pixelSize;
    const step = pixelData.step;

    // Draw pixels as discrete square pixels with gaps (like contour pattern)
    for (let py = 0; py < pixelRows; py++) {
      for (let px = 0; px < pixelCols; px++) {
        const intensity = pixelData[py * pixelCols + px];

        // Skip very dark pixels (background) - low threshold for darker effect
        if (intensity < 0.08) continue;

        // Add subtle grain/noise for discrete CRT effect
        const grain = (Math.random() - 0.5) * 0.08; // ±4% variation for subtle effect
        const grainyIntensity = Math.max(0, Math.min(1, intensity + grain));

        // Square pixel size for CRT effect - make squares more pronounced
        // Square size should be smaller than step to create visible gaps (CRT grid effect)
        const squareSize = Math.max(2, Math.floor(pixelSize * 0.7)); // More pronounced squares with gaps

        // Position at step intervals (creates CRT-like grid gaps)
        const x = px * step;
        const y = py * step;

        // Draw square pixel with theme color - darker and darker (especially on desktop)
        // Use lower alpha values to make image darker overall
        // Scale down intensity further to darken the image more aggressively
        const darkenedIntensity = grainyIntensity * 0.5; // Darken by 50% (was 40%)
        // Even lower alpha range for darker effect on desktop
        const alpha = Math.max(0.15, Math.min(0.6, darkenedIntensity)); // Lower alpha range: 0.15-0.6 (was 0.2-0.7)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillRect(Math.floor(x), Math.floor(y), squareSize, squareSize);

        // Add subtle glow only for very bright pixels (minimal phosphor effect)
        // Only show glow for brightest pixels to maintain darker overall appearance
        if (grainyIntensity > 0.8) {
          ctx.shadowBlur = Math.max(1, squareSize * 0.25);
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
          ctx.fillRect(Math.floor(x), Math.floor(y), squareSize, squareSize);
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  function animate() {
    // Re-draw with new grain each frame for animated grain effect
    drawPixels();
    animationFrameId = requestAnimationFrame(animate);
    // Store animation ID on canvas for cleanup
    canvas.dataset.animationId = animationFrameId.toString();
  }

  // Load image from module data if available
  // Always reload when mountCustomMode is called (handles image updates)
  if (
    m.customImage &&
    typeof m.customImage === "string" &&
    m.customImage.length > 0
  ) {
    // Check if image has changed - if so, force reload
    // Always treat as changed if dataset doesn't match or is empty (forces reload on mobile)
    const currentImageUrl = canvas.dataset.imageUrl || "";
    const imageChanged =
      currentImageUrl !== m.customImage || currentImageUrl === "";
    canvas.dataset.imageUrl = m.customImage;
    // Store a timestamp to force reload on mobile
    canvas.dataset.lastUpdate = Date.now().toString();

    // Clear any existing animation
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    pixelData = null; // Clear old pixel data

    // Clear canvas to ensure fresh start
    if (ctx) {
      const w = content.offsetWidth || content.clientWidth;
      const h = content.offsetHeight || content.clientHeight;
      if (w > 0 && h > 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 1)";
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Initialize canvas first
    const tryLoad = () => {
      if (!initCanvas()) {
        // Retry if canvas isn't ready - but limit retries
        setTimeout(tryLoad, 50);
        return;
      }

      // Always load the current image from m.customImage (handles updates)
      const imageToLoad = m.customImage;

      const img = new Image();
      img.crossOrigin = "anonymous"; // Handle CORS if needed
      img.onload = () => {
        // Only process if this is still the current image (prevents race conditions)
        if (
          m.customImage === imageToLoad &&
          canvas.dataset.imageUrl === imageToLoad
        ) {
          // Clear pixel data before processing new image
          pixelData = null;
          processImage(img);
          // Start animation loop for grain effect immediately
          if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
          }
          animate();
        }
      };
      img.onerror = (e) => {
        console.error("Failed to load custom image:", e);
        // If image fails to load, show placeholder
        if (initCanvas() && ctx) {
          const w = content.offsetWidth || content.clientWidth;
          const h = content.offsetHeight || content.clientHeight;
          if (w > 0 && h > 0) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, w, h);
          }
        }
      };
      // Load the image - always add cache-busting to ensure fresh load on all devices
      // This is especially important for mobile devices which may cache more aggressively
      // Always use timestamp for cache busting on mobile, or if image changed
      const cacheBuster =
        imageChanged || !canvas.dataset.lastLoadTime
          ? Date.now()
          : parseInt(canvas.dataset.lastLoadTime) || Date.now();
      canvas.dataset.lastLoadTime = cacheBuster.toString();
      // For data URLs, always add a cache-busting fragment to force reload
      // Mobile browsers can cache data URLs, so we need to force reload
      if (m.customImage.includes("data:")) {
        // Add a fragment with timestamp to force reload of data URLs on mobile
        img.src = m.customImage.split("#")[0] + "#t=" + cacheBuster;
      } else {
        // For other URLs, add query parameter
        img.src =
          m.customImage +
          (m.customImage.includes("?") ? "&" : "?") +
          "t=" +
          cacheBuster;
      }
    };

    // Try loading immediately, with retry if needed
    tryLoad();
  } else {
    // No image yet - show placeholder
    if (initCanvas() && ctx) {
      const w = content.offsetWidth || content.clientWidth;
      const h = content.offsetHeight || content.clientHeight;
      if (w > 0 && h > 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  // Resize observer - only reprocess image on significant size changes
  let lastObservedWidth = 0;
  let lastObservedHeight = 0;
  const resizeObserver = new ResizeObserver(() => {
    const w = content.offsetWidth || content.clientWidth;
    const h = content.offsetHeight || content.clientHeight;

    // Only reprocess if size changed significantly (prevents constant re-processing)
    if (
      m.customImage &&
      (Math.abs(w - lastObservedWidth) > 10 ||
        Math.abs(h - lastObservedHeight) > 10)
    ) {
      lastObservedWidth = w;
      lastObservedHeight = h;

      const img = new Image();
      img.onload = () => {
        processImage(img);
        // Restart animation if it was running
        if (animationFrameId === null) {
          animate();
        }
      };
      img.src = m.customImage;
    }
  });
// Flocking mode - boids algorithm with filled triangles
function mountFlockingMode(content, m) {
  const canvas = document.createElement("canvas");
  canvas.className = "flockingCanvas";
  content.appendChild(canvas);

  const rect = content.getBoundingClientRect();
  canvas.width = rect.width || 400;
  canvas.height = rect.height || 300;

  const ctx = canvas.getContext("2d");
  const boids = [];
  const boidCount = Math.floor((m.w || 1) * (m.h || 1) * 6);

  // Boid class
  class Boid {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 2;
      this.vy = (Math.random() - 0.5) * 2;
      this.maxSpeed = 2;
      this.maxForce = 0.05;
    }

    update(boids, width, height) {
      // Flocking rules
      const separation = this.separate(boids);
      const alignment = this.align(boids);
      const cohesion = this.cohere(boids);

      // Apply forces
      this.vx += separation.x * 1.5 + alignment.x * 1.0 + cohesion.x * 1.0;
      this.vy += separation.y * 1.5 + alignment.y * 1.0 + cohesion.y * 1.0;

      // Limit speed
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed > this.maxSpeed) {
        this.vx = (this.vx / speed) * this.maxSpeed;
        this.vy = (this.vy / speed) * this.maxSpeed;
      }

      // Update position
      this.x += this.vx;
      this.y += this.vy;

      // Wrap around edges
      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }

    separate(boids) {
      const desiredSeparation = 25;
      let steer = { x: 0, y: 0 };
      let count = 0;

      for (const other of boids) {
        const d = Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
        if (d > 0 && d < desiredSeparation) {
          const diff = {
            x: this.x - other.x,
            y: this.y - other.y,
          };
          const len = Math.sqrt(diff.x ** 2 + diff.y ** 2);
          if (len > 0) {
            diff.x /= len;
            diff.y /= len;
            diff.x /= d;
            diff.y /= d;
          }
          steer.x += diff.x;
          steer.y += diff.y;
          count++;
        }
      }

      if (count > 0) {
        steer.x /= count;
        steer.y /= count;
        const len = Math.sqrt(steer.x ** 2 + steer.y ** 2);
        if (len > 0) {
          steer.x /= len;
          steer.y /= len;
          steer.x *= this.maxSpeed;
          steer.y *= this.maxSpeed;
          steer.x -= this.vx;
          steer.y -= this.vy;
          const steerLen = Math.sqrt(steer.x ** 2 + steer.y ** 2);
          if (steerLen > this.maxForce) {
            steer.x = (steer.x / steerLen) * this.maxForce;
            steer.y = (steer.y / steerLen) * this.maxForce;
          }
        }
      }
      return steer;
    }

    align(boids) {
      const neighborDist = 50;
      let sum = { x: 0, y: 0 };
      let count = 0;

      for (const other of boids) {
        const d = Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
        if (d > 0 && d < neighborDist) {
          sum.x += other.vx;
          sum.y += other.vy;
          count++;
        }
      }

      if (count > 0) {
        sum.x /= count;
        sum.y /= count;
        const len = Math.sqrt(sum.x ** 2 + sum.y ** 2);
        if (len > 0) {
          sum.x = (sum.x / len) * this.maxSpeed;
          sum.y = (sum.y / len) * this.maxSpeed;
          sum.x -= this.vx;
          sum.y -= this.vy;
          const steerLen = Math.sqrt(sum.x ** 2 + sum.y ** 2);
          if (steerLen > this.maxForce) {
            sum.x = (sum.x / steerLen) * this.maxForce;
            sum.y = (sum.y / steerLen) * this.maxForce;
          }
        }
      }
      return sum;
    }

    cohere(boids) {
      const neighborDist = 50;
      let sum = { x: 0, y: 0 };
      let count = 0;

      for (const other of boids) {
        const d = Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
        if (d > 0 && d < neighborDist) {
          sum.x += other.x;
          sum.y += other.y;
          count++;
        }
      }

      if (count > 0) {
        sum.x /= count;
        sum.y /= count;
        return this.seek(sum);
      }
      return { x: 0, y: 0 };
    }

    seek(target) {
      const desired = {
        x: target.x - this.x,
        y: target.y - this.y,
      };
      const len = Math.sqrt(desired.x ** 2 + desired.y ** 2);
      if (len > 0) {
        desired.x = (desired.x / len) * this.maxSpeed;
        desired.y = (desired.y / len) * this.maxSpeed;
        desired.x -= this.vx;
        desired.y -= this.vy;
        const steerLen = Math.sqrt(desired.x ** 2 + desired.y ** 2);
        if (steerLen > this.maxForce) {
          desired.x = (desired.x / steerLen) * this.maxForce;
          desired.y = (desired.y / steerLen) * this.maxForce;
        }
      }
      return desired;
    }

    draw(ctx) {
      // Draw small square particle (no rotation needed for squares)
      const size = 2; // Small square size, matching particle mode

      // Theme-aware color for flocking boids
      const isHalftone = document.body.classList.contains("theme-halftone");
      const isPoem = document.body.classList.contains("theme-poem");
      const isNetwork = document.body.classList.contains("theme-network");
      const isGlitch = document.body.classList.contains("theme-glitch");

      let fillColor;
      if (isHalftone) {
        fillColor = "rgba(255, 255, 255, 0.8)"; // White for halftone
      } else if (isPoem) {
        fillColor = "rgba(74, 144, 226, 0.8)"; // Blue for poem
      } else if (isNetwork) {
        fillColor = "rgba(135, 206, 235, 0.8)"; // Light blue for network
      } else if (isGlitch) {
        fillColor = "rgba(255, 140, 0, 0.8)"; // Orange for glitch
      } else {
        fillColor = "rgba(0, 255, 220, 0.8)"; // Teal for space (default)
      }

      ctx.fillStyle = fillColor;
      // Draw square at position (centered)
      ctx.fillRect(this.x - size / 2, this.y - size / 2, size, size);
    }
  }

  // Initialize boids
  for (let i = 0; i < boidCount; i++) {
    boids.push(
      new Boid(Math.random() * canvas.width, Math.random() * canvas.height)
    );
  }

  // Animation loop
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update canvas size if container changed
    const newRect = content.getBoundingClientRect();
    if (newRect.width !== canvas.width || newRect.height !== canvas.height) {
      canvas.width = newRect.width;
      canvas.height = newRect.height;
    }

    // Update and draw boids
    for (const boid of boids) {
      boid.update(boids, canvas.width, canvas.height);
      boid.draw(ctx);
    }

    requestAnimationFrame(animate);
  }

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    const rect = content.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  });
  resizeObserver.observe(content);

  animate();
}

// Contour mode - animated contour lines using Perlin noise
function mountContourMode(content, m) {
  const canvas = document.createElement("canvas");
  canvas.className = "contourCanvas";
  content.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let canvasWidth = 0;
  let canvasHeight = 0;
  let timeOffset = 0;
  let animationFrameId = null;

  // Simple Perlin noise implementation
  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function grad(hash, x, y) {
    const h = hash & 3;
    return h === 0 ? x : h === 1 ? -x : h === 2 ? y : -y;
  }

  // Permutation table for Perlin noise
  const p = [];
  for (let i = 0; i < 256; i++) {
    p[i] = Math.floor(Math.random() * 256);
  }
  const perm = [];
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
  }

  function perlinNoise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];

    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    const result = lerp(x1, x2, v);

    return (result + 1) / 2; // Normalize to 0-1
  }

  // Multi-octave Perlin noise with time offset for animation
  function noise(x, y, time = 0) {
    let value = 0;
    let amplitude = 1;
    let frequency = 0.01;
    let maxValue = 0;

    for (let i = 0; i < 4; i++) {
      // Add time offset to create movement
      value +=
        perlinNoise(x * frequency + time * 0.1, y * frequency + time * 0.15) *
        amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  function drawContours() {
    if (canvasWidth === 0 || canvasHeight === 0) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    // Theme-aware color for contour lines
    const isHalftone = document.body.classList.contains("theme-halftone");
    const isPoem = document.body.classList.contains("theme-poem");
    const isNetwork = document.body.classList.contains("theme-network");
    const isGlitch = document.body.classList.contains("theme-glitch");

    let strokeColor;
    if (isHalftone) {
      strokeColor = "rgba(255, 255, 255, 0.9)"; // White for halftone
    } else if (isPoem) {
      strokeColor = "rgba(74, 144, 226, 0.9)"; // Blue for poem
    } else if (isNetwork) {
      strokeColor = "rgba(135, 206, 235, 0.9)"; // Light blue for network
    } else if (isGlitch) {
      strokeColor = "rgba(255, 140, 0, 0.9)"; // Orange for glitch
    } else {
      strokeColor = "rgba(0, 255, 220, 0.9)"; // Teal for space (default)
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const noiseScale = 0.8;
    const everyN = 8; // Contour spacing (tighter for sharper lines)
    const step = 2; // Step size for line drawing

    // Draw contour lines using marching squares-like approach
    for (let row = 0; row < canvasHeight; row += step) {
      let pathStarted = false;
      ctx.beginPath();

      for (let col = 0; col < canvasWidth; col += step) {
        const n = noise(col * noiseScale, row * noiseScale, timeOffset);
        const noiseInt0To100 = Math.round(n * 100);
        const isIso = noiseInt0To100 % everyN === 0;

        if (isIso) {
          if (!pathStarted) {
            ctx.moveTo(col, row);
            pathStarted = true;
          } else {
            ctx.lineTo(col, row);
          }
        } else {
          if (pathStarted) {
            ctx.stroke();
            ctx.beginPath();
            pathStarted = false;
          }
        }
      }

      if (pathStarted) {
        ctx.stroke();
      }
    }

    // Also draw vertical contour lines for more definition
    for (let col = 0; col < canvasWidth; col += step) {
      let pathStarted = false;
      ctx.beginPath();

      for (let row = 0; row < canvasHeight; row += step) {
        const n = noise(col * noiseScale, row * noiseScale, timeOffset);
        const noiseInt0To100 = Math.round(n * 100);
        const isIso = noiseInt0To100 % everyN === 0;

        if (isIso) {
          if (!pathStarted) {
            ctx.moveTo(col, row);
            pathStarted = true;
          } else {
            ctx.lineTo(col, row);
          }
        } else {
          if (pathStarted) {
            ctx.stroke();
            ctx.beginPath();
            pathStarted = false;
          }
        }
      }

      if (pathStarted) {
        ctx.stroke();
      }
    }
  }

  function animate() {
    timeOffset += 0.02; // Increment time for animation
    drawContours();
    animationFrameId = requestAnimationFrame(animate);
  }

  function initAndDraw() {
    const w = content.offsetWidth || content.clientWidth;
    const h = content.offsetHeight || content.clientHeight;

    if (w === 0 || h === 0) {
      requestAnimationFrame(initAndDraw);
      return;
    }

    if (w !== canvasWidth || h !== canvasHeight) {
      canvasWidth = w;
      canvasHeight = h;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    // Start animation loop if not already running
    if (animationFrameId === null) {
      animate();
    }
  }

  // Initial draw
  requestAnimationFrame(() => {
    initAndDraw();
  });

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    initAndDraw();
  });
  resizeObserver.observe(content);
}

function mountReadoutScreen(el, m) {
  el.classList.add("readoutScreen");
  const lines = m.lines || ["NO DATA"];
  lines.forEach((line) => {
    const lineEl = document.createElement("div");
    lineEl.className = "readoutLine";
    lineEl.textContent = line;
    el.appendChild(lineEl);
  });
}

function mountGlyphTag(el, m) {
  el.classList.add("glyphTag");
  el.textContent = m.label || "THT/31";
}

function mountActionButton(el, m) {
  // Ensure unique ID for this button instance to prevent event conflicts
  const buttonId = `actionButton_${m.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  el.dataset.buttonId = buttonId;
  el.classList.add("actionButton", "interactive");
  if (m.styleChannel === "teal") el.classList.add("channelTeal");
  if (m.value > 0.5) el.classList.add("active");

  if (m.locked) return;

  let lastToggleTime = 0;
  let touchHandled = false;
  let touchHandledTime = 0;

  // Parse payload from module configuration
  let payload = null;
  if (m.payload) {
    try {
      payload = typeof m.payload === "string" ? JSON.parse(m.payload) : m.payload;
    } catch (e) {
      console.warn(`Invalid JSON payload for button ${m.id}:`, e);
    }
  }

  // Shared function to handle button toggle
  function handleToggle(fromTouch = false) {
    const now = Date.now();

    // If this is from touch, mark it and set a short window to block click events
    if (fromTouch) {
      touchHandled = true;
      touchHandledTime = now;
      // Clear the flag after click event would have fired (~300ms delay on mobile)
      setTimeout(() => {
        touchHandled = false;
      }, 400);
    }

    // Always update the visual state immediately - no debounce for rapid taps
    el.classList.remove("pressed");
    const wasActive = el.classList.contains("active");
    el.classList.toggle("active");
    const isNowActive = el.classList.contains("active");
    glowPulse(el, m.styleChannel === "magenta");

    // Distinct bell sounds for on/off - cohesive but with different tones
    ensureAudio();
    if (isNowActive) {
      // Sound for turning ON - bright, higher bell
      playJoyousBell(587, 0.35); // D5 - brighter, more uplifting
    } else {
      // Sound for turning OFF - warmer, lower bell
      playJoyousBell(440, 0.35); // A4 - warmer, more grounded
    }

    // Send event with JSON payload if configured
    sendEvent(m.id, "release", isNowActive ? 1 : 0, payload);
    lastToggleTime = now;
  }

  // Track touch state to handle mobile taps reliably
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  const TOUCH_MOVE_THRESHOLD = 10; // pixels

  // Use click event as fallback handler (skip if touch already handled it)
  el.addEventListener("click", (e) => {
    const now = Date.now();
    // Skip if touch handled it recently (within 400ms, which covers click delay)
    if (touchHandled && now - touchHandledTime < 400) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    handleToggle(false); // Not from touch
  });

  // Also handle touch events directly for better mobile reliability
  el.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      touchStartTime = Date.now();
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      el.classList.add("pressed");
      sendEvent(m.id, "press", 1, payload);
    },
    { passive: true }
  );

  el.addEventListener(
    "touchend",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) {
        el.classList.remove("pressed");
        return;
      }

      const touchDuration = Date.now() - touchStartTime;
      const touchMoveX = Math.abs(touch.clientX - touchStartX);
      const touchMoveY = Math.abs(touch.clientY - touchStartY);

      // Only trigger if it was a tap (not a drag) and quick enough
      // Made more permissive to ensure rapid taps work
      if (
        touchDuration < 1000 && // Increased from 500ms to be more permissive
        touchMoveX < TOUCH_MOVE_THRESHOLD * 2 && // Allow slightly more movement
        touchMoveY < TOUCH_MOVE_THRESHOLD * 2
      ) {
        e.preventDefault();
        handleToggle(true); // Pass true to indicate this is from touch
      } else {
        el.classList.remove("pressed");
      }
    },
    { passive: false }
  );

  el.addEventListener(
    "touchcancel",
    (e) => {
      el.classList.remove("pressed");
    },
    { passive: true }
  );

  // Handle pointer/touch events for visual feedback
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.classList.add("pressed");
    sendEvent(m.id, "press", 1, payload);
  });

  el.addEventListener("pointerup", (e) => {
    e.preventDefault();
    // Don't toggle here - let click/touch handle it for reliability
    el.classList.remove("pressed");
  });

  // Handle pointer cancel (important for mobile)
  el.addEventListener("pointercancel", (e) => {
    e.preventDefault();
    el.classList.remove("pressed");
  });

  // Handle pointer leave
  el.addEventListener("pointerleave", (e) => {
    el.classList.remove("pressed");
  });
}

function mountToggleSwitch(el, m) {
  // Ensure unique ID for this toggle instance to prevent event conflicts
  const toggleId = `toggleSwitch_${m.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  el.dataset.toggleId = toggleId;
  el.classList.add("toggleSwitch", "interactive");
  if (m.styleChannel === "teal") el.classList.add("channelTeal");
  if (m.value > 0.5) el.classList.add("on");

  const track = document.createElement("div");
  track.className = "toggleTrack";
  el.appendChild(track);
  const thumb = document.createElement("div");
  thumb.className = "toggleThumb";
  el.appendChild(thumb);

  if (m.locked) return;

  // Parse payload from module configuration
  let payload = null;
  if (m.payload) {
    try {
      payload = typeof m.payload === "string" ? JSON.parse(m.payload) : m.payload;
    } catch (e) {
      console.warn(`Invalid JSON payload for toggle ${m.id}:`, e);
    }
  }

  el.addEventListener("click", () => {
    ensureAudio();
    el.classList.toggle("on");
    if (el.classList.contains("on")) {
      playJoyousBell(523, 0.3);
    } else {
      playEtherealClick(392, 0.2);
    }
    // Send event with JSON payload if configured
    sendEvent(m.id, "toggle", el.classList.contains("on") ? 1 : 0, payload);
  });
}

function mountFaderBank(el, m) {
  // Slider that can be horizontal or vertical
  const orientation =
    m.orientation ||
    (m.w > m.h ? "horizontal" : m.h > m.w ? "vertical" : "horizontal");
  el.classList.add(
    orientation === "vertical" ? "verticalSlider" : "horizontalSlider",
    "interactive"
  );
  if (m.styleChannel === "teal") el.classList.add("channelTeal");

  const track = document.createElement("div");
  track.className = "sliderTrack";
  const fill = document.createElement("div");
  fill.className = "sliderFill";
  const thumb = document.createElement("div");
  thumb.className = "sliderThumb";
  track.appendChild(fill);
  track.appendChild(thumb); // Append thumb to track so it's positioned relative to track
  el.appendChild(track);

  let v = clamp01(Number(m.value ?? 0.5));
  function update() {
    const pct = v * 100;
    if (orientation === "vertical") {
      // For vertical: fill from bottom, thumb at position (inverted: 0% at bottom, 100% at top)
      fill.style.height = `${pct}%`;
      fill.style.width = "100%";
      fill.style.bottom = "0";
      fill.style.top = "auto";
      thumb.style.top = `${100 - pct}%`; // Invert: value 0 = bottom (100%), value 1 = top (0%)
      thumb.style.left = "50%";
      thumb.style.transform = "translate(-50%, -50%)";
    } else {
      // For horizontal: fill from left, thumb at position (fill stops at thumb center)
      fill.style.width = `${pct}%`;
      fill.style.height = "100%";
      fill.style.left = "0";
      thumb.style.left = `${pct}%`;
      thumb.style.top = "50%";
      thumb.style.transform = "translate(-50%, -50%)";
    }
  }
  update();

  if (m.locked) return;

  let currentChord = null;

  function setFromPosition(clientX, clientY, isInitial = false) {
    const rect = track.getBoundingClientRect();
    let n;
    if (orientation === "vertical") {
      // Calculate value from position within track (bottom to top for vertical)
      n = clamp01(1 - (clientY - rect.top) / rect.height);
    } else {
      // Calculate value from position within track
      n = clamp01((clientX - rect.left) / rect.width);
    }
    v = n;
    update();

    // Start low humming tone on initial press
    if (isInitial) {
      ensureAudio();
      currentChord = createHummingTone(n);
    } else if (currentChord) {
      // Update humming tone frequency as slider moves
      currentChord.updateValue(n);
    }

    // Send event (but throttle during drag)
    sendEvent(m.id, "change", v);
  }

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.classList.add("pressed");
    setFromPosition(e.clientX, e.clientY, true);
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (e.buttons !== 1) return;
    e.preventDefault();
    setFromPosition(e.clientX, e.clientY, false);
  });
  el.addEventListener("pointerup", () => {
    el.classList.remove("pressed");
    // Stop humming tone on release
    if (currentChord) {
      currentChord.stop();
      currentChord = null;
    }
    // Send final value on release
    sendEvent(m.id, "change", v);
  });
}

function mountRotaryDial(el, m) {
  el.classList.add("rotaryDial", "interactive");
  if (m.styleChannel === "teal") el.classList.add("channelTeal");

  const ring = document.createElement("div");
  ring.className = "dialRing";

  // Calculate size based on container's smaller dimension to ensure perfect circle
  function setDialSize() {
    const rect = el.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height) * 0.7;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
  }
  setDialSize();
  // Update on resize
  const resizeObserver = new ResizeObserver(setDialSize);
  resizeObserver.observe(el);

  const grabSection = document.createElement("div");
  grabSection.className = "dialGrabSection";
  ring.appendChild(grabSection);
  el.appendChild(ring);

  let v = clamp01(Number(m.value ?? 0.5));
  function update() {
    // Rotate the ring based on value (0-1 maps to 0-360 degrees)
    const deg = v * 360;
    ring.style.transform = `rotate(${deg}deg)`;
  }
  update();

  if (m.locked) return;

  let startAngle = null;
  let startV = null;
  let lastAngle = null;
  let totalRotation = 0;
  let currentChord = null;

  function getAngleFromCenter(clientX, clientY) {
    const rect = ring.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    return Math.atan2(dy, dx);
  }

  function angleDifference(a1, a2) {
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.classList.add("pressed");
    ensureAudio();
    const angle = getAngleFromCenter(e.clientX, e.clientY);
    startAngle = angle;
    lastAngle = angle;
    startV = v;
    totalRotation = 0;
    // Start low humming tone
    currentChord = createHummingTone(v);
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener("pointermove", (e) => {
    if (startAngle == null || e.buttons !== 1) return;
    e.preventDefault();
    const currentAngle = getAngleFromCenter(e.clientX, e.clientY);
    const angleDiff = angleDifference(lastAngle, currentAngle);
    totalRotation += angleDiff;
    const sensitivity = 0.8;
    const deltaV = (totalRotation / (2 * Math.PI)) * sensitivity;
    v = clamp01(startV + deltaV);
    update();

    // Update humming tone frequency as dial rotates
    if (currentChord) {
      currentChord.updateValue(v);
    }

    sendEvent(m.id, "change", v);
    lastAngle = currentAngle;
  });

  el.addEventListener("pointerup", () => {
    el.classList.remove("pressed");
    // Stop humming tone on release
    if (currentChord) {
      currentChord.stop();
      currentChord = null;
    }
    startAngle = null;
    startV = null;
    lastAngle = null;
    totalRotation = 0;
  });
}

function mountArrow(el, m) {
  // Ensure unique ID for this arrow instance to prevent event conflicts
  const arrowId = `arrow_${m.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  el.dataset.arrowId = arrowId;
  el.classList.add("arrow", "interactive");
  if (m.styleChannel === "teal") el.classList.add("channelTeal");
  if (m.value > 0.5) el.classList.add("active");

  // Parse payload from module configuration
  let payload = null;
  if (m.payload) {
    try {
      payload = typeof m.payload === "string" ? JSON.parse(m.payload) : m.payload;
    } catch (e) {
      console.warn(`Invalid JSON payload for arrow ${m.id}:`, e);
    }
  }

  // Prevent double-tap zoom on mobile for arrow buttons
  // Add touch event handlers to prevent default zoom behavior
  let lastTouchEnd = 0;
  el.addEventListener(
    "touchend",
    function (event) {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
        event.stopPropagation();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // Also prevent gesture zoom
  el.addEventListener(
    "gesturestart",
    function (event) {
      event.preventDefault();
    },
    { passive: false }
  );
  el.addEventListener(
    "gesturechange",
    function (event) {
      event.preventDefault();
    },
    { passive: false }
  );
  el.addEventListener(
    "gestureend",
    function (event) {
      event.preventDefault();
    },
    { passive: false }
  );

  // Arrow orientation: up, right, down, left (default: up)
  // Use saved orientation from module object, only default if truly missing
  // This ensures orientation persists across re-renders
  const orientation = m.orientation || "up";
  // Save it back to module to ensure it's persisted
  if (!m.orientation) {
    m.orientation = orientation;
  }
  const arrowShape = document.createElement("div");
  arrowShape.className = "arrowShape";
  arrowShape.setAttribute("data-orientation", orientation);
  el.appendChild(arrowShape);

  if (m.locked) return;

  el.addEventListener("pointerdown", () => {
    ensureAudio();
    el.classList.add("pressed");
    playEtherealClick(600, 0.15);
    sendEvent(m.id, "press", 1, payload);
  });

  el.addEventListener("pointerup", () => {
    el.classList.remove("pressed");
    el.classList.toggle("active");
    if (el.classList.contains("active")) {
      playJoyousBell(523, 0.3);
    } else {
      playEtherealClick(392, 0.2);
    }
    // Send event with JSON payload if configured
    sendEvent(m.id, "toggle", el.classList.contains("active") ? 1 : 0, payload);
  });

  el.addEventListener("pointerleave", () => {
    el.classList.remove("pressed");
  });
}

function mountIndicatorPips(el, m) {
  el.classList.add("indicatorPips");
  if (m.styleChannel === "teal") el.classList.add("channelTeal");
  const values = m.values || [1, 0, 1, 0, 1];
  values.forEach((val) => {
    const pip = document.createElement("div");
    pip.className = "indicatorPip";
    if (val > 0.5) pip.classList.add("active");
    el.appendChild(pip);
  });
}

// boot default state if none arrived yet
if (!state) {
  state = defaultState(12, 12);
  applyThemeFromState(state);
}
