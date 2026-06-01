const AUDIO_SETTINGS_KEY = 'moonrock-crafter-audio-v1';
const LEGACY_AUDIO_SETTINGS_KEYS = ['starforge-station-audio-v1'];

const DEFAULT_VOLUMES = {
  master: 0.75,
  sfx: 0.86,
  music: 0.2,
  ambience: 0.24,
};

const ENABLE_PLACEHOLDER_NOISE = false;

const SFX = {
  buttonClick: { category: 'sfx', frequency: 520, duration: 0.045, type: 'triangle', gain: 0.035, cooldown: 0.035 },
  buttonHover: { category: 'sfx', frequency: 680, duration: 0.025, type: 'sine', gain: 0.014, cooldown: 0.08 },
  tabSwitch: { category: 'sfx', frequency: 430, slideTo: 620, duration: 0.065, type: 'triangle', gain: 0.026, cooldown: 0.08 },
  modalOpen: { category: 'sfx', frequency: 330, slideTo: 520, duration: 0.11, type: 'triangle', gain: 0.026, cooldown: 0.08 },
  modalClose: { category: 'sfx', frequency: 430, slideTo: 260, duration: 0.09, type: 'triangle', gain: 0.022, cooldown: 0.08 },
  error: { category: 'sfx', frequency: 160, slideTo: 92, duration: 0.13, type: 'sawtooth', gain: 0.026, cooldown: 0.12 },
  success: { category: 'sfx', notes: [620, 820], duration: 0.07, gap: 0.06, type: 'triangle', gain: 0.028, cooldown: 0.12 },
  purchase: { category: 'sfx', notes: [380, 560, 820], duration: 0.055, gap: 0.055, type: 'square', gain: 0.025, cooldown: 0.16 },
  sceneTransition: { category: 'sfx', frequency: 260, slideTo: 390, duration: 0.1, type: 'triangle', gain: 0.022, cooldown: 0.12 },
  reset: { category: 'sfx', frequency: 130, duration: 0.18, type: 'square', gain: 0.02, cooldown: 0.2 },

  engineBoost: { category: 'sfx', frequency: 130, slideTo: 185, duration: 0.09, type: 'sawtooth', gain: 0.012, cooldown: 0.2 },
  laserStart: { category: 'sfx', frequency: 138, slideTo: 104, duration: 0.09, type: 'triangle', gain: 0.013, cooldown: 0.12 },
  laserStop: { category: 'sfx', frequency: 112, slideTo: 74, duration: 0.09, type: 'sine', gain: 0.01, cooldown: 0.12 },
  asteroidHit: { category: 'sfx', frequency: 145, slideTo: 108, duration: 0.045, type: 'triangle', gain: 0.011, cooldown: 0.1 },
  asteroidCrack: { category: 'sfx', frequency: 155, slideTo: 92, duration: 0.085, type: 'triangle', gain: 0.015, cooldown: 0.12 },
  asteroidBreak: { category: 'sfx', notes: [150, 112, 82], duration: 0.06, gap: 0.045, type: 'triangle', gain: 0.018, cooldown: 0.18 },
  mineralPickup: { category: 'sfx', frequency: 780, slideTo: 1120, duration: 0.055, type: 'square', gain: 0.017, cooldown: 0.055 },
  shipHit: { category: 'sfx', frequency: 110, slideTo: 82, duration: 0.14, type: 'triangle', gain: 0.021, cooldown: 0.14 },
  shipCrash: { category: 'sfx', notes: [120, 92, 64], duration: 0.12, gap: 0.07, type: 'triangle', gain: 0.025, cooldown: 0.5 },
  lowFuelWarning: { category: 'sfx', notes: [240, 170], duration: 0.09, gap: 0.07, type: 'square', gain: 0.02, cooldown: 1.8 },
  cargoFull: { category: 'sfx', frequency: 180, slideTo: 135, duration: 0.12, type: 'square', gain: 0.022, cooldown: 0.7 },
  dockSuccess: { category: 'sfx', notes: [360, 540, 720], duration: 0.06, gap: 0.06, type: 'triangle', gain: 0.026, cooldown: 0.25 },
  rareFind: { category: 'sfx', notes: [650, 960, 1280], duration: 0.065, gap: 0.055, type: 'triangle', gain: 0.024, cooldown: 0.5 },
  droneShot: { category: 'sfx', frequency: 760, slideTo: 1180, duration: 0.055, type: 'triangle', gain: 0.018, cooldown: 0.08 },
  droneHit: { category: 'sfx', frequency: 360, slideTo: 210, duration: 0.055, type: 'square', gain: 0.018, cooldown: 0.08 },
  swordSwing: { category: 'sfx', frequency: 520, slideTo: 760, duration: 0.055, type: 'triangle', gain: 0.017, cooldown: 0.055 },
  swordHeavy: { category: 'sfx', frequency: 360, slideTo: 720, duration: 0.085, type: 'sawtooth', gain: 0.021, cooldown: 0.09 },
  swordHit: { category: 'sfx', frequency: 260, slideTo: 160, duration: 0.05, type: 'triangle', gain: 0.018, cooldown: 0.055 },

  sparkPop: { category: 'ambience', frequency: 880, slideTo: 1300, duration: 0.035, type: 'triangle', gain: 0.012, cooldown: 0.18 },
  shipDock: { category: 'sfx', frequency: 210, slideTo: 145, duration: 0.12, type: 'triangle', gain: 0.024, cooldown: 0.25 },
  shipLaunch: { category: 'sfx', frequency: 180, slideTo: 320, duration: 0.16, type: 'sawtooth', gain: 0.025, cooldown: 0.25 },

  dialogueBlip: { category: 'sfx', frequency: 560, duration: 0.018, type: 'sine', gain: 0.008, cooldown: 0.045 },

  gpsOpen: { category: 'sfx', notes: [340, 510, 680], duration: 0.05, gap: 0.045, type: 'sine', gain: 0.02, cooldown: 0.18 },
  gpsPing: { category: 'sfx', frequency: 900, slideTo: 1180, duration: 0.06, type: 'sine', gain: 0.015, cooldown: 0.65 },
  destinationSet: { category: 'sfx', notes: [440, 620, 880], duration: 0.055, gap: 0.05, type: 'triangle', gain: 0.024, cooldown: 0.18 },
  destinationReached: { category: 'sfx', notes: [520, 760, 1040], duration: 0.08, gap: 0.06, type: 'triangle', gain: 0.028, cooldown: 0.8 },
  landShip: { category: 'sfx', frequency: 260, slideTo: 150, duration: 0.18, type: 'sawtooth', gain: 0.024, cooldown: 0.4 },
  exitShip: { category: 'sfx', frequency: 420, slideTo: 620, duration: 0.08, type: 'triangle', gain: 0.018, cooldown: 0.2 },
  boardShip: { category: 'sfx', frequency: 360, slideTo: 220, duration: 0.1, type: 'triangle', gain: 0.02, cooldown: 0.25 },
  chopTree: { category: 'sfx', frequency: 126, duration: 0.06, type: 'triangle', gain: 0.018, cooldown: 0.13 },
  mineNode: { category: 'sfx', frequency: 118, slideTo: 78, duration: 0.065, type: 'triangle', gain: 0.014, cooldown: 0.16 },
  gatherPlant: { category: 'sfx', frequency: 720, slideTo: 940, duration: 0.055, type: 'triangle', gain: 0.016, cooldown: 0.1 },
  animalHit: { category: 'sfx', frequency: 250, duration: 0.06, type: 'square', gain: 0.021, cooldown: 0.1 },
  animalDefeated: { category: 'sfx', notes: [320, 540], duration: 0.06, gap: 0.05, type: 'triangle', gain: 0.023, cooldown: 0.18 },
  islandPickup: { category: 'sfx', frequency: 780, slideTo: 1080, duration: 0.055, type: 'triangle', gain: 0.017, cooldown: 0.06 },
};

const LOOP_DEFS = {
  engineHum: { category: 'ambience', frequency: 64, type: 'sine', gain: 0.0035 },
  engineBoost: { category: 'sfx', frequency: 96, type: 'triangle', gain: 0.007 },
  laserLoop: { category: 'sfx', frequency: 88, type: 'sine', gain: 0.0055 },
  forgeCrackle: { category: 'ambience', sequence: [180, 260, 190, 330], duration: 0.035, gain: 0.008, interval: 880, jitter: 360, type: 'triangle' },
  stationAmbience: { category: 'ambience', frequency: 86, type: 'sine', gain: 0.006 },
};

const MUSIC_THEMES = {
  station: { category: 'music', sequence: [220, 277, 330, 277], duration: 0.22, gain: 0.018, interval: 720, type: 'sine' },
  mining: { category: 'music', sequence: [146, 196, 246, 196], duration: 0.24, gain: 0.014, interval: 900, type: 'triangle' },
  dangerMining: { category: 'music', sequence: [110, 98, 110, 82], duration: 0.18, gain: 0.018, interval: 520, type: 'sawtooth' },
  island: { category: 'music', sequence: [196, 247, 330, 294], duration: 0.2, gain: 0.014, interval: 760, type: 'triangle' },
};

const SCENE_AUDIO = {
  station: { music: 'station', loops: ['stationAmbience', 'forgeCrackle'] },
  mining: { music: 'mining', loops: ['engineHum'] },
  upgrades: { music: 'station', loops: ['stationAmbience'] },
  storage: { music: 'station', loops: ['stationAmbience'] },
  island: { music: 'island', loops: ['stationAmbience'] },
};

export class AudioManager {
  constructor() {
    this.context = null;
    this.unlocked = false;
    this.storageKey = AUDIO_SETTINGS_KEY;
    this.settings = this.loadSettings();
    this.gains = {};
    this.lastPlayed = new Map();
    this.loops = new Map();
    this.sceneName = '';
    this.dangerMode = false;
    this.assetBasePath = '/assets/audio';
    this.assetManifest = {
      sfx: {},
      music: {},
    };
  }

  get enabled() {
    return !this.settings.muted;
  }

  unlock() {
    this.unlocked = true;
    if (this.ensureContext()) this.startSceneAudio();
  }

  ensureContext() {
    if (!this.unlocked) return false;
    if (!this.context) {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return false;
      this.context = new AudioContextType();
      this.createGainGraph();
    }
    if (this.context.state === 'suspended') this.context.resume();
    this.applyVolumeSettings();
    return true;
  }

  createGainGraph() {
    this.gains.master = this.context.createGain();
    this.gains.sfx = this.context.createGain();
    this.gains.music = this.context.createGain();
    this.gains.ambience = this.context.createGain();
    this.gains.sfx.connect(this.gains.master);
    this.gains.music.connect(this.gains.master);
    this.gains.ambience.connect(this.gains.master);
    this.gains.master.connect(this.context.destination);
    this.applyVolumeSettings();
  }

  loadSettings() {
    for (const key of [this.storageKey, ...LEGACY_AUDIO_SETTINGS_KEYS]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const saved = JSON.parse(raw);
        return {
          muted: Boolean(saved?.muted),
          volumes: { ...DEFAULT_VOLUMES, ...(saved?.volumes || {}) },
        };
      } catch {
        // Ignore bad audio preferences and keep the game bootable.
      }
    }
    return { muted: false, volumes: { ...DEFAULT_VOLUMES } };
  }

  saveSettings() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {
      // Audio preferences are nice-to-have; gameplay should continue if storage is unavailable.
    }
  }

  setMuted(isMuted) {
    this.settings.muted = Boolean(isMuted);
    this.applyVolumeSettings();
    this.saveSettings();
    if (!this.settings.muted && this.unlocked) this.startSceneAudio();
  }

  toggleMuted() {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  setVolume(category, value) {
    if (!Object.hasOwn(DEFAULT_VOLUMES, category)) return;
    this.settings.volumes[category] = Math.max(0, Math.min(1, Number(value)));
    this.applyVolumeSettings();
    this.saveSettings();
  }

  applyVolumeSettings() {
    if (!this.context || !this.gains.master) return;
    const now = this.context.currentTime;
    const volumes = this.settings.volumes;
    this.gains.master.gain.setTargetAtTime(this.settings.muted ? 0 : volumes.master, now, 0.02);
    this.gains.sfx.gain.setTargetAtTime(volumes.sfx, now, 0.02);
    this.gains.music.gain.setTargetAtTime(volumes.music, now, 0.05);
    this.gains.ambience.gain.setTargetAtTime(volumes.ambience, now, 0.05);
  }

  setScene(sceneName) {
    this.sceneName = sceneName;
    this.dangerMode = false;
    this.startSceneAudio();
  }

  startSceneAudio() {
    if (!this.ensureContext()) return;
    this.stopLoopsByPrefix('scene:');
    this.stopLaserLoop();
    this.stopEngineBoost();
    const sceneAudio = SCENE_AUDIO[this.sceneName];
    if (!sceneAudio) return;
    this.playMusicTheme(sceneAudio.music);
    (sceneAudio.loops || []).forEach((loopName) => {
      this.startLoop(`scene:${loopName}`, LOOP_DEFS[loopName]);
    });
  }

  setDangerMode(isDanger) {
    if (this.sceneName !== 'mining' || this.dangerMode === isDanger) return;
    this.dangerMode = isDanger;
    this.playMusicTheme(isDanger ? 'dangerMining' : 'mining');
  }

  playMusicTheme(themeName) {
    const theme = MUSIC_THEMES[themeName];
    if (!theme) return;
    this.stopLoopsByPrefix('scene:music');
    this.startSequenceLoop(`scene:music:${themeName}`, theme);
  }

  playSfx(name, overrides = {}) {
    const definition = { ...(SFX[name] || {}), ...overrides };
    if (!definition.category) return;
    if (!this.canPlay(name, definition.cooldown)) return;
    if (definition.notes) {
      definition.notes.forEach((frequency, index) => {
        this.playTone({ ...definition, frequency, delay: (definition.gap || 0.045) * index });
      });
      if (ENABLE_PLACEHOLDER_NOISE && definition.noise) this.playNoise({ ...definition, delay: 0.02, gain: definition.noise });
      return;
    }
    this.playTone(definition);
    if (ENABLE_PLACEHOLDER_NOISE && definition.noise) this.playNoise({ ...definition, gain: definition.noise });
  }

  canPlay(name, cooldown = 0.04) {
    if (!this.enabled || !this.ensureContext()) return false;
    const now = this.context.currentTime;
    const last = this.lastPlayed.get(name) || -Infinity;
    if (now - last < cooldown) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  playTone({ category = 'sfx', frequency = 440, slideTo = null, duration = 0.08, type = 'sine', gain = 0.02, delay = 0 }) {
    if (!this.enabled || !this.ensureContext()) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), start + duration);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), start + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume);
    volume.connect(this.gains[category] || this.gains.sfx);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  playNoise({ category = 'sfx', duration = 0.08, gain = 0.015, delay = 0 }) {
    if (!this.enabled || !this.ensureContext()) return;
    const sampleRate = this.context.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    const volume = this.context.createGain();
    const start = this.context.currentTime + delay;
    source.buffer = buffer;
    volume.gain.setValueAtTime(gain, start);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(volume);
    volume.connect(this.gains[category] || this.gains.sfx);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  startLoop(id, definition) {
    if (!definition || this.loops.has(id) || !this.enabled || !this.ensureContext()) return;
    if (definition.sequence) {
      this.startSequenceLoop(id, definition);
      return;
    }
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    oscillator.type = definition.type || 'sine';
    oscillator.frequency.value = definition.frequency || 100;
    volume.gain.setValueAtTime(0.0001, this.context.currentTime);
    volume.gain.setTargetAtTime(definition.gain || 0.008, this.context.currentTime, 0.08);
    oscillator.connect(volume);
    volume.connect(this.gains[definition.category] || this.gains.ambience);
    oscillator.start();
    this.loops.set(id, { oscillator, volume, category: definition.category });
  }

  startSequenceLoop(id, definition) {
    if (!definition || this.loops.has(id) || !this.enabled || !this.ensureContext()) return;
    let index = 0;
    const tick = () => {
      if (!this.loops.has(id) || !this.enabled) return;
      const frequency = definition.sequence[index % definition.sequence.length];
      index += 1;
      this.playTone({
        category: definition.category || 'music',
        frequency,
        duration: definition.duration || 0.12,
        type: definition.type || 'sine',
        gain: definition.gain || 0.01,
      });
    };
    tick();
    const intervalMs = definition.interval || 700;
    const interval = window.setInterval(tick, intervalMs + Math.random() * (definition.jitter || 0));
    this.loops.set(id, { interval });
  }

  stopLoop(id) {
    const loop = this.loops.get(id);
    if (!loop) return;
    if (loop.interval) window.clearInterval(loop.interval);
    if (loop.volume && this.context) loop.volume.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.04);
    if (loop.oscillator && this.context) {
      try {
        loop.oscillator.stop(this.context.currentTime + 0.08);
      } catch {
        // Oscillators can only stop once.
      }
    }
    this.loops.delete(id);
  }

  stopLoopsByPrefix(prefix) {
    [...this.loops.keys()].filter((id) => id.startsWith(prefix)).forEach((id) => this.stopLoop(id));
  }

  startEngineBoost() {
    this.playSfx('engineBoost');
    this.startLoop('engineBoost', LOOP_DEFS.engineBoost);
  }

  stopEngineBoost() {
    this.stopLoop('engineBoost');
  }

  startEngineHum() {
    this.startLoop('scene:engineHum', LOOP_DEFS.engineHum);
  }

  stopEngineHum() {
    this.stopLoop('scene:engineHum');
  }

  playLaserStart() {
    this.playSfx('laserStart');
  }

  startLaserLoop() {
    this.startLoop('laserLoop', LOOP_DEFS.laserLoop);
  }

  stopLaserLoop() {
    if (this.loops.has('laserLoop')) this.playSfx('laserStop');
    this.stopLoop('laserLoop');
  }

  startStationAmbience() {
    this.startLoop('scene:stationAmbience', LOOP_DEFS.stationAmbience);
  }

  stopStationAmbience() {
    this.stopLoop('scene:stationAmbience');
  }

  startForgeCrackle() {
    this.startLoop('scene:forgeCrackle', LOOP_DEFS.forgeCrackle);
  }

  stopForgeCrackle() {
    this.stopLoop('scene:forgeCrackle');
  }

  registerSoundFile(name, path, category = 'sfx') {
    this.assetManifest[category][name] = `${this.assetBasePath}/${category}/${path}`;
  }

  playButtonClick() { this.playSfx('buttonClick'); }
  playButtonHover() { this.playSfx('buttonHover'); }
  playTabSwitch() { this.playSfx('tabSwitch'); }
  playModalOpen() { this.playSfx('modalOpen'); }
  playModalClose() { this.playSfx('modalClose'); }
  playError() { this.playSfx('error'); }
  playSuccess() { this.playSfx('success'); }
  playPurchase() { this.playSfx('purchase'); }
  playSceneTransition() { this.playSfx('sceneTransition'); }

  playAsteroidHit() { this.playSfx('asteroidHit'); }
  playAsteroidCrack() { this.playSfx('asteroidCrack'); }
  playAsteroidBreak() { this.playSfx('asteroidBreak'); }
  playMineralPickup() { this.playSfx('mineralPickup'); }
  playShipHit() { this.playSfx('shipHit'); }
  playShipCrash() { this.playSfx('shipCrash'); }
  playLowFuelWarning() { this.playSfx('lowFuelWarning'); }
  playCargoFull() { this.playSfx('cargoFull'); }
  playDockSuccess() { this.playSfx('dockSuccess'); }
  playRareFind() { this.playSfx('rareFind'); }
  playDroneShot() { this.playSfx('droneShot'); }
  playDroneHit() { this.playSfx('droneHit'); }
  playSwordSwing() { this.playSfx('swordSwing'); }
  playSwordHeavy() { this.playSfx('swordHeavy'); }
  playSwordHit() { this.playSfx('swordHit'); }

  playEngineHum() { this.startEngineHum(); }
  playEngineBoost() { this.startEngineBoost(); }
  playLaserLoop() { this.startLaserLoop(); }
  playLaserStop() { this.stopLaserLoop(); }

  playSparkPop() { this.playSfx('sparkPop'); }
  playShipDock() { this.playSfx('shipDock'); }
  playShipLaunch() { this.playSfx('shipLaunch'); }
  playStationAmbience() { this.startStationAmbience(); }
  playForgeCrackle() { this.startForgeCrackle(); }

  playDialogueBlip() { this.playSfx('dialogueBlip'); }

  playGpsOpen() { this.playSfx('gpsOpen'); }
  playGpsPing() { this.playSfx('gpsPing'); }
  playDestinationSet() { this.playSfx('destinationSet'); }
  playDestinationReached() { this.playSfx('destinationReached'); }
  playLandShip() { this.playSfx('landShip'); }
  playExitShip() { this.playSfx('exitShip'); }
  playBoardShip() { this.playSfx('boardShip'); }
  playChopTree() { this.playSfx('chopTree'); }
  playMineNode() { this.playSfx('mineNode'); }
  playGatherPlant() { this.playSfx('gatherPlant'); }
  playAnimalHit() { this.playSfx('animalHit'); }
  playAnimalDefeated() { this.playSfx('animalDefeated'); }
  playIslandPickup() { this.playSfx('islandPickup'); }

  playClick() { this.playButtonClick(); }
  playHover() { this.playButtonHover(); }
  playMiningLaser() { this.playAsteroidHit(); }
  playPickup() { this.playMineralPickup(); }
  playLaunch() { this.playShipLaunch(); }
  playReset() { this.playSfx('reset'); }
}
