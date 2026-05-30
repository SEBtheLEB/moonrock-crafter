import { Button } from '../ui/Button.js';
import { Joystick } from '../ui/Joystick.js';
import { Ship } from '../entities/Ship.js?v=32';
import { Asteroid } from '../entities/Asteroid.js?v=32';
import { MineralPickup } from '../entities/MineralPickup.js';
import { RockIsland } from '../entities/RockIsland.js';
import { ShipSmokeSimulation } from '../effects/ShipSmokeSimulation.js?v=32';
import { asteroids as asteroidData } from '../data/asteroids.js?v=32';
import { islands as islandData } from '../data/islands.js?v=32';
import { gameBalance } from '../data/gameBalance.js?v=32';

const DOCK_RADIUS = gameBalance.mining.stationDockRadius;
const DOCK_RADIUS_SQ = DOCK_RADIUS * DOCK_RADIUS;
const STATION_SAFE_RADIUS_SQ = (DOCK_RADIUS * 0.7) ** 2;
const ASTEROID_META_BY_ID = Object.fromEntries(asteroidData.map((asteroid) => [asteroid.id, asteroid]));
const MAX_PARTICLES = gameBalance.mining.maxActiveParticles || 150;
const MAX_FLOATING_TEXT = gameBalance.mining.maxFloatingText || 24;

export class MiningScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.game.systems.upgrades.applyUpgrades();
    this.ship = new Ship(game.state.ship);
    this.asteroids = [];
    this.pickups = [];
    this.particles = [];
    this.particlePool = [];
    this.pickupPool = [];
    this.asteroidPool = [];
    this.shipSmoke = new ShipSmokeSimulation();
    this.floatingText = [];
    this.floatingTextPool = [];
    this.cargoTransferEffects = [];
    this.time = 0;
    this.viewScale = gameBalance.ui?.miningViewScale || gameBalance.ui?.worldViewScale || 1;
    this.camera = { x: 0, y: 0, shake: 0, shakeX: 0, shakeY: 0 };
    this.cameraView = {
      worldToScreen: (x, y) => ({
        x: x - this.camera.x + (this.game.viewport?.width || 0) / 2 + this.camera.shakeX,
        y: y - this.camera.y + (this.game.viewport?.height || 0) / 2 + this.camera.shakeY,
      }),
    };
    this.stats = this.createRunStats();
    if (payload.fromIsland) {
      this.stats = { ...this.stats, ...(payload.miningStats || {}) };
      this.runCargo = game.systems.inventory.getRunCargo();
      this.runCargoCount = Object.values(this.runCargo).reduce((total, amount) => total + amount, 0);
      this.runCargoWeight = game.systems.inventory.getRunCargoWeight(this.runCargo);
      this.stats.cargo = Math.ceil(this.runCargoWeight);
      this.ship.x = payload.shipPosition?.x ?? 0;
      this.ship.y = payload.shipPosition?.y ?? 0;
      this.ship.vx = 0;
      this.ship.vy = 0;
    } else {
      this.runCargo = game.systems.inventory.beginRunCargo();
      this.runCargoCount = 0;
      this.runCargoWeight = 0;
    }
    this.mineTick = 0;
    this.laserTarget = null;
    this.lowFuelToastReady = true;
    this.cargoFullToastReady = true;
    this.scannerPingCooldown = 0;
    this.currentZone = this.getZoneForDistance(0);
    this.previousZoneId = this.currentZone.id;
    this.zoneBannerTimer = 2.4;
    this.lockedZoneToastId = '';
    this.ambientParticles = [];
    this.shieldTimer = 0;
    this.recallUsed = false;
    this.laserWasActive = false;
    this.engineBoosting = false;
    this.ending = false;
    this.distanceFromStation = 0;
    this.hudCache = {};
    this.hudRefreshTimer = 0;
    this.distanceRecordTimer = 0;
    this.spaceBackdrop = null;
    this.rockIslands = islandData.map((island) => new RockIsland(island));
    this.landingIsland = null;
    this.gpsPingTimer = 0;
    this.destinationReachedId = '';
    this.cargoDumping = false;
    this.cargoDumpTimer = 0;
    this.cargoDumpSummary = null;
    this.cargoDumpReturnToStation = false;
    this.cargoDumpCooldown = 0;
    this.outOfFuelReturnQueued = false;
  }

  createRunStats() {
    const ship = this.game.state.ship;
    return {
      fuel: ship.fuel ?? ship.maxFuel ?? 100,
      maxFuel: ship.maxFuel ?? 100,
      hull: ship.hull ?? ship.maxHull ?? 100,
      maxHull: ship.maxHull ?? 100,
      cargo: 0,
      cargoCapacity: ship.cargoMax ?? 20,
      speed: ship.speed ?? 1,
      miningPower: ship.miningPower ?? 1,
      miningRange: ship.miningRange ?? 210 + (ship.range ?? 1) * 18,
      collectionMagnet: ship.collectionMagnet ?? 0,
      rareScanner: ship.rareScanner ?? 0,
      precisionCutter: ship.precisionCutter ?? 0,
      emergencyRecall: ship.emergencyRecall ?? 0,
      shieldCharges: ship.shieldCharges ?? 0,
      shieldCooldown: ship.shieldCooldown ?? 0,
      maxDistance: 0,
      asteroidsMined: 0,
      rareFinds: 0,
      farthestZone: 'Scrap Belt',
    };
  }

  enter() {
    this.game.ui.setScreen('mining-screen');
    this.mountHud();
    this.mountControls();
    this.seedAsteroidField();
    this.game.systems.tutorial.onMiningEnter();
  }

  mountHud() {
    const hud = document.createElement('div');
    hud.className = 'mining-hud';
    hud.innerHTML = `
      <div class="mining-bar hull-bar">
        <span>Hull</span>
        <strong data-hull-text></strong>
        <div><i data-hull-fill></i></div>
      </div>
      <div class="mining-bar fuel-bar">
        <span>Fuel</span>
        <strong data-fuel-text></strong>
        <div><i data-fuel-fill></i></div>
      </div>
      <div class="mining-bar cargo-bar">
        <span>Cargo</span>
        <strong data-cargo-text></strong>
        <div><i data-cargo-fill></i></div>
      </div>
      <div class="station-radar">
        <span class="radar-arrow" data-station-arrow></span>
        <strong data-distance-text>0m</strong>
      </div>
      <div class="zone-chip" data-zone-chip>Scrap Belt</div>
      <div class="mining-warning" data-warning></div>
      <div class="zone-banner" data-zone-banner>Scrap Belt</div>
      <div class="gps-destination-hud is-hidden" data-gps-panel>
        <span class="gps-arrow" data-gps-arrow></span>
        <div>
          <strong data-gps-name>No destination</strong>
          <em data-gps-distance></em>
          <small data-gps-warning></small>
        </div>
      </div>
      <div class="landing-zone-prompt is-hidden" data-landing-prompt>Landing Zone Detected</div>
    `;
    this.game.ui.addSceneElement(hud);
    this.hud = {
      hullText: hud.querySelector('[data-hull-text]'),
      hullFill: hud.querySelector('[data-hull-fill]'),
      fuelText: hud.querySelector('[data-fuel-text]'),
      fuelFill: hud.querySelector('[data-fuel-fill]'),
      cargoText: hud.querySelector('[data-cargo-text]'),
      cargoFill: hud.querySelector('[data-cargo-fill]'),
      stationArrow: hud.querySelector('[data-station-arrow]'),
      distanceText: hud.querySelector('[data-distance-text]'),
      zoneChip: hud.querySelector('[data-zone-chip]'),
      zoneBanner: hud.querySelector('[data-zone-banner]'),
      warning: hud.querySelector('[data-warning]'),
      gpsPanel: hud.querySelector('[data-gps-panel]'),
      gpsArrow: hud.querySelector('[data-gps-arrow]'),
      gpsName: hud.querySelector('[data-gps-name]'),
      gpsDistance: hud.querySelector('[data-gps-distance]'),
      gpsWarning: hud.querySelector('[data-gps-warning]'),
      landingPrompt: hud.querySelector('[data-landing-prompt]'),
      cargoBar: hud.querySelector('.cargo-bar'),
      fuelBar: hud.querySelector('.fuel-bar'),
      hullBar: hud.querySelector('.hull-bar'),
    };

    this.dockButton = new Button('Dock', () => this.dock(), {
      icon: 'D',
      variant: 'success',
      className: 'dock-button is-hidden',
    }).element;
    this.game.ui.addSceneElement(this.dockButton);
    this.recallButton = new Button('Recall', () => this.recallToStation(), {
      icon: 'R',
      variant: 'metal',
      className: 'recall-button is-hidden',
    }).element;
    this.game.ui.addSceneElement(this.recallButton);
    this.updateHud();
  }

  mountControls() {
    const moveStick = new Joystick({ label: 'Move' }).element;
    const mineButton = new Button('Mine', () => {}, {
      icon: 'M',
      className: 'mine-hold-button',
      variant: 'forge',
      holdAction: 'mine',
    }).element;
    this.moveStick = moveStick;
    this.mineButton = mineButton;
    this.mineButtonLabel = mineButton.querySelector('span:last-child');
    this.mineButtonIcon = mineButton.querySelector('.button-icon');
    this.game.ui.addControls([moveStick, mineButton]);
    this.game.input.bindJoystick(moveStick, { mode: 'move', radius: 46, floating: true, activationRegion: 'left' });
    this.game.input.bindHoldButton(mineButton, 'mine');
  }

  exit() {
    this.moveStick?.__inputCleanup?.();
    this.game.audio.stopLaserLoop();
    this.game.audio.stopEngineBoost();
    this.game.audio.setDangerMode(false);
    this.shipSmoke?.clear();
  }

  seedAsteroidField() {
    for (let i = 0; i < gameBalance.mining.targetAsteroidCount; i += 1) {
      this.asteroids.push(this.createAsteroid(260, 950));
    }
  }

  createAsteroid(minDistance = 360, spawnRange = gameBalance.mining.asteroidSpawnMaxDistance) {
    let x = 0;
    let y = 0;
    let zone = this.currentZone;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = minDistance + Math.random() * spawnRange;
      x = this.ship.x + Math.cos(angle) * distance;
      y = this.ship.y + Math.sin(angle) * distance;
      zone = this.getZoneForDistance(Math.sqrt(x * x + y * y));
      if (x * x + y * y > 260 * 260) break;
    }
    const spawnDistanceFromStation = Math.sqrt(x * x + y * y);
    const type = this.chooseAsteroidType(spawnDistanceFromStation, zone.id);
    const asteroidMeta = ASTEROID_META_BY_ID[type];
    const asteroid = this.acquireAsteroid({
      x,
      y,
      type,
      seed: Math.random(),
    });
    asteroid.scannerRevealed = this.stats.rareScanner > 0;
    if (this.stats.rareScanner > 0 && (asteroidMeta?.rarity === 'rare' || asteroidMeta?.rarity === 'epic') && this.scannerPingCooldown <= 0) {
      this.scannerPingCooldown = 8;
      this.game.ui.showToast(`Scanner ping: ${asteroidMeta.name}`, 'success');
      this.game.audio.playRareFind();
    }
    return asteroid;
  }

  acquireAsteroid(options) {
    const asteroid = this.asteroidPool.pop();
    return asteroid ? asteroid.reset(options) : new Asteroid(options);
  }

  releaseAsteroid(asteroid) {
    asteroid.active = false;
    if (this.asteroidPool.length < (gameBalance.mining.maxAsteroidPool || 24)) this.asteroidPool.push(asteroid);
  }

  chooseAsteroidType(distanceFromStation, zoneId) {
    const distanceBand = gameBalance.mining.asteroidDistanceBands
      ?.find((band) => distanceFromStation >= band.minDistance && distanceFromStation < band.maxDistance);
    const sourceWeights = distanceBand?.weights;
    const weighted = asteroidData
      .map((asteroid) => ({
        id: asteroid.id,
        weight: sourceWeights?.[asteroid.id] ?? asteroid.zoneWeights[zoneId] ?? 0,
      }))
      .filter((entry) => entry.weight > 0);
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.id;
    }
    return weighted[0]?.id || 'stone';
  }

  spawnRareAsteroid() {
    const rareTypes = asteroidData.filter((asteroid) => ['rare', 'epic'].includes(asteroid.rarity));
    const meta = rareTypes[Math.floor(Math.random() * rareTypes.length)] || ASTEROID_META_BY_ID.void;
    const angle = this.ship.angle || 0;
    const distance = 360;
    const asteroid = this.acquireAsteroid({
      x: this.ship.x + Math.cos(angle) * distance,
      y: this.ship.y + Math.sin(angle) * distance,
      type: meta.id,
      seed: Math.random(),
    });
    asteroid.scannerRevealed = true;
    this.asteroids.push(asteroid);
    this.game.audio.playRareFind();
  }

  jumpToStation() {
    this.ship.x = 0;
    this.ship.y = 0;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.shipSmoke?.clear();
    this.distanceFromStation = 0;
    this.updateHud(true);
  }

  update(delta) {
    if (this.ending) return;
    this.time += delta;
    this.cargoDumpCooldown = Math.max(0, this.cargoDumpCooldown - delta);
    if (this.cargoDumping) {
      this.updateCargoDump(delta);
      this.updateCamera(delta);
      this.updateShipSmoke(delta);
      this.updateParticles(delta);
      this.updateHud();
      return;
    }
    this.shieldTimer = Math.max(0, this.shieldTimer - delta);
    this.distanceFromStation = this.getDistanceFromStation();
    if (this.handleOutOfFuelReturn()) return;
    this.tryAutoCargoDump();
    if (this.cargoDumping) {
      this.updateCargoDump(delta);
      this.updateCamera(delta);
      this.updateShipSmoke(delta);
      this.updateHud();
      return;
    }
    this.updateFuel(delta);
    if (this.handleOutOfFuelReturn() || this.ending) return;
    this.ship.update(delta, this.game.input, this.stats.fuel / this.stats.maxFuel);
    this.distanceFromStation = this.getDistanceFromStation();
    this.updateEngineAudio();
    this.updateDistanceProgress(delta);
    this.updateZone(delta);
    this.updateNavigation(delta);
    this.updateDockInput();
    this.updateLanding(delta);
    this.updateCamera(delta);
    this.updateShipSmoke(delta);
    this.updateAsteroids(delta);
    this.updateMining(delta);
    this.updatePickups(delta);
    this.updateParticles(delta);
    this.handleCollisions();
    this.updateAmbientParticles(delta);
    this.hudRefreshTimer -= delta;
    if (this.hudRefreshTimer <= 0) {
      this.hudRefreshTimer = gameBalance.ui?.hudUpdateInterval || 0.08;
      this.updateHud();
    }
  }

  tryAutoCargoDump() {
    if (this.cargoDumping || this.ending || this.cargoDumpCooldown > 0 || this.runCargoCount <= 0) return;
    if (this.distanceFromStation * this.distanceFromStation > DOCK_RADIUS_SQ) return;
    this.beginCargoDump({ returnToStation: false });
  }

  beginCargoDump({ returnToStation = false, summaryType = 'docked' } = {}) {
    this.cargoDumping = true;
    this.cargoDumpTimer = 1.15;
    this.cargoDumpReturnToStation = returnToStation;
    this.cargoDumpSummary = this.createSummary(summaryType, { ...this.runCargo });
    if (returnToStation) {
      this.ship.vx *= 0.2;
      this.ship.vy *= 0.2;
    }
    this.stopLaserAudio();
    this.game.ui.showToast(
      returnToStation ? 'Docking and unloading cargo...' : 'Cargo bay dumping to station...',
      'success',
      1400,
    );
    this.game.audio.playShipDock();
    this.game.audio.playPickup();
    this.spawnCargoTransferEffects();
    this.game.systems.tutorial.onDockAvailable();
  }

  updateCargoDump(delta) {
    this.cargoDumpTimer -= delta;
    if (this.cargoDumpReturnToStation) {
      this.ship.vx *= Math.max(0, 1 - delta * 7);
      this.ship.vy *= Math.max(0, 1 - delta * 7);
    } else {
      this.ship.update(delta, this.game.input, this.stats.fuel / this.stats.maxFuel);
      this.distanceFromStation = this.getDistanceFromStation();
      this.updateEngineAudio();
    }
    for (let index = 0; index < this.cargoTransferEffects.length; index += 1) {
      const effect = this.cargoTransferEffects[index];
      effect.age += delta;
    }
    if (this.cargoDumpTimer > 0) return;
    if (this.cargoDumpReturnToStation) {
      this.ending = true;
      this.game.audio.playDockSuccess();
      this.game.dockFromMining({ cargo: this.runCargo, summary: this.cargoDumpSummary });
      return;
    }
    this.finishCargoDumpAndContinue();
  }

  finishCargoDumpAndContinue() {
    const cargoSnapshot = { ...this.runCargo };
    const totalItems = Object.values(cargoSnapshot).reduce((total, amount) => total + amount, 0);
    const { creditsEarned } = this.game.depositMiningCargo({
      cargo: cargoSnapshot,
      summary: this.cargoDumpSummary,
      recordDocked: true,
    });
    this.runCargo = this.game.systems.inventory.getRunCargo();
    this.runCargoCount = 0;
    this.runCargoWeight = 0;
    this.stats.cargo = 0;
    this.cargoDumping = false;
    this.cargoDumpReturnToStation = false;
    this.cargoDumpTimer = 0;
    this.cargoDumpSummary = null;
    this.cargoDumpCooldown = 1.25;
    this.cargoTransferEffects = [];
    this.game.audio.playDockSuccess();
    this.game.ui.showToast(`Cargo stored: ${totalItems} items (+${creditsEarned}c assay)`, 'success', 1800);
    this.addFloatingText(this.ship.x, this.ship.y - 34, `+${creditsEarned}c Assay`, { color: '#ffd36b', rarity: 'uncommon' });
    this.updateHud(true);
  }

  spawnCargoTransferEffects() {
    this.cargoTransferEffects = [];
    let effectIndex = 0;
    Object.entries(this.runCargo).forEach(([materialId, amount]) => {
      const material = this.game.systems.materials.getMaterial(materialId);
      const visibleCount = Math.max(1, Math.min(6, amount));
      for (let i = 0; i < visibleCount; i += 1) {
        const spread = (effectIndex % 7) - 3;
        this.cargoTransferEffects.push({
          materialId,
          icon: material?.icon || '*',
          color: material?.color || '#ffd36b',
          age: -effectIndex * 0.045,
          life: 0.78 + (i % 3) * 0.08,
          startX: this.ship.x + Math.cos(effectIndex * 1.8) * 18,
          startY: this.ship.y + Math.sin(effectIndex * 2.1) * 14,
          endX: spread * 10,
          endY: -18 - (effectIndex % 3) * 7,
          arc: 80 + (effectIndex % 4) * 18,
          size: 15 + (effectIndex % 3) * 2,
        });
        effectIndex += 1;
      }
    });
    this.spawnBurst(this.ship.x, this.ship.y, '#ffd36b', Math.min(22, 8 + effectIndex), 120);
  }

  updateDistanceProgress(delta) {
    this.stats.maxDistance = Math.max(this.stats.maxDistance, this.distanceFromStation);
    this.distanceRecordTimer -= delta;
    if (this.distanceRecordTimer > 0) return;
    this.distanceRecordTimer = gameBalance.ui?.distanceObjectiveInterval || 0.45;
    this.game.state.stats ||= {};
    this.game.state.stats.farthestDistanceReached = Math.max(
      this.game.state.stats.farthestDistanceReached || 0,
      this.stats.maxDistance,
    );
    this.game.systems.objectives.record('distanceReached', { distance: this.stats.maxDistance });
  }

  updateFuel(delta) {
    const distance = this.distanceFromStation;
    if (distance * distance < STATION_SAFE_RADIUS_SQ) return;
    const moving = Math.hypot(this.game.input.moveVector.x, this.game.input.moveVector.y);
    const distancePressure = Math.max(0, distance - 2700) / 2700;
    const drain = gameBalance.mining.baseFuelDrain
      + moving * gameBalance.mining.movingFuelDrain * (1 + this.currentZone.difficulty * 0.55)
      + (this.game.input.actions.mine ? gameBalance.mining.miningFuelDrain : 0)
      + distancePressure * 0.9;
    this.stats.fuel = Math.max(0, this.stats.fuel - drain * delta);
    if (this.stats.fuel <= this.stats.maxFuel * 0.18 && this.lowFuelToastReady) {
      this.lowFuelToastReady = false;
      this.game.ui.showToast('Fuel low. Follow the beacon home.', 'danger');
      this.game.audio.playLowFuelWarning();
    }
  }

  updateZone(delta) {
    const distance = this.distanceFromStation;
    const lockedZone = this.game.systems.research.getLockedZoneForDistance(distance);
    if (lockedZone && lockedZone.id !== this.lockedZoneToastId) {
      this.lockedZoneToastId = lockedZone.id;
      this.game.ui.showToast(`${lockedZone.name} needs research`, 'danger');
      this.game.audio.playError();
    }
    const zone = this.getZoneForDistance(distance);
    this.currentZone = zone;
    this.scannerPingCooldown = Math.max(0, this.scannerPingCooldown - delta);
    this.zoneBannerTimer = Math.max(0, this.zoneBannerTimer - delta);
    this.stats.farthestZone = zone.name;
    if (zone.id !== this.previousZoneId) {
      this.previousZoneId = zone.id;
      this.zoneBannerTimer = 2.4;
      this.game.ui.showToast(`Entering ${zone.name}`, 'success');
      this.game.audio.playSceneTransition();
    }
  }

  getZoneForDistance(distance) {
    return this.game.systems.research.getZoneForDistance(distance);
  }

  updateCamera(delta) {
    this.camera.x += (this.ship.x - this.camera.x) * Math.min(1, delta * 4.5);
    this.camera.y += (this.ship.y - this.camera.y) * Math.min(1, delta * 4.5);
    this.camera.shake = Math.max(0, this.camera.shake - delta * 4);
    const trauma = this.camera.shake * this.camera.shake;
    this.camera.shakeX = (Math.random() - 0.5) * trauma * 22;
    this.camera.shakeY = (Math.random() - 0.5) * trauma * 22;
  }

  updateShipSmoke(delta) {
    this.shipSmoke.update({
      delta,
      viewport: this.game.viewport,
      ship: this.ship,
      camera: this.cameraView,
      input: this.game.input,
      fuelRatio: this.stats.fuel / Math.max(1, this.stats.maxFuel),
      viewScale: this.viewScale,
    });
  }

  updateAsteroids(delta) {
    const cullDistanceSq = gameBalance.mining.asteroidCullDistance ** 2;
    const keepNearStation = this.distanceFromStation < 900;
    let writeIndex = 0;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      asteroid.update(delta, this.time);
      if (keepNearStation || this.distanceToShipSq(asteroid) < cullDistanceSq) {
        this.asteroids[writeIndex] = asteroid;
        writeIndex += 1;
      } else {
        this.releaseAsteroid(asteroid);
      }
    }
    this.asteroids.length = writeIndex;
    while (this.asteroids.length < gameBalance.mining.targetAsteroidCount) {
      const asteroid = this.createAsteroid(gameBalance.mining.asteroidSpawnMinDistance);
      if (asteroid.x * asteroid.x + asteroid.y * asteroid.y > 260 * 260) this.asteroids.push(asteroid);
      else this.releaseAsteroid(asteroid);
    }
    if (this.asteroids.length > gameBalance.mining.maxAsteroidCount) {
      this.asteroids.sort((a, b) => this.distanceToShipSq(a) - this.distanceToShipSq(b));
      this.asteroids.splice(gameBalance.mining.maxAsteroidCount).forEach((asteroid) => this.releaseAsteroid(asteroid));
    }
  }

  updateMining(delta) {
    this.laserTarget = null;
    if (this.landingIsland) {
      this.stopLaserAudio();
      return;
    }
    if (!this.game.input.actions.mine) {
      this.stopLaserAudio();
      return;
    }
    const target = this.findMiningTarget();
    if (!target) {
      this.stopLaserAudio();
      return;
    }

    this.laserTarget = target;
    this.startLaserAudio();
    this.mineTick -= delta;
    if (this.mineTick <= 0) {
      this.mineTick = 0.12;
      this.game.audio.playAsteroidHit();
      if (target.health / target.maxHealth < 0.45) this.game.audio.playAsteroidCrack();
      this.spawnHitParticles(target.x, target.y, target.data.accent);
    }

    const damage = (16 + this.stats.miningPower * 12) * delta;
    if (target.takeDamage(damage)) {
      this.breakAsteroid(target);
      this.removeAsteroid(target);
      this.stopLaserAudio();
    }
  }

  removeAsteroid(target) {
    const index = this.asteroids.indexOf(target);
    if (index >= 0) this.asteroids.splice(index, 1);
    this.releaseAsteroid(target);
  }

  startLaserAudio() {
    if (this.laserWasActive) return;
    this.laserWasActive = true;
    this.game.audio.playLaserStart();
    this.game.audio.startLaserLoop();
  }

  stopLaserAudio() {
    if (!this.laserWasActive) return;
    this.laserWasActive = false;
    this.game.audio.stopLaserLoop();
  }

  updateEngineAudio() {
    const moving = Math.hypot(this.game.input.moveVector.x, this.game.input.moveVector.y) > 0.12;
    if (moving && !this.engineBoosting) {
      this.engineBoosting = true;
      this.game.audio.startEngineBoost();
      return;
    }
    if (!moving && this.engineBoosting) {
      this.engineBoosting = false;
      this.game.audio.stopEngineBoost();
    }
  }

  findMiningTarget() {
    let closest = null;
    let closestDistanceSq = Infinity;
    const rangeSq = this.stats.miningRange * this.stats.miningRange;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      const distanceSq = this.distanceToShipSq(asteroid);
      if (distanceSq < rangeSq && distanceSq < closestDistanceSq) {
        closest = asteroid;
        closestDistanceSq = distanceSq;
      }
    }
    return closest;
  }

  breakAsteroid(asteroid) {
    this.stats.asteroidsMined += 1;
    this.game.state.stats ||= {};
    this.game.state.stats.totalAsteroidsMined = (this.game.state.stats.totalAsteroidsMined || 0) + 1;
    this.game.systems.achievements.record('asteroidMined', { asteroidType: asteroid.type });
    if (asteroid.data.rarity === 'rare' || asteroid.data.rarity === 'epic') this.stats.rareFinds += 1;
    asteroid.getDropPayload().forEach((drop, index) => {
      const material = this.game.systems.materials.getMaterial(drop.materialId);
      if (
        this.stats.precisionCutter > 0
        && ['rare', 'epic'].includes(material?.rarity)
        && Math.random() < 0.08 * this.stats.precisionCutter
      ) {
        drop.amount += 1;
      }
      this.pickups.push(this.acquirePickup({
        materialId: drop.materialId,
        amount: drop.amount,
        x: asteroid.x + Math.cos(index * 2.2) * 16,
        y: asteroid.y + Math.sin(index * 2.2) * 16,
        seed: Math.random(),
        material,
      }));
    });
    this.spawnBurst(asteroid.x, asteroid.y, asteroid.data.accent, 16);
    this.game.audio.playAsteroidBreak();
    if (asteroid.data.explodesOnBreak) this.explodeAsteroid(asteroid);
    this.addScreenShake(asteroid.data.rarity === 'rare' || asteroid.data.rarity === 'epic' ? 0.48 : 0.35);
    if (asteroid.data.rarity === 'rare' || asteroid.data.rarity === 'epic') this.rareFindBurst(asteroid.x, asteroid.y, asteroid.data.accent);
  }

  acquirePickup(options) {
    const pickup = this.pickupPool.pop() || new MineralPickup();
    return pickup.reset(options);
  }

  releasePickup(pickup) {
    pickup.active = false;
    if (this.pickupPool.length < (gameBalance.mining.maxPickupPool || 80)) this.pickupPool.push(pickup);
  }

  explodeAsteroid(asteroid) {
    this.spawnBurst(asteroid.x, asteroid.y, '#ff8f3d', 34, 210);
    this.addScreenShake(0.55);
    if (this.distanceToShipSq(asteroid) < (asteroid.radius + 90) ** 2) {
      if (this.tryAbsorbCollision()) {
        this.game.ui.showToast('Shield absorbed blast', 'success');
        this.game.audio.playSuccess();
        return;
      }
      if (this.game.state.debug?.invincible) return;
      this.stats.hull = Math.max(0, this.stats.hull - 14);
      this.ship.applyKnockback(asteroid.x, asteroid.y, 260);
      if (this.stats.hull <= 0) this.crash();
    }
  }

  updatePickups(delta) {
    for (let index = 0; index < this.pickups.length; index += 1) this.pickups[index].update(delta);
    this.applyMagnetToPickups(delta);
    const cullDistanceSq = gameBalance.mining.pickupCullDistance ** 2;
    let writeIndex = 0;
    for (let index = 0; index < this.pickups.length; index += 1) {
      const pickup = this.pickups[index];
      if (this.distanceToShipSq(pickup) > cullDistanceSq) {
        this.releasePickup(pickup);
        continue;
      }
      if (!this.collidesWithShip(pickup)) {
        this.pickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      const cargoResult = this.game.systems.inventory.addToRunCargo(pickup.materialId, pickup.amount, {
        capacity: this.stats.cargoCapacity,
      });
      if (!cargoResult.ok) {
        if (this.cargoFullToastReady) {
          this.cargoFullToastReady = false;
          this.game.ui.showToast('Cargo Full', 'danger');
          this.game.audio.playCargoFull();
          this.hud.cargoBar?.classList.add('is-shaking');
          window.setTimeout(() => {
            this.cargoFullToastReady = true;
            this.hud.cargoBar?.classList.remove('is-shaking');
          }, 1200);
        }
        this.pickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      this.runCargo = cargoResult.cargo;
      this.game.systems.objectives.record('materialCollected', {
        materialId: pickup.materialId,
        amount: pickup.amount,
      });
      this.runCargoCount += pickup.amount;
      this.runCargoWeight = cargoResult.currentWeight;
      this.stats.cargo = Math.ceil(this.runCargoWeight);
      const material = this.game.systems.materials.getMaterial(pickup.materialId);
      this.addFloatingText(
        pickup.x,
        pickup.y,
        `+${pickup.amount} ${this.game.systems.materials.getDisplayName(pickup.materialId)}`,
        { color: material?.color || '#fff2cf', rarity: material?.rarity || 'common' },
      );
      this.game.audio.playMineralPickup();
      if (material && material.rarity !== 'common') {
        this.game.systems.achievements.record('rareFind', { materialId: pickup.materialId, rarity: material.rarity });
      }
      if (material?.rarity === 'rare' || material?.rarity === 'epic') {
        this.game.audio.playRareFind();
        this.rareFindBurst(pickup.x, pickup.y, material.color);
      }
      this.releasePickup(pickup);
    }
    this.pickups.length = writeIndex;
  }

  updateNavigation(delta) {
    const navigation = this.game.systems.navigation;
    navigation.getLocations({ tab: 'locations', includeLocked: true }).forEach((location) => {
      if (navigation.isDiscovered(location.id)) return;
      const distance = navigation.getDistanceTo(location, this.ship);
      if (distance <= 240) navigation.discoverLocation(location.id);
    });

    if (!navigation.isUnlocked()) {
      this.hud?.gpsPanel?.classList.add('is-hidden');
      return;
    }

    const destination = navigation.getSelectedDestination();
    if (!destination) {
      this.hud?.gpsPanel?.classList.add('is-hidden');
      return;
    }

    const dx = destination.worldPosition.x - this.ship.x;
    const dy = destination.worldPosition.y - this.ship.y;
    const distance = Math.hypot(dx, dy);
    this.hud.gpsPanel.classList.remove('is-hidden');
    this.hud.gpsArrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    this.setHudText('gpsName', this.hud.gpsName, destination.name);
    this.setHudText('gpsDistance', this.hud.gpsDistance, `${Math.round(distance)}m`);
    const warning = this.stats.fuel < destination.recommendedFuel * 0.42 ? 'Fuel risk' : '';
    this.setHudText('gpsWarning', this.hud.gpsWarning, warning);

    this.gpsPingTimer -= delta;
    if (distance < 560 && this.gpsPingTimer <= 0) {
      this.gpsPingTimer = 2.2;
      this.game.audio.playGpsPing?.();
    }

    if (distance <= 190 && this.destinationReachedId !== destination.id) {
      this.destinationReachedId = destination.id;
      navigation.discoverLocation(destination.id, { notify: false });
      this.game.ui.showToast(`Destination Reached: ${destination.name}`, 'success', 2400);
      this.game.audio.playDestinationReached?.();
    }
  }

  updateLanding() {
    let nearest = null;
    let nearestDistanceSq = Infinity;
    for (const island of this.rockIslands) {
      const distanceSq = island.distanceSqTo(this.ship);
      if (distanceSq <= island.radius * island.radius && distanceSq < nearestDistanceSq) {
        nearest = island;
        nearestDistanceSq = distanceSq;
      }
    }
    if (nearest && this.landingIsland !== nearest) {
      this.game.ui.showToast('Landing Zone Detected', 'success', 1300);
      this.game.audio.playGpsPing?.();
    }
    this.landingIsland = nearest;
    this.hud?.landingPrompt?.classList.toggle('is-hidden', !nearest);
    if (nearest) {
      this.setHudText('landingPrompt', this.hud.landingPrompt, `Landing Zone Detected - ${nearest.name}`);
      if (this.mineButtonLabel) this.mineButtonLabel.textContent = 'Land';
      if (this.mineButtonIcon) this.mineButtonIcon.textContent = 'L';
      this.mineButton?.classList.add('is-land-mode');
      const actions = this.game.input.actions;
      const mineTap = actions.justPressed.mine && !this.game.input.keys.has(' ');
      if (actions.justPressed.interact || actions.justPressed.confirm || mineTap) this.landOnIsland(nearest);
      return;
    }
    if (this.mineButtonLabel) this.mineButtonLabel.textContent = 'Mine';
    if (this.mineButtonIcon) this.mineButtonIcon.textContent = 'M';
    this.mineButton?.classList.remove('is-land-mode');
  }

  updateDockInput() {
    if (this.cargoDumping || this.ending) return;
    if (this.distanceFromStation * this.distanceFromStation > DOCK_RADIUS_SQ) return;
    const actions = this.game.input.actions;
    if (actions.justPressed.interact || actions.justPressed.confirm) this.dock();
  }

  handleOutOfFuelReturn() {
    if (this.stats.fuel > 0 || this.ending || this.outOfFuelReturnQueued) return false;
    if (this.distanceFromStation * this.distanceFromStation <= DOCK_RADIUS_SQ && this.runCargoCount > 0) {
      this.outOfFuelReturnQueued = true;
      this.game.ui.showToast('Out of fuel. Docking after cargo drop...', 'danger', 2400);
      this.game.audio.playLowFuelWarning();
      this.beginCargoDump({ returnToStation: true, summaryType: 'outOfFuel' });
      return true;
    }
    this.queueOutOfFuelReturn();
    return true;
  }

  landOnIsland(island) {
    if (this.ending) return;
    this.ending = true;
    this.stopLaserAudio();
    this.game.audio.playLandShip?.();
    this.game.systems.navigation.discoverLocation(island.id, { notify: false });
    this.game.ui.root.classList.add('dock-wipe');
    window.setTimeout(() => {
      this.game.ui.root.classList.remove('dock-wipe');
      this.game.sceneManager.switchTo('island', {
        islandId: island.id,
        shipPosition: { x: island.x, y: island.y },
        miningStats: { ...this.stats },
      });
    }, 360);
  }

  applyMagnetToPickups(delta) {
    if (!this.stats.collectionMagnet) return;
    this.pickups.forEach((pickup) => {
      const dx = this.ship.x - pickup.x;
      const dy = this.ship.y - pickup.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > this.stats.collectionMagnet * this.stats.collectionMagnet) return;
      const distance = Math.sqrt(distanceSq) || 1;
      const pull = (1 - distance / this.stats.collectionMagnet) * 260;
      pickup.vx += (dx / distance) * pull * delta;
      pickup.vy += (dy / distance) * pull * delta;
    });
  }

  handleCollisions() {
    if (this.ship.hitCooldown > 0) return;
    let hit = null;
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index];
      if (this.collidesWithShip(asteroid)) {
        hit = asteroid;
        break;
      }
    }
    if (!hit) return;
    if (this.tryAbsorbCollision()) {
      this.spawnBurst(this.ship.x, this.ship.y, '#76f3ff', 18);
      this.addScreenShake(0.35);
      this.game.ui.showToast('Shield absorbed impact', 'success');
      this.game.audio.playSuccess();
      return;
    }
    if (this.game.state.debug?.invincible) {
      this.ship.applyKnockback(hit.x, hit.y, hit.data.slippery ? 260 : 190);
      this.spawnBurst(this.ship.x, this.ship.y, '#76f3ff', 10);
      return;
    }
    this.stats.hull = Math.max(0, this.stats.hull - hit.data.damage);
    this.ship.applyKnockback(hit.x, hit.y, hit.data.slippery ? 430 : 300);
    this.addScreenShake(0.75);
    this.spawnBurst(this.ship.x, this.ship.y, '#ff756f', 14);
    this.game.audio.playShipHit();
    if (this.stats.hull <= 0) this.crash();
  }

  tryAbsorbCollision() {
    if (!this.stats.shieldCharges || this.shieldTimer > 0) return false;
    this.shieldTimer = this.stats.shieldCooldown || 24;
    return true;
  }

  updateParticles(delta) {
    let particleWrite = 0;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      particle.age += delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.max(0, 1 - delta * 1.4);
      particle.vy *= Math.max(0, 1 - delta * 1.4);
      if (particle.age < particle.life) {
        this.particles[particleWrite] = particle;
        particleWrite += 1;
      } else {
        this.releaseParticle(particle);
      }
    }
    this.particles.length = particleWrite;

    let textWrite = 0;
    for (let index = 0; index < this.floatingText.length; index += 1) {
      const text = this.floatingText[index];
      text.age += delta;
      text.y -= 24 * delta;
      if (text.age < 1.15) {
        this.floatingText[textWrite] = text;
        textWrite += 1;
      } else {
        this.releaseFloatingText(text);
      }
    }
    this.floatingText.length = textWrite;
  }

  spawnHitParticles(x, y, color) {
    this.spawnBurst(x, y, color, 3, 55);
  }

  spawnBurst(x, y, color, count, speed = 115) {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random() * 0.8);
      const particle = this.particlePool.pop() || {};
      Object.assign(particle, {
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color,
        age: 0,
        life: 0.35 + Math.random() * 0.45,
      });
      this.particles.push(particle);
    }
  }

  releaseParticle(particle) {
    if (this.particlePool.length < MAX_PARTICLES) this.particlePool.push(particle);
  }

  addScreenShake(amount = 0.35) {
    this.camera.shake = Math.max(this.camera.shake, amount);
  }

  addFloatingText(x, y, text, { color = '#fff2cf', rarity = 'common' } = {}) {
    if (this.floatingText.length >= MAX_FLOATING_TEXT) {
      const oldest = this.floatingText.shift();
      if (oldest) this.releaseFloatingText(oldest);
    }
    const item = this.floatingTextPool.pop() || {};
    Object.assign(item, { x, y, text, color, rarity, age: 0 });
    this.floatingText.push(item);
  }

  releaseFloatingText(text) {
    if (this.floatingTextPool.length < MAX_FLOATING_TEXT) this.floatingTextPool.push(text);
  }

  rareFindBurst(x, y, color) {
    this.spawnBurst(x, y, color, 28, 170);
    this.addFloatingText(x, y - 24, 'Rare Find!', { color, rarity: 'rare' });
  }

  dock() {
    if (this.getDistanceFromStation() > DOCK_RADIUS || this.ending) return;
    if (this.runCargoCount > 0) {
      this.beginCargoDump({ returnToStation: true });
      return;
    }
    this.ending = true;
    const summary = this.createSummary('docked', this.runCargo);
    this.game.dockFromMining({ cargo: this.runCargo, summary });
  }

  queueOutOfFuelReturn() {
    if (this.ending || this.outOfFuelReturnQueued) return;
    this.outOfFuelReturnQueued = true;
    this.ending = true;
    this.stopLaserAudio();
    this.game.audio.stopEngineBoost();
    this.addScreenShake(0.45);
    this.spawnBurst(this.ship.x, this.ship.y, '#ff756f', 18, 120);
    this.addFloatingText(this.ship.x, this.ship.y - 34, 'Out of Fuel', { color: '#ff756f', rarity: 'rare' });
    this.game.ui.showToast('Out of fuel. Station tow engaged.', 'danger', 2400);
    this.game.audio.playLowFuelWarning();
    this.game.audio.playSceneTransition();
    const summary = this.createSummary('outOfFuel', this.runCargo);
    window.setTimeout(() => {
      this.game.dockFromMining({ cargo: this.runCargo, summary });
    }, 650);
  }

  recallToStation() {
    if (!this.stats.emergencyRecall || this.recallUsed || this.ending) return;
    this.recallUsed = true;
    this.ending = true;
    const summary = this.createSummary('recalled', this.runCargo);
    this.game.ui.showToast('Emergency recall engaged', 'success');
    this.game.audio.playSceneTransition();
    window.setTimeout(() => {
      this.game.dockFromMining({ cargo: this.runCargo, summary });
    }, 420);
  }

  crash() {
    if (this.ending) return;
    this.ending = true;
    const keptCargo = {};
    const lostCargo = {};
    Object.entries(this.runCargo).forEach(([itemId, amount]) => {
      const kept = Math.floor(amount * 0.3);
      if (kept > 0) keptCargo[itemId] = kept;
      const lost = amount - kept;
      if (lost > 0) lostCargo[itemId] = lost;
    });
    this.spawnBurst(this.ship.x, this.ship.y, '#ff8f3d', 38, 180);
    this.addScreenShake(0.9);
    this.game.audio.playShipCrash();
    this.game.systems.achievements.record('shipCrashed');
    const summary = this.createSummary('crashed', keptCargo, lostCargo);
    window.setTimeout(() => {
      this.game.dockFromMining({ cargo: keptCargo, summary });
    }, 500);
  }

  createSummary(type, cargo, lostCargo = {}) {
    return {
      type,
      cargo,
      lostCargo,
      distance: Math.round(this.stats.maxDistance),
      asteroidsMined: this.stats.asteroidsMined,
      rareFinds: this.stats.rareFinds,
      farthestZone: this.stats.farthestZone,
    };
  }

  updateHud(force = false) {
    const hullRatio = this.stats.hull / this.stats.maxHull;
    const fuelRatio = this.stats.fuel / this.stats.maxFuel;
    const cargoRatio = this.stats.cargo / this.stats.cargoCapacity;
    this.setHudText('hullText', this.hud.hullText, `${Math.ceil(this.stats.hull)}/${this.stats.maxHull}`, force);
    this.setHudText('fuelText', this.hud.fuelText, `${Math.ceil(this.stats.fuel)}/${this.stats.maxFuel}`, force);
    this.setHudText('cargoText', this.hud.cargoText, `${this.stats.cargo}/${this.stats.cargoCapacity}`, force);
    this.setHudWidth('hullFill', this.hud.hullFill, Math.round(hullRatio * 100), force);
    this.setHudWidth('fuelFill', this.hud.fuelFill, Math.round(fuelRatio * 100), force);
    this.setHudWidth('cargoFill', this.hud.cargoFill, Math.round(cargoRatio * 100), force);

    const distance = this.distanceFromStation;
    this.setHudText('distanceText', this.hud.distanceText, `${Math.round(distance)}m`, force);
    this.setHudText('zoneChip', this.hud.zoneChip, this.currentZone.name, force);
    this.setHudText('zoneBanner', this.hud.zoneBanner, this.currentZone.name, force);
    this.setHudClass('zoneBannerVisible', this.hud.zoneBanner, 'is-visible', this.zoneBannerTimer > 0, force);
    const angleToStation = Math.atan2(-this.ship.y, -this.ship.x);
    this.hud.stationArrow.style.transform = `rotate(${angleToStation + Math.PI / 2}rad)`;
    const dockVisible = distance * distance <= DOCK_RADIUS_SQ && !this.cargoDumping;
    this.setHudClass('dockVisible', this.dockButton, 'is-hidden', !dockVisible, force);
    if (dockVisible && this.runCargoCount > 0) this.game.systems.tutorial.onDockAvailable();
    this.setHudClass(
      'recallVisible',
      this.recallButton,
      'is-hidden',
      !this.stats.emergencyRecall || this.recallUsed || distance < DOCK_RADIUS * 1.4,
      force,
    );

    const warnings = [];
    if (fuelRatio <= 0.18) warnings.push('LOW FUEL');
    if (hullRatio <= 0.25) warnings.push('HULL CRITICAL');
    if (this.stats.cargo >= this.stats.cargoCapacity) warnings.push('CARGO FULL');
    this.setHudText('warning', this.hud.warning, warnings.join('  '), force);
    this.setHudClass('warningPulse', this.hud.warning, 'is-pulsing', warnings.length > 0, force);
    this.setHudClass('fuelLow', this.hud.fuelBar, 'is-low', fuelRatio <= 0.18, force);
    this.setHudClass('hullLow', this.hud.hullBar, 'is-low', hullRatio <= 0.25, force);
    this.game.audio.setDangerMode(fuelRatio <= 0.18 || hullRatio <= 0.25);
  }

  setHudText(key, element, value, force = false) {
    if (!element || (!force && this.hudCache[key] === value)) return;
    this.hudCache[key] = value;
    element.textContent = value;
  }

  setHudWidth(key, element, percent, force = false) {
    const value = `${Math.max(0, Math.min(100, percent))}%`;
    if (!element || (!force && this.hudCache[key] === value)) return;
    this.hudCache[key] = value;
    element.style.width = value;
  }

  setHudClass(key, element, className, enabled, force = false) {
    if (!element || (!force && this.hudCache[key] === enabled)) return;
    this.hudCache[key] = enabled;
    element.classList.toggle(className, enabled);
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawSpace(ctx, width, height);
    this.drawAmbientParticles(ctx);
    ctx.save();
    this.applyWorldScale(ctx, width, height);
    this.drawStation(ctx);
    const camera = this.cameraView;
    this.rockIslands.forEach((island) => {
      const distanceSq = island.distanceSqTo(this.ship);
      if (distanceSq > 1900 * 1900 && island !== this.landingIsland) return;
      island.draw(ctx, camera, {
        active: island === this.landingIsland,
        discovered: this.game.systems.navigation.isDiscovered(island.id),
        time: this.time,
      });
    });
    this.pickups.forEach((pickup) => pickup.draw(ctx, camera));
    this.asteroids.forEach((asteroid) => asteroid.draw(ctx, camera));
    this.drawLaser(ctx);
    this.drawParticles(ctx);
    ctx.restore();
    this.drawShipSmoke(ctx);
    ctx.save();
    this.applyWorldScale(ctx, width, height);
    this.ship.draw(ctx, camera, this.game.input);
    this.drawCargoTransferEffects(ctx);
    this.drawFloatingText(ctx);
    ctx.restore();
  }

  drawCargoTransferEffects(ctx) {
    if (!this.cargoTransferEffects.length) return;
    const camera = this.cameraView;
    this.cargoTransferEffects.forEach((effect) => {
      if (effect.age < 0) return;
      const t = Math.min(1, effect.age / effect.life);
      const ease = 1 - (1 - t) ** 3;
      const lift = Math.sin(t * Math.PI) * effect.arc;
      const x = effect.startX + (effect.endX - effect.startX) * ease;
      const y = effect.startY + (effect.endY - effect.startY) * ease - lift;
      const screen = camera.worldToScreen(x, y);
      const alpha = t > 0.86 ? Math.max(0, (1 - t) / 0.14) : Math.min(1, t / 0.16);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(screen.x, screen.y);
      ctx.rotate(effect.age * 7);
      ctx.fillStyle = effect.color;
      ctx.strokeStyle = '#081626';
      ctx.lineWidth = 3;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, effect.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#081626';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(effect.icon, 0, 1);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  applyWorldScale(ctx, width, height) {
    if (Math.abs(this.viewScale - 1) < 0.001) return;
    ctx.translate(width / 2, height / 2);
    ctx.scale(this.viewScale, this.viewScale);
    ctx.translate(-width / 2, -height / 2);
  }

  drawSpace(ctx, width, height) {
    const colors = this.currentZone.background;
    const key = `${this.currentZone.id}:${width}:${height}`;
    if (this.spaceBackdrop?.key !== key) {
      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width);
      gradient.addColorStop(0, colors.inner);
      gradient.addColorStop(0.52, colors.middle);
      gradient.addColorStop(1, colors.outer);
      this.spaceBackdrop = { key, gradient };
    }
    ctx.fillStyle = this.spaceBackdrop.gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 250, 226, 0.82)';
    for (let i = 0; i < 120; i += 1) {
      const parallax = 0.18 + (i % 4) * 0.09;
      const x = ((i * 97 - this.camera.x * parallax) % (width + 40) + width + 40) % (width + 40) - 20;
      const y = ((i * 53 - this.camera.y * parallax) % (height + 40) + height + 40) % (height + 40) - 20;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  updateAmbientParticles(delta) {
    while (this.ambientParticles.length < 36) {
      this.ambientParticles.push({
        x: Math.random(),
        y: Math.random(),
        speed: 0.08 + Math.random() * 0.12,
        size: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.ambientParticles.forEach((particle) => {
      particle.x = (particle.x + particle.speed * delta * 0.04) % 1;
      particle.y = (particle.y + particle.speed * delta * 0.02) % 1;
      particle.phase += delta;
    });
  }

  drawAmbientParticles(ctx) {
    const { width, height } = this.game.viewport;
    ctx.save();
    ctx.fillStyle = this.currentZone.particleColor;
    this.ambientParticles.forEach((particle) => {
      ctx.globalAlpha = 0.16 + Math.sin(particle.phase) * 0.08;
      ctx.beginPath();
      ctx.arc(particle.x * width, particle.y * height, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawStation(ctx) {
    const screen = this.cameraView.worldToScreen(0, 0);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = 'rgba(255, 143, 61, 0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#76f3ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#263a52';
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff8f3d';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLaser(ctx) {
    if (!this.laserTarget) return;
    const camera = this.cameraView;
    const start = camera.worldToScreen(this.ship.x, this.ship.y);
    const end = camera.worldToScreen(this.laserTarget.x, this.laserTarget.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 211, 107, 0.95)';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ff8f3d';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(118, 243, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(ctx) {
    const camera = this.cameraView;
    this.particles.forEach((particle) => {
      const screen = camera.worldToScreen(particle.x, particle.y);
      const alpha = 1 - particle.age / particle.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 2 + alpha * 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  drawShipSmoke(ctx) {
    this.shipSmoke.draw(ctx);
  }

  drawFloatingText(ctx) {
    const camera = this.cameraView;
    ctx.save();
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    this.floatingText.forEach((text) => {
      const screen = camera.worldToScreen(text.x, text.y);
      ctx.globalAlpha = 1 - text.age / 1.15;
      ctx.strokeStyle = '#081626';
      ctx.fillStyle = text.color || '#fff2cf';
      if (text.rarity === 'rare' || text.rarity === 'epic') {
        ctx.shadowColor = text.color;
        ctx.shadowBlur = text.rarity === 'epic' ? 14 : 8;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.strokeText(text.text, screen.x, screen.y);
      ctx.fillText(text.text, screen.x, screen.y);
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  getDistanceFromStation() {
    return Math.hypot(this.ship.x, this.ship.y);
  }

  distanceToShip(entity) {
    return Math.hypot(entity.x - this.ship.x, entity.y - this.ship.y);
  }

  distanceToShipSq(entity) {
    const dx = entity.x - this.ship.x;
    const dy = entity.y - this.ship.y;
    return dx * dx + dy * dy;
  }

  collidesWithShip(entity) {
    return this.distanceToShipSq(entity) < (entity.radius + this.ship.radius) ** 2;
  }
}
