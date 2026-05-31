import { Button } from '../ui/Button.js';
import { Joystick } from '../ui/Joystick.js';
import { IslandPlayer } from '../entities/IslandPlayer.js';
import { CompanionDrone } from '../entities/CompanionDrone.js?v=44';
import { gameBalance } from '../data/gameBalance.js?v=44';

export class IslandScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.island = this.game.systems.islands.getIsland(payload.islandId);
    this.shipPosition = payload.shipPosition || this.island.worldPosition;
    this.miningStats = {
      ...(payload.miningStats || {}),
      cargoCapacity: payload.miningStats?.cargoCapacity || this.game.state.ship.cargoMax || 20,
    };
    this.world = null;
    this.player = null;
    this.combatDrone = new CompanionDrone({ cooldown: 0.46, damage: 1, targetRange: 560 });
    this.nodes = [];
    this.animals = [];
    this.time = 0;
    this.camera = { x: 0, targetX: 0 };
    this.viewScale = gameBalance.ui?.worldViewScale || 1;
    this.promptTarget = null;
    this.hudCache = {};
    this.floatingText = [];
    this.toolCooldown = 0;
    this.exiting = false;
  }

  enter() {
    this.game.ui.setScreen('island-screen');
    this.resize(this.game.viewport);
    this.player = new IslandPlayer({ x: 190, y: this.world.floorY - 58 });
    const runtime = this.game.systems.islands.createRuntime(this.island, this.world);
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
    const floorOffset = Math.max(54, Math.min(86, viewport.height * 0.19));
    this.world = {
      width: Math.max(this.island.size?.width || 1280, this.getVisibleWorldWidth(viewport) + 360),
      height: viewport.height,
      floorY: Math.max(210, viewport.height - floorOffset),
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
      <div class="island-prompt" data-island-prompt></div>
    `;
    this.game.ui.addSceneElement(hud);
    this.hud = {
      healthText: hud.querySelector('[data-health-text]'),
      healthFill: hud.querySelector('[data-health-fill]'),
      cargoText: hud.querySelector('[data-cargo-text]'),
      cargoFill: hud.querySelector('[data-cargo-fill]'),
      prompt: hud.querySelector('[data-island-prompt]'),
    };
    this.updateHud(true);
  }

  mountControls() {
    const moveStick = new Joystick({ label: 'Walk', className: 'island-joystick' }).element;
    this.moveStick = moveStick;
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
    const mineButton = new Button('Mine', () => {}, {
      icon: 'M',
      className: 'island-mine-button',
      variant: 'metal',
      holdAction: 'mine',
    }).element;
    const attackButton = new Button('Shoot', () => {}, {
      icon: 'S',
      className: 'island-attack-button attack-button',
      variant: 'metal',
      holdAction: 'attack',
    }).element;
    const actions = document.createElement('div');
    actions.className = 'island-action-controls';
    actions.append(jumpButton, interactButton, mineButton, attackButton);
    this.controls = this.game.ui.addControls([moveStick, actions]);
    this.controls.classList.add('island-mobile-controls');
    this.game.input.bindJoystick(moveStick, { mode: 'move', radius: 46, floating: true, activationRegion: 'left' });
    this.game.input.bindHoldButton(jumpButton, 'jump');
    this.game.input.bindHoldButton(interactButton, 'interact');
    this.game.input.bindHoldButton(mineButton, 'mine');
    this.game.input.bindHoldButton(attackButton, 'attack');
  }

  update(delta) {
    if (this.exiting) return;
    this.time += delta;
    this.toolCooldown = Math.max(0, this.toolCooldown - delta);
    const actions = this.game.input.actions;
    const spaceJump = actions.justPressed.mine && this.game.input.keys.has(' ');
    const keyboardJump = actions.justPressed.up
      && (this.game.input.keys.has('w') || this.game.input.keys.has('W') || this.game.input.keys.has('ArrowUp'));
    this.player.update(delta, {
      moveX: this.game.input.moveVector.x,
      jumpPressed: actions.justPressed.jump || keyboardJump || spaceJump,
    }, this.world);
    this.updateCamera(delta);
    this.nodes.forEach((node) => node.update(delta));
    this.animals.forEach((animal) => animal.update(delta, this.player, this.world));
    this.updateDroneCombat(delta);
    this.handleAnimalContact();
    this.updateFloatingText(delta);
    this.promptTarget = this.findPromptTarget();
    if (actions.justPressed.interact || actions.justPressed.confirm) this.useInteract();
    const miningInput = actions.mine && !this.game.input.keys.has(' ');
    const miningStarted = actions.justPressed.mine && !this.game.input.keys.has(' ');
    if (actions.justPressed.tool || miningInput) {
      this.useTool(this.getAimPoint(), { playError: actions.justPressed.tool || miningStarted });
    }
    if (actions.justPressed.attack) this.fireDroneAttack();
    this.updateHud();
  }

  updateCamera(delta) {
    const viewportWidth = this.getVisibleWorldWidth();
    this.camera.targetX = Math.max(0, Math.min(this.world.width - viewportWidth, this.player.centerX - viewportWidth * 0.42));
    this.camera.x += (this.camera.targetX - this.camera.x) * Math.min(1, delta * 8);
  }

  getVisibleWorldWidth(viewport = this.game.viewport) {
    return (viewport?.width || 0) / Math.max(0.1, this.viewScale);
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
    if (Math.abs(this.player.centerX - 150) < 92) {
      return { type: 'ship', label: 'Board Ship', detail: 'Return to space' };
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

  updateDroneCombat(delta) {
    this.combatDrone.update(delta, this.getDroneAnchor(), {
      threats: this.animals,
      onHit: (target) => this.handleDroneHit(target),
    });
  }

  fireDroneAttack() {
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
    const pointer = this.game.input.mousePointer;
    if (pointer?.inside && pointer.source === 'canvas' && document.documentElement.dataset.inputMode !== 'touch') {
      return this.screenToWorld(pointer.canvasX, pointer.canvasY);
    }
    return {
      x: this.player.centerX + this.player.facing * 420,
      y: this.player.centerY - 8,
    };
  }

  screenToWorld(screenX, screenY) {
    const viewport = this.game.viewport || { width: 0, height: 0 };
    const scale = Math.max(0.1, this.viewScale);
    const unscaledX = viewport.width * 0.5 + (screenX - viewport.width * 0.5) / scale;
    const unscaledY = viewport.height + (screenY - viewport.height) / scale;
    return {
      x: unscaledX + this.camera.x,
      y: unscaledY,
    };
  }

  collectDrops(drops, soundName = 'islandPickup') {
    const result = this.game.systems.islands.addDropsToCargo(drops, this.miningStats.cargoCapacity, this);
    if (result.ok) this.playNodeSound(soundName);
    const weight = this.game.systems.inventory.getRunCargoWeight();
    this.miningStats.cargo = Math.ceil(weight);
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
    const cargoWeight = Math.ceil(this.game.systems.inventory.getRunCargoWeight());
    const cargoCapacity = this.miningStats.cargoCapacity || 20;
    this.setHudText('healthText', this.hud.healthText, `${Math.ceil(this.player.health)}/${this.player.maxHealth}`, force);
    this.setHudWidth('healthFill', this.hud.healthFill, Math.round((this.player.health / this.player.maxHealth) * 100), force);
    this.setHudText('cargoText', this.hud.cargoText, `${cargoWeight}/${cargoCapacity}`, force);
    this.setHudWidth('cargoFill', this.hud.cargoFill, Math.round((cargoWeight / cargoCapacity) * 100), force);
    const promptText = this.promptTarget ? `${this.promptTarget.label} - ${this.promptTarget.detail}` : 'Explore, gather, then board the ship';
    this.setHudText('prompt', this.hud.prompt, promptText, force);
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

  addFloatingText(text, color = '#fff2cf') {
    this.floatingText.push({
      text,
      color,
      x: this.player.centerX,
      y: this.player.y - 14,
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
    this.drawTerrain(ctx, width);
    this.drawShip(ctx);
    this.nodes.forEach((node) => node.draw(ctx, this.camera, this.time));
    this.animals.forEach((animal) => animal.draw(ctx, this.camera, this.time));
    this.player.draw(ctx, this.camera, this.time);
    this.combatDrone.draw(ctx, {
      worldToScreen: (x, y) => ({ x: x - this.camera.x, y }),
    });
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
    const y = this.world.floorY;
    const sx = -this.camera.x;
    ctx.fillStyle = '#102033';
    ctx.fillRect(0, y, width, this.world.height - y);
    ctx.fillStyle = this.island.biome === 'ember' ? '#7d3028' : this.island.biome === 'forest' ? '#48664d' : '#55606d';
    ctx.beginPath();
    ctx.moveTo(sx, y + 8);
    for (let x = 0; x <= this.world.width; x += 80) {
      ctx.lineTo(sx + x, y + Math.sin(x * 0.01) * 10);
    }
    ctx.lineTo(sx + this.world.width, this.world.height + 80);
    ctx.lineTo(sx, this.world.height + 80);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 211, 107, 0.12)';
    ctx.fillRect(0, y - 3, width, 5);
  }

  drawShip(ctx) {
    const x = 150 - this.camera.x;
    const y = this.world.floorY - 68 + Math.sin(this.time * 2.5) * 2;
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
    this.game.input.virtualButtons.set('jump', false);
    this.game.input.virtualButtons.set('interact', false);
    this.game.input.virtualButtons.set('tool', false);
    this.game.input.virtualButtons.set('mine', false);
    this.game.input.virtualButtons.set('attack', false);
    this.combatDrone?.clear();
  }
}
