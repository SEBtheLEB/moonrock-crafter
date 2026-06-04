import { Button } from '../ui/Button.js';
import { Joystick } from '../ui/Joystick.js';
import { Hotbar } from '../ui/Hotbar.js?v=158';
import { IslandPlayer } from '../entities/IslandPlayer.js?v=158';
import { CompanionDrone } from '../entities/CompanionDrone.js?v=158';
import { PlacedFlag } from '../entities/PlacedFlag.js?v=158';
import { MineralPickup } from '../entities/MineralPickup.js?v=158';
import { ElectricLaserRenderer } from '../effects/ElectricLaserRenderer.js?v=158';
import { TERRAIN_MATERIALS } from '../systems/TerrainGrid.js?v=158';
import { gameBalance } from '../data/gameBalance.js?v=158';

const TERRAIN_LASER_RANGE = 390;
const TERRAIN_MINING_BRUSH_RADIUS = 18;
const GOD_MODE_MINING_MULTIPLIER = 18;

export class IslandScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.island = this.game.systems.islands.getIsland(payload.islandId);
    this.shipPosition = payload.shipPosition || this.island.worldPosition;
    this.miningStats = {
      ...(payload.miningStats || {}),
      cargoCapacity: payload.miningStats?.cargoCapacity
        || this.game.systems.inventory.getRunCargoSlotCapacity?.()
        || this.game.state.ship.cargoSlots
        || this.game.state.ship.cargoMax
        || 14,
    };
    const currentCargoSlots = this.game.systems.inventory.getRunCargoSlotCount?.();
    this.miningStats.cargo = Number.isFinite(currentCargoSlots) ? currentCargoSlots : (this.miningStats.cargo || 0);
    this.world = null;
    this.terrain = null;
    this.player = null;
    this.combatDrone = new CompanionDrone({ cooldown: 0.46, damage: 1, targetRange: 560 });
    this.laserRenderer = new ElectricLaserRenderer();
    this.nodes = [];
    this.animals = [];
    this.time = 0;
    this.camera = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.viewScale = gameBalance.ui?.worldViewScale || 1;
    this.promptTarget = null;
    this.hudCache = {};
    this.floatingText = [];
    this.terrainParticles = [];
    this.terrainPickups = [];
    this.terrainPickupPool = [];
    this.miningBeam = null;
    this.terrainMiningHitFeedback = null;
    this.laserSoundActive = false;
    this.terrainDirty = false;
    this.placedFlags = [];
    this.flagPlacementPreview = null;
    this.toolCooldown = 0;
    this.mineBlockedCooldown = 0;
    this.cargoFullToastReady = true;
    this.exiting = false;
  }

  enter() {
    this.game.ui.setScreen('island-screen');
    this.resize(this.game.viewport);
    this.terrain = this.game.systems.islands.createTerrain(this.island, this.world);
    this.placedFlags = this.game.systems.islands.getSavedFlags(this.island.id).map((flag) => PlacedFlag.deserialize(flag));
    this.world.floorY = this.terrain.getSurfaceY(this.terrain.landingX);
    this.world.landingX = this.terrain.landingX;
    this.world.height = this.terrain.height;
    this.player = new IslandPlayer({ x: this.terrain.landingX + 58, y: 0 });
    this.player.y = this.world.floorY - this.player.height;
    const runtime = this.game.systems.islands.createRuntime(this.island, this.world, this.terrain);
    this.nodes = runtime.nodes;
    this.animals = runtime.animals;
    this.mountHud();
    this.mountControls();
    this.game.audio.playExitShip?.();
    this.game.systems.navigation.discoverLocation(this.island.id, { notify: false });
    this.game.state.islands ||= { visited: {} };
    this.game.state.islands.visited ||= {};
    this.game.state.islands.visited[this.island.id] = true;
  }

  resize(viewport = this.game.viewport) {
    if (!viewport) return;
    const worldHeight = Math.max(viewport.height * 1.18, (this.island.size?.height || 620) + 160);
    this.world = {
      width: Math.max(this.island.size?.width || 1280, this.getVisibleWorldWidth(viewport) + 360),
      height: worldHeight,
      floorY: Math.max(210, worldHeight * 0.62),
      landingX: 150,
    };
  }

  mountHud() {
    const hud = document.createElement('div');
    hud.className = 'island-hud';
    hud.innerHTML = `
      <div class="island-meter health-meter">
        <span>Health</span>
        <strong data-health-text></strong>
        <div><i data-health-fill></i></div>
      </div>
      <div class="island-title-chip">
        <span>${this.island.biome}</span>
        <strong>${this.island.name}</strong>
      </div>
      <div class="island-meter cargo-meter">
        <span>Cargo</span>
        <strong data-cargo-text></strong>
        <div><i data-cargo-fill></i></div>
      </div>
      <div class="island-cargo-preview" data-cargo-preview></div>
      <div class="island-prompt" data-island-prompt></div>
    `;
    this.game.ui.addSceneElement(hud);
    this.hud = {
      healthText: hud.querySelector('[data-health-text]'),
      healthFill: hud.querySelector('[data-health-fill]'),
      cargoText: hud.querySelector('[data-cargo-text]'),
      cargoFill: hud.querySelector('[data-cargo-fill]'),
      cargoPreview: hud.querySelector('[data-cargo-preview]'),
      prompt: hud.querySelector('[data-island-prompt]'),
    };
    this.updateHud(true);
  }

  mountControls() {
    const moveStick = new Joystick({ label: 'Walk', className: 'island-joystick' }).element;
    this.moveStick = moveStick;
    this.hotbar = new Hotbar(this.game, { className: 'island-tool-hotbar' });
    this.game.ui.addSceneElement(this.hotbar.element);
    const jumpButton = new Button('Jump', () => {}, {
      icon: '^',
      className: 'island-jump-button',
      variant: 'forge',
      holdAction: 'jump',
    }).element;
    const interactButton = new Button('Interact', () => this.useInteract(), {
      icon: 'E',
      className: 'island-interact-button',
      variant: 'success',
      holdAction: 'interact',
    }).element;
    const useButton = new Button('Use', () => {}, {
      icon: 'U',
      className: 'island-mine-button',
      variant: 'metal',
      holdAction: 'primaryUse',
    }).element;
    const actions = document.createElement('div');
    actions.className = 'island-action-controls';
    actions.append(jumpButton, interactButton, useButton);
    this.controls = this.game.ui.addControls([moveStick, actions]);
    this.controls.classList.add('island-mobile-controls');
    this.game.input.bindJoystick(moveStick, { mode: 'move', radius: 46, floating: true, activationRegion: 'left' });
    this.game.input.bindHoldButton(jumpButton, 'jump');
    this.game.input.bindHoldButton(interactButton, 'interact');
    this.game.input.bindHoldButton(useButton, 'primaryUse');
  }

  update(delta) {
    if (this.exiting) return;
    this.time += delta;
    this.hotbar?.update();
    this.toolCooldown = Math.max(0, this.toolCooldown - delta);
    this.mineBlockedCooldown = Math.max(0, this.mineBlockedCooldown - delta);
    const actions = this.game.input.actions;
    const spaceJump = actions.justPressed.jump && this.game.input.keys.has(' ');
    const keyboardJump = actions.justPressed.up
      && (this.game.input.keys.has('w') || this.game.input.keys.has('W') || this.game.input.keys.has('ArrowUp'));
    this.player.update(delta, {
      moveX: this.game.input.moveVector.x,
      jumpPressed: actions.justPressed.jump || keyboardJump || spaceJump,
    }, this.world, this.terrain);
    this.updateCamera(delta);
    this.nodes.forEach((node) => node.update(delta));
    this.animals.forEach((animal) => animal.update(delta, this.player, this.world));
    this.updateDroneCombat(delta);
    this.handleAnimalContact();
    this.updateFloatingText(delta);
    this.updateTerrainParticles(delta);
    this.updateTerrainPickups(delta);
    this.promptTarget = this.findPromptTarget();
    if (actions.justPressed.interact || actions.justPressed.confirm) this.useInteract();
    const miningInput = actions.mine;
    const miningStarted = actions.justPressed.mine;
    if (miningInput) this.updateTerrainMining(delta);
    else this.stopTerrainLaser();
    this.flagPlacementPreview = this.isFlagToolSelected() ? this.getFlagPlacementPreview() : null;
    if (actions.justPressed.placeFlag) this.placeFlag(this.flagPlacementPreview);
    if (actions.justPressed.tool) {
      this.useTool(this.getAimPoint(), { playError: actions.justPressed.tool || miningStarted });
    }
    if (actions.justPressed.attack) this.fireDroneAttack();
    this.updatePlacedFlags(delta);
    this.updateHud();
  }

  updateCamera(delta) {
    const viewportWidth = this.getVisibleWorldWidth();
    const viewportHeight = this.getVisibleWorldHeight();
    this.camera.targetX = Math.max(0, Math.min(this.world.width - viewportWidth, this.player.centerX - viewportWidth * 0.42));
    this.camera.targetY = Math.max(0, Math.min(this.world.height - viewportHeight, this.player.centerY - viewportHeight * 0.54));
    this.camera.x += (this.camera.targetX - this.camera.x) * Math.min(1, delta * 8);
    this.camera.y += (this.camera.targetY - this.camera.y) * Math.min(1, delta * 7);
  }

  getVisibleWorldWidth(viewport = this.game.viewport) {
    return (viewport?.width || 0) / Math.max(0.1, this.viewScale);
  }

  getVisibleWorldHeight(viewport = this.game.viewport) {
    return (viewport?.height || 0) / Math.max(0.1, this.viewScale);
  }

  handleAnimalContact() {
    this.animals.forEach((animal) => {
      if (!animal.active || animal.data.damage <= 0 || !animal.overlaps(this.player) || animal.attackCooldown > 0) return;
      animal.attackCooldown = 1.1;
      if (this.player.damage(animal.data.damage, animal.centerX)) {
        this.game.audio.playShipHit();
        this.game.screenShake(0.22);
        this.addFloatingText(`-${animal.data.damage}`, '#ff756f');
      }
    });
  }

  findPromptTarget() {
    const shipX = this.terrain?.landingX || 150;
    const shipY = this.terrain?.getSurfaceY(shipX) || this.world.floorY;
    const interactLabel = document.documentElement.dataset.inputMode === 'controller' ? 'X' : 'E';
    if (Math.abs(this.player.centerX - shipX) < 98 && Math.abs(this.player.centerY - (shipY - 42)) < 120) {
      return { type: 'ship', label: `Press ${interactLabel} to Board Ship`, detail: 'Return to space' };
    }
    const plant = this.nodes.find((node) => node.active && node.data.type === 'plant' && node.isNear(this.player, 82));
    if (plant) return { type: 'node', node: plant, label: `Gather ${plant.data.name}`, detail: 'Press Interact' };
    const animal = this.animals.find((candidate) => candidate.active && this.distanceSq(candidate.centerX, candidate.centerY, this.player.centerX, this.player.centerY) < 120 * 120);
    if (animal) return { type: 'animal', animal, label: animal.data.name, detail: 'Shoot Drone' };
    const target = this.findToolTarget();
    if (target?.node) return { type: 'nodeTool', node: target.node, label: target.node.data.name, detail: 'Use Tool' };
    return null;
  }

  findToolTarget(aimPoint = null) {
    const miningNodes = this.nodes.filter((candidate) => candidate.active && candidate.data.type !== 'plant' && candidate.isNear(this.player, 150));
    if (aimPoint) {
      let best = null;
      let bestDistanceSq = Infinity;
      for (const node of miningNodes) {
        const distanceSq = this.distanceSq(aimPoint.x, aimPoint.y, node.centerX, node.centerY);
        if (distanceSq > 105 * 105 || distanceSq >= bestDistanceSq) continue;
        best = node;
        bestDistanceSq = distanceSq;
      }
      if (best) return { node: best };
    }
    const node = miningNodes.find((candidate) => candidate.isNear(this.player, 96));
    return node ? { node } : null;
  }

  useInteract() {
    if (this.game.ui.modalLayer?.children.length) return;
    const prompt = this.promptTarget || this.findPromptTarget();
    if (!prompt) {
      this.game.audio.playError();
      return;
    }
    if (prompt.type === 'ship') {
      this.boardShip();
      return;
    }
    if (prompt.node && prompt.node.data.type === 'plant') {
      const result = prompt.node.gather();
      if (result) this.collectDrops(result.drops, prompt.node.data.gatherSound);
    }
  }

  useTool(aimPoint = null, { playError = true } = {}) {
    if (this.toolCooldown > 0 || this.game.ui.modalLayer?.children.length) return;
    this.toolCooldown = 0.22;
    const target = this.findToolTarget(aimPoint);
    if (!target) {
      if (playError) this.game.audio.playError();
      return;
    }
    if (target.node) {
      const result = target.node.hit();
      this.playNodeSound(target.node.data.gatherSound);
      this.addFloatingText('Hit!', target.node.data.visualStyle?.accent || '#ffd36b');
      if (result) this.collectDrops(result.drops, target.node.data.gatherSound);
    }
  }

  updateTerrainMining(delta) {
    if (!this.terrain || this.game.ui.modalLayer?.children.length) return;
    const laser = this.getTerrainLaserState(this.getAimPoint(), { updateFacing: true });
    const hit = laser.length > 8
      ? this.terrain.raycast(laser.start.x, laser.start.y, laser.end.x, laser.end.y)
      : null;
    this.miningBeam = {
      ...laser,
      end: hit ? { x: hit.x, y: hit.y } : laser.end,
      hit,
      age: 0,
    };

    if (!hit) {
      this.terrainMiningHitFeedback = null;
      this.startTerrainLaser();
      return;
    }

    if (!this.canMineTerrainMaterial(hit.material)) {
      this.terrainMiningHitFeedback = { ...hit, ratio: 0.04, blocked: true };
      this.showTerrainMineBlocked(hit);
      this.laserSoundActive = false;
      this.game.audio.stopLaserLoop?.();
      return;
    }

    this.startTerrainLaser();
    const beforeRatio = this.terrain.getDamageRatio(hit.col, hit.row, hit.material);
    const power = this.getTerrainMiningPower();
    const broken = this.terrain.mineCircle(hit.x, hit.y, TERRAIN_MINING_BRUSH_RADIUS, power, delta, {
      targetCol: hit.col,
      targetRow: hit.row,
      canMineMaterial: (material) => this.canMineTerrainMaterial(material),
    });
    const brokeTarget = broken.some((cell) => cell.col === hit.col && cell.row === hit.row);
    const afterRatio = brokeTarget ? 1 : this.terrain.getDamageRatio(hit.col, hit.row, hit.material);
    this.terrainMiningHitFeedback = {
      ...hit,
      ratio: Math.max(beforeRatio, afterRatio),
      blocked: false,
    };
    this.spawnTerrainParticles(hit.x, hit.y, TERRAIN_MATERIALS[hit.material]?.edge || '#ffd36b', broken.length ? 9 : 2);
    if (broken.length) {
      this.terrainDirty = true;
      this.collectTerrainCells(broken);
      this.game.audio.playMineNode?.();
    }
  }

  getMiningGunModulePowerBonus() {
    const blueprint = this.game.state.story?.equipmentBlueprints?.minerTool;
    if (!blueprint?.modules?.batteryGenerator) return 0;
    return gameBalance.earlyGame?.crashStart?.batteryGeneratorMiningPowerBonus ?? 0.28;
  }

  getTerrainMiningStatPower() {
    return (this.miningStats.miningPower ?? 0) + this.getMiningGunModulePowerBonus();
  }

  getTerrainMiningPower() {
    const base = gameBalance.mining.terrainMiningPowerBase ?? 0.42;
    const scale = gameBalance.mining.terrainMiningPowerScale ?? 0.78;
    const power = base + Math.max(0, this.getTerrainMiningStatPower()) * scale;
    return this.isGodMode() ? power * GOD_MODE_MINING_MULTIPLIER : power;
  }

  canMineTerrainMaterial(material) {
    if (this.isGodMode()) return true;
    const data = TERRAIN_MATERIALS[material];
    const requiredPower = data?.miningPowerRequired ?? 0;
    return this.getTerrainMiningStatPower() + 0.001 >= requiredPower;
  }

  isGodMode() {
    return Boolean(this.game.state.debug?.godMode);
  }

  showTerrainMineBlocked(hit) {
    if (this.mineBlockedCooldown > 0) return;
    this.mineBlockedCooldown = 0.85;
    const data = TERRAIN_MATERIALS[hit.material] || TERRAIN_MATERIALS[1];
    this.game.ui.showToast(`${data.name} needs a stronger miner`, 'danger', 1600);
    this.addFloatingText('Upgrade miner', '#ff756f');
    this.game.audio.playError();
  }

  isFlagToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'flag';
  }

  isWeaponToolSelected() {
    return this.game.input.getSelectedHotbarSlot?.()?.id === 'weapon';
  }

  getFlagPlacementPreview() {
    if (!this.terrain || !this.player) return null;
    const laser = this.getTerrainLaserState(this.getAimPoint(), { updateFacing: false });
    const hit = laser.length > 8
      ? this.terrain.raycast(laser.start.x, laser.start.y, laser.end.x, laser.end.y)
      : null;
    return {
      ...laser,
      hit,
      end: hit ? { x: hit.x, y: hit.y } : laser.end,
      canPlace: Boolean(hit),
    };
  }

  placeFlag(preview = null) {
    if (!this.terrain || !this.player || this.game.ui.modalLayer?.children.length) return;
    const target = preview || this.getFlagPlacementPreview();
    if (!target?.hit) {
      this.game.audio.playError?.();
      this.game.ui.showToast('Aim the flag at solid ground', 'danger', 1100);
      return;
    }
    if (Math.abs(target.rawAimPoint.x - this.player.centerX) > 4) {
      this.player.facing = target.rawAimPoint.x >= this.player.centerX ? 1 : -1;
    }
    const material = TERRAIN_MATERIALS[target.hit.material] || TERRAIN_MATERIALS[1];
    const pad = this.terrain.createPlacementPad(target.hit.x, target.hit.y, {
      viewRotation: 0,
      width: 90,
      clearance: 72,
      depth: 42,
      material: target.hit.material,
    });
    if (this.placedFlags.length >= 24) this.placedFlags.shift();
    this.placedFlags.push(new PlacedFlag({
      x: pad.x,
      y: pad.y,
      color: '#ffd36b',
      accent: material.edge || '#66d8e8',
    }));
    this.terrainDirty = this.terrainDirty || pad.changed;
    if (this.terrainDirty) {
      this.game.systems.islands.saveTerrain(this.island.id, this.terrain);
      this.terrainDirty = false;
    }
    this.game.systems.islands.saveFlags(this.island.id, this.placedFlags);
    this.spawnTerrainParticles(pad.x, pad.y, '#ffd36b', 14);
    this.addFloatingText('Flag placed', '#ffd36b', pad.x, pad.y - 26);
    this.game.audio.playSuccess?.();
  }

  updatePlacedFlags(delta) {
    this.placedFlags.forEach((flag) => {
      flag.update(delta);
      flag.bumpFromPlayer(this.player);
    });
  }

  startTerrainLaser() {
    if (this.laserSoundActive) return;
    this.laserSoundActive = true;
    this.game.audio.playLaserStart?.();
    this.game.audio.startLaserLoop?.();
  }

  stopTerrainLaser() {
    if (!this.laserSoundActive && !this.miningBeam) return;
    this.laserSoundActive = false;
    this.miningBeam = null;
    this.terrainMiningHitFeedback = null;
    this.game.audio.stopLaserLoop?.();
  }

  collectTerrainCells(cells) {
    const grouped = new Map();
    for (const cell of cells) {
      if (!cell.data?.materialId || !cell.data.yield) continue;
      const entry = grouped.get(cell.data.materialId) || {
        amount: 0,
        x: cell.x,
        y: cell.y,
        chip: cell.chip,
      };
      entry.amount += cell.data.yield;
      entry.x = (entry.x + cell.x) * 0.5;
      entry.y = (entry.y + cell.y) * 0.5;
      entry.chip ||= cell.chip;
      grouped.set(cell.data.materialId, entry);
    }

    let index = 0;
    for (const [materialId, entry] of grouped.entries()) {
      const material = this.game.systems.materials.getMaterial(materialId);
      const spawn = this.terrain.getClosestTerrainSurfacePoint?.(entry.x, entry.y, 14) || entry;
      this.terrainPickups.push(this.acquireTerrainPickup({
        materialId,
        amount: entry.amount,
        x: spawn.x + Math.cos(index * 2.3 + this.time) * 4,
        y: spawn.y + Math.sin(index * 1.7 + this.time) * 4,
        seed: Math.random(),
        material,
        chip: entry.chip,
      }));
      index += 1;
    }

    this.miningStats.cargo = this.game.systems.inventory.getRunCargoSlotCount();
  }

  acquireTerrainPickup(options) {
    const pickup = this.terrainPickupPool.pop() || new MineralPickup();
    return pickup.reset(options);
  }

  releaseTerrainPickup(pickup) {
    pickup.active = false;
    if (this.terrainPickupPool.length < (gameBalance.mining.maxPickupPool || 80)) this.terrainPickupPool.push(pickup);
  }

  updateTerrainPickups(delta) {
    let writeIndex = 0;
    for (let index = 0; index < this.terrainPickups.length; index += 1) {
      const pickup = this.terrainPickups[index];
      this.updateTerrainPickupPhysics(pickup, delta);
      const dx = this.player.centerX - pickup.x;
      const dy = this.player.centerY - pickup.y;
      if (dx * dx + dy * dy > (pickup.radius + 28) ** 2) {
        if (pickup.age < 45) {
          this.terrainPickups[writeIndex] = pickup;
          writeIndex += 1;
        } else {
          this.releaseTerrainPickup(pickup);
        }
        continue;
      }
      if (!this.collectTerrainPickup(pickup)) {
        this.terrainPickups[writeIndex] = pickup;
        writeIndex += 1;
        continue;
      }
      this.releaseTerrainPickup(pickup);
    }
    this.terrainPickups.length = writeIndex;
  }

  updateTerrainPickupPhysics(pickup, delta) {
    pickup.update(delta);
    if (!this.terrain?.getClosestTerrainSurfacePoint) return;
    const surface = this.terrain.getClosestTerrainSurfacePoint(pickup.x, pickup.y, pickup.radius + 4);
    if (!surface) return;
    const inside = this.terrain.containsCollisionPoint?.(pickup.x, pickup.y);
    const dx = pickup.x - surface.surfaceX;
    const dy = pickup.y - surface.surfaceY;
    const normalDistance = dx * surface.normal.x + dy * surface.normal.y;
    if (!inside && normalDistance > pickup.radius + 6) return;
    pickup.x = surface.x;
    pickup.y = surface.y;
    const tangentSpeed = pickup.vx * surface.tangent.x + pickup.vy * surface.tangent.y;
    pickup.vx = surface.tangent.x * tangentSpeed * 0.72;
    pickup.vy = surface.tangent.y * tangentSpeed * 0.72;
  }

  collectTerrainPickup(pickup) {
    const result = this.game.systems.inventory.addToRunCargo(pickup.materialId, pickup.amount, {
      capacity: this.miningStats.cargoCapacity,
    });
    if (!result.ok) {
      if (this.cargoFullToastReady) {
        this.cargoFullToastReady = false;
        this.game.ui.showToast('Cargo Full', 'danger');
        this.game.audio.playCargoFull();
        this.addFloatingText('Cargo Full', '#ff756f', pickup.x, pickup.y);
        window.setTimeout(() => {
          this.cargoFullToastReady = true;
        }, 1200);
      }
      return false;
    }
    const material = this.game.systems.materials.getMaterial(pickup.materialId);
    this.game.systems.objectives.record('materialCollected', { materialId: pickup.materialId, amount: pickup.amount });
    this.addFloatingText(
      `+${pickup.amount} ${this.game.systems.materials.getDisplayName(pickup.materialId)}`,
      material?.color || '#fff2cf',
      pickup.x,
      pickup.y,
    );
    this.game.audio.playIslandPickup?.();
    this.miningStats.cargo = result.currentSlots;
    return true;
  }

  updateDroneCombat(delta) {
    const weaponSelected = this.isWeaponToolSelected();
    if (!weaponSelected && !this.combatDrone.projectiles.length) return;
    this.combatDrone.update(delta, this.getDroneAnchor(), {
      threats: this.animals,
      onHit: (target) => this.handleDroneHit(target),
    });
  }

  fireDroneAttack() {
    if (!this.isWeaponToolSelected()) return;
    if (this.game.ui.modalLayer?.children.length) return;
    this.combatDrone.tryShoot({
      anchor: this.getDroneAnchor(),
      aimPoint: this.getAimPoint(),
      threats: this.animals,
      onShoot: () => this.game.audio.playDroneShot?.(),
    });
  }

  handleDroneHit(animal) {
    if (!animal?.active) return;
    const result = animal.hit();
    this.game.audio.playDroneHit?.();
    this.addFloatingText('Hit!', animal.data.color);
    if (result) {
      this.game.audio.playAnimalDefeated?.();
      this.collectDrops(result.drops, 'islandPickup');
    }
  }

  getDroneAnchor() {
    return {
      x: this.player.centerX,
      y: this.player.centerY,
      facing: this.player.facing,
      droneSide: -1,
    };
  }

  getAimPoint() {
    const controllerAim = this.getControllerAimPoint();
    if (controllerAim) return controllerAim;
    const pointerAim = this.getPointerAimPoint();
    if (pointerAim) return pointerAim;
    return {
      x: this.player.centerX + this.player.facing * TERRAIN_LASER_RANGE,
      y: this.player.centerY - 8,
    };
  }

  getPointerAimPoint() {
    const pointer = this.game.input.mousePointer;
    if (pointer?.inside && pointer.source === 'canvas' && document.documentElement.dataset.inputMode !== 'touch') {
      return this.screenToWorld(pointer.canvasX, pointer.canvasY);
    }
    return null;
  }

  getControllerAimPoint() {
    if (!this.game.input.isControllerActive?.()) return null;
    const aim = this.game.input.aimVector || { x: 0, y: 0 };
    const magnitude = Math.hypot(aim.x, aim.y);
    if (magnitude < 0.12) return null;
    const distance = Math.max(48, TERRAIN_LASER_RANGE * Math.min(1, magnitude));
    return {
      x: this.player.centerX + (aim.x / magnitude) * distance,
      y: this.player.centerY - 7 + (aim.y / magnitude) * distance,
    };
  }

  getTerrainLaserState(aimPoint, { updateFacing = false } = {}) {
    const start = {
      x: this.player.centerX,
      y: this.player.centerY - 7,
    };
    const dx = aimPoint.x - start.x;
    const dy = aimPoint.y - start.y;
    const distance = Math.hypot(dx, dy);
    const directionX = distance > 0.001 ? dx / distance : this.player.facing;
    const directionY = distance > 0.001 ? dy / distance : 0;
    if (updateFacing && Math.abs(dx) > 4) this.player.facing = dx >= 0 ? 1 : -1;
    const length = Math.min(distance, TERRAIN_LASER_RANGE);
    const end = {
      x: start.x + directionX * length,
      y: start.y + directionY * length,
    };
    return {
      start,
      end,
      aimPoint: end,
      rawAimPoint: aimPoint,
      origin: start,
      range: TERRAIN_LASER_RANGE,
      rangeRatio: TERRAIN_LASER_RANGE > 0 ? length / TERRAIN_LASER_RANGE : 0,
      length,
    };
  }

  screenToWorld(screenX, screenY) {
    const viewport = this.game.viewport || { width: 0, height: 0 };
    const scale = Math.max(0.1, this.viewScale);
    const unscaledX = viewport.width * 0.5 + (screenX - viewport.width * 0.5) / scale;
    const unscaledY = viewport.height * 0.5 + (screenY - viewport.height * 0.5) / scale;
    return {
      x: unscaledX + this.camera.x,
      y: unscaledY + this.camera.y,
    };
  }

  collectDrops(drops, soundName = 'islandPickup') {
    const result = this.game.systems.islands.addDropsToCargo(drops, this.miningStats.cargoCapacity, this);
    if (result.ok) this.playNodeSound(soundName);
    this.miningStats.cargo = this.game.systems.inventory.getRunCargoSlotCount();
  }

  playNodeSound(soundName) {
    const method = {
      chopTree: 'playChopTree',
      mineNode: 'playMineNode',
      gatherPlant: 'playGatherPlant',
      islandPickup: 'playIslandPickup',
    }[soundName] || 'playIslandPickup';
    this.game.audio[method]?.();
  }

  boardShip() {
    if (this.exiting) return;
    this.exiting = true;
    this.stopTerrainLaser();
    if (this.terrainDirty) {
      this.game.systems.islands.saveTerrain(this.island.id, this.terrain);
      this.terrainDirty = false;
    }
    this.game.systems.islands.saveFlags(this.island.id, this.placedFlags);
    this.game.audio.playBoardShip?.();
    this.game.ui.root.classList.add('launch-wipe');
    window.setTimeout(() => {
      this.game.ui.root.classList.remove('launch-wipe');
      this.game.sceneManager.switchTo('mining', {
        fromIsland: true,
        islandId: this.island.id,
        shipPosition: this.shipPosition,
        miningStats: this.miningStats,
      });
    }, 320);
  }

  updateHud(force = false) {
    const cargoSlots = this.game.systems.inventory.getRunCargoSlotCount();
    const cargoCapacity = this.miningStats.cargoCapacity || 20;
    this.miningStats.cargo = cargoSlots;
    this.setHudText('healthText', this.hud.healthText, `${Math.ceil(this.player.health)}/${this.player.maxHealth}`, force);
    this.setHudWidth('healthFill', this.hud.healthFill, Math.round((this.player.health / this.player.maxHealth) * 100), force);
    this.setHudText('cargoText', this.hud.cargoText, `${cargoSlots}/${cargoCapacity}`, force);
    this.setHudWidth('cargoFill', this.hud.cargoFill, Math.round((cargoSlots / Math.max(1, cargoCapacity)) * 100), force);
    const promptText = this.promptTarget
      ? `${this.promptTarget.label} - ${this.promptTarget.detail}`
      : (this.isFlagToolSelected() ? 'Aim at solid ground and click Use to place a flag' : 'Mine the terrain, then board the ship');
    this.setHudText('prompt', this.hud.prompt, promptText, force);
    this.setHudText('cargoPreview', this.hud.cargoPreview, this.getCargoPreviewText(), force);
  }

  getCargoPreviewText() {
    const cargo = this.game.systems.inventory.getRunCargo();
    const entries = Object.entries(cargo)
      .filter(([, amount]) => amount > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([materialId, amount]) => `${this.game.systems.materials.getDisplayName(materialId)} ${amount}`);
    return entries.length ? entries.join('  ') : 'Cargo empty';
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

  addFloatingText(text, color = '#fff2cf', x = this.player.centerX, y = this.player.y - 14) {
    this.floatingText.push({
      text,
      color,
      x,
      y,
      age: 0,
    });
    if (this.floatingText.length > 18) this.floatingText.shift();
  }

  updateFloatingText(delta) {
    let write = 0;
    for (let i = 0; i < this.floatingText.length; i += 1) {
      const item = this.floatingText[i];
      item.age += delta;
      item.y -= 28 * delta;
      if (item.age < 1.1) {
        this.floatingText[write] = item;
        write += 1;
      }
    }
    this.floatingText.length = write;
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawBackdrop(ctx, width, height);
    ctx.save();
    this.applyWorldScale(ctx, width, height);
    ctx.translate(0, -this.camera.y);
    this.drawTerrain(ctx, width);
    this.drawTerrainPickups(ctx);
    this.drawPlacedFlags(ctx);
    this.drawShip(ctx);
    this.nodes.forEach((node) => node.draw(ctx, this.camera, this.time));
    this.animals.forEach((animal) => animal.draw(ctx, this.camera, this.time));
    this.drawLaserRangeField(ctx);
    this.drawFlagPlacementPreview(ctx);
    this.drawMiningBeam(ctx);
    this.player.draw(ctx, this.camera, this.time);
    if (this.isWeaponToolSelected()) {
      this.combatDrone.draw(ctx, {
        worldToScreen: (x, y) => ({ x: x - this.camera.x, y }),
      });
    }
    this.drawTerrainParticles(ctx);
    this.drawFloatingText(ctx);
    ctx.restore();
  }

  applyWorldScale(ctx, width, height) {
    if (Math.abs(this.viewScale - 1) < 0.001) return;
    ctx.translate(width / 2, height);
    ctx.scale(this.viewScale, this.viewScale);
    ctx.translate(-width / 2, -height);
  }

  drawBackdrop(ctx, width, height) {
    const palettes = {
      scrap: ['#102238', '#263a52', '#8a5630'],
      forest: ['#102238', '#24435e', '#57c77c'],
      crystal: ['#101a33', '#315a72', '#8ee8ff'],
      ember: ['#1d1725', '#5d3440', '#ff8f3d'],
    };
    const [outer, mid, accent] = palettes[this.island.biome] || palettes.scrap;
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.55, 40, width * 0.5, height * 0.55, width);
    gradient.addColorStop(0, mid);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `${accent}33`;
    ctx.beginPath();
    ctx.ellipse(width * 0.72 - this.camera.x * 0.04, height * 0.25, width * 0.25, height * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 242, 207, 0.78)';
    for (let i = 0; i < 60; i += 1) {
      const x = ((i * 91 - this.camera.x * 0.12) % (width + 30) + width + 30) % (width + 30);
      const y = (i * 47) % Math.max(220, height - 80);
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  drawTerrain(ctx, width) {
    this.terrain?.draw(ctx, this.camera, this.getVisibleWorldWidth(), this.getVisibleWorldHeight());
  }

  drawTerrainPickups(ctx) {
    if (!this.terrainPickups.length) return;
    ctx.save();
    ctx.translate(-this.camera.x, 0);
    this.terrainPickups.forEach((pickup) => pickup.drawLocal(ctx));
    ctx.restore();
  }

  drawPlacedFlags(ctx) {
    if (!this.placedFlags.length) return;
    ctx.save();
    ctx.translate(-this.camera.x, 0);
    this.placedFlags.forEach((flag) => flag.draw(ctx, { time: this.time }));
    ctx.restore();
  }

  drawFlagPlacementPreview(ctx) {
    if (!this.flagPlacementPreview?.hit) return;
    const hit = this.flagPlacementPreview.hit;
    const material = TERRAIN_MATERIALS[hit.material] || TERRAIN_MATERIALS[1];
    ctx.save();
    ctx.translate(-this.camera.x, 0);
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = 'rgba(255, 211, 107, 0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -this.time * 28;
    ctx.beginPath();
    ctx.moveTo(hit.x - 45, hit.y);
    ctx.lineTo(hit.x + 45, hit.y);
    ctx.stroke();
    ctx.setLineDash([]);
    PlacedFlag.drawGhost(ctx, {
      x: hit.x,
      y: hit.y - 3,
      time: this.time,
      accent: material.edge || '#66d8e8',
    });
    ctx.restore();
  }

  drawShip(ctx) {
    const shipX = this.terrain?.landingX || 150;
    const floorY = this.terrain?.getSurfaceY(shipX) || this.world.floorY;
    const x = shipX - this.camera.x;
    const y = floorY - 68 + Math.sin(this.time * 2.5) * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#fff2cf';
    ctx.strokeStyle = '#102033';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(70, 20);
    ctx.lineTo(26, -16);
    ctx.lineTo(-50, -8);
    ctx.lineTo(-74, 22);
    ctx.lineTo(-40, 42);
    ctx.lineTo(34, 36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#76f3ff';
    ctx.beginPath();
    ctx.ellipse(4, 4, 20, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawMiningBeam(ctx) {
    if (!this.miningBeam) return;
    const { start, end, hit } = this.miningBeam;
    const hitColor = hit ? (TERRAIN_MATERIALS[hit.material]?.edge || '#ffcf5a') : '#65d6ff';
    if (hit) {
      ctx.save();
      ctx.translate(-this.camera.x, 0);
      this.terrain.drawCellTargetGlow(ctx, hit, this.time, {
        brushRadius: TERRAIN_MINING_BRUSH_RADIUS,
      });
      ctx.restore();
    }
    if (this.terrainMiningHitFeedback) {
      ctx.save();
      ctx.translate(-this.camera.x, 0);
      this.terrain.drawDamageFeedback(ctx, this.terrainMiningHitFeedback, this.time);
      ctx.restore();
    }
    this.laserRenderer.drawBeam(ctx, {
      worldToScreen: (x, y) => ({ x: x - this.camera.x, y }),
      start,
      end,
      hit,
      time: this.time,
      outerColor: hit ? 'rgba(255, 207, 90, 0.9)' : 'rgba(101, 214, 255, 0.54)',
      innerColor: hit ? 'rgba(255, 255, 255, 0.86)' : 'rgba(255, 255, 255, 0.68)',
      hitColor,
      alpha: hit ? 1 : 0.72,
    });
  }

  drawLaserRangeField(ctx) {
    const pointerAim = this.getPointerAimPoint();
    const state = this.miningBeam || (pointerAim ? this.getTerrainLaserState(pointerAim) : null);
    if (!state) return;
    this.laserRenderer.drawRangeField(ctx, {
      worldToScreen: (x, y) => ({ x: x - this.camera.x, y }),
      origin: state.origin,
      radius: state.range,
      aimPoint: state.aimPoint,
      active: Boolean(this.miningBeam),
      time: this.time,
    });
  }

  spawnTerrainParticles(x, y, color, count = 5) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 140;
      this.terrainParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        color,
        age: 0,
        life: 0.34 + Math.random() * 0.34,
        size: 2 + Math.random() * 3,
      });
    }
    if (this.terrainParticles.length > 140) this.terrainParticles.splice(0, this.terrainParticles.length - 140);
  }

  updateTerrainParticles(delta) {
    let write = 0;
    for (let i = 0; i < this.terrainParticles.length; i += 1) {
      const particle = this.terrainParticles[i];
      particle.age += delta;
      particle.vy += 520 * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      if (particle.age < particle.life) {
        this.terrainParticles[write] = particle;
        write += 1;
      }
    }
    this.terrainParticles.length = write;
  }

  drawTerrainParticles(ctx) {
    ctx.save();
    this.terrainParticles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, 1 - particle.age / particle.life);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x - this.camera.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawFloatingText(ctx) {
    ctx.save();
    ctx.font = '900 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    this.floatingText.forEach((item) => {
      const alpha = 1 - item.age / 1.1;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#102033';
      ctx.fillStyle = item.color;
      ctx.strokeText(item.text, item.x - this.camera.x, item.y);
      ctx.fillText(item.text, item.x - this.camera.x, item.y);
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  distanceSq(ax, ay, bx, by) {
    return (ax - bx) ** 2 + (ay - by) ** 2;
  }

  exit() {
    this.moveStick?.__inputCleanup?.();
    this.stopTerrainLaser();
    if (this.terrainDirty) {
      this.game.systems.islands.saveTerrain(this.island.id, this.terrain);
      this.terrainDirty = false;
    }
    this.game.input.virtualButtons.set('jump', false);
    this.game.input.virtualButtons.set('interact', false);
    this.game.input.virtualButtons.set('tool', false);
    this.game.input.virtualButtons.set('mine', false);
    this.game.input.virtualButtons.set('attack', false);
    this.game.input.virtualButtons.set('primaryUse', false);
    this.combatDrone?.clear();
  }
}
