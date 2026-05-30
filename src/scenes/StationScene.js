import { StationPlayer } from '../entities/StationPlayer.js?v=32';
import { StationInteractable } from '../entities/StationInteractable.js';
import { StationInteractionSystem } from '../systems/StationInteractionSystem.js';
import { Button } from '../ui/Button.js';
import { InteractPrompt } from '../ui/InteractPrompt.js';
import { MobileStationControls } from '../ui/MobileStationControls.js';
import { createMiningSummaryModal } from '../ui/MiningSummaryModal.js';
import { NavigationMap } from '../ui/NavigationMap.js';
import { createObjectiveModal } from '../ui/ObjectiveModal.js';
import { ResourceCounter } from '../ui/ResourceCounter.js';
import { StationSideScrollerRenderer } from './station/StationSideScrollerRenderer.js?v=32';
import { gameBalance } from '../data/gameBalance.js?v=32';

const WORLD_WIDTH = 2920;

export class StationScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.renderer = new StationSideScrollerRenderer();
    this.interactionSystem = new StationInteractionSystem();
    this.prompt = new InteractPrompt();
    this.time = 0;
    this.sparkAudioTimer = 1.4;
    this.hudRefreshTimer = 0;
    this.camera = { x: 0, targetX: 0, viewportWidth: 0 };
    this.viewScale = gameBalance.ui?.worldViewScale || 1;
    this.interactables = [];
    this.transitioning = false;
    this.lastInteractAt = 0;
    this.lastObjectiveKey = '';
  }

  enter() {
    this.game.systems.upgrades.applyUpgrades();
    this.game.ui.setScreen('station-platformer-screen');
    this.resize(this.game.viewport);

    const spawnX = this.getSpawnX();
    this.player = new StationPlayer({ x: spawnX, y: 0 });
    this.player.snapToGround(this.world);
    this.camera.x = this.clampCamera(spawnX - this.getVisibleWorldWidth() * 0.42);
    this.camera.targetX = this.camera.x;

    this.mountHud();
    this.controls = new MobileStationControls(this.game, {
      onInteract: () => this.tryInteract(),
    });
    this.controls.mount();
    this.prompt.mount(this.game.ui.sceneLayer);

    if (this.payload.miningSummary) {
      this.game.ui.root.classList.add('dock-wipe');
      window.setTimeout(() => this.game.ui.root.classList.remove('dock-wipe'), 420);
      const modal = createMiningSummaryModal(this.game, this.payload.miningSummary, () => {
        this.game.systems.tutorial.onMiningSummaryClosed();
      });
      this.game.ui.showModal(modal);
    }

    this.game.systems.tutorial.onStationEnter(this.payload);
  }

  resize(viewport = this.game.viewport) {
    if (!viewport) return;
    const floorOffset = Math.max(54, Math.min(92, viewport.height * 0.2));
    const floorY = Math.max(206, viewport.height - floorOffset);
    this.world = {
      minX: 0,
      width: Math.max(WORLD_WIDTH, viewport.width + 560),
      height: viewport.height,
      floorY,
      gravity: 1680,
      platforms: [
        { x: 585, y: floorY - 72, width: 116, height: 16 },
        { x: 1345, y: floorY - 64, width: 118, height: 16 },
      ],
    };
    this.camera.viewportWidth = this.getVisibleWorldWidth(viewport);
    this.camera.viewScale = this.viewScale;
    this.interactables = this.createInteractables();
    this.interactionSystem.setInteractables(this.interactables);
    if (this.player) {
      this.player.y = Math.min(this.player.y, this.world.floorY - this.player.height);
      if (this.player.onGround) this.player.snapToGround(this.world);
      this.camera.x = this.clampCamera(this.camera.x);
    }
  }

  createInteractables() {
    const floorY = this.world.floorY;
    return [
      new StationInteractable({
        id: 'upgrades',
        label: 'Upgrade Bench',
        prompt: 'Upgrade the ship',
        icon: '+',
        station: 'Upgrades',
        x: 872,
        y: floorY - 142,
        width: 300,
        height: 142,
      }),
      new StationInteractable({
        id: 'research',
        label: 'Research Terminal',
        prompt: 'Open star map research',
        icon: 'R',
        station: 'Research',
        x: 1218,
        y: floorY - 136,
        width: 220,
        height: 136,
      }),
      new StationInteractable({
        id: 'navigation',
        label: 'Navigation Room',
        prompt: this.game.systems.navigation.isUnlocked() ? 'Chart the far planet' : 'Repair GPS scanner',
        icon: 'N',
        station: 'Navigation',
        x: 1480,
        y: floorY - 150,
        width: 250,
        height: 150,
      }),
      new StationInteractable({
        id: 'launch',
        label: 'Launch Bay',
        prompt: 'Fly out to mine asteroids',
        icon: 'A',
        station: 'Mining',
        x: 2360,
        y: floorY - 162,
        width: 360,
        height: 162,
        triggerPadding: 90,
      }),
    ];
  }

  getSpawnX() {
    if (this.payload.miningSummary) return this.getInteractableCenter('launch') - 34;
    const savedX = this.game.state.station?.hubPlayerX;
    if (Number.isFinite(savedX)) return Math.max(24, Math.min(this.world.width - 80, savedX));
    return this.getInteractableCenter('upgrades') - 20;
  }

  getInteractableCenter(id) {
    const interactable = this.interactables.find((item) => item.id === id);
    return interactable ? interactable.centerX : 520;
  }

  mountHud() {
    const topBar = document.createElement('header');
    topBar.className = 'station-platformer-top-bar';

    const resources = document.createElement('div');
    resources.className = 'station-platformer-resources';
    this.resourceCounters = {
      credits: new ResourceCounter('Credits', this.game.state.credits, { icon: '$' }),
      research: new ResourceCounter('Research', this.game.state.researchPoints, { icon: 'R' }),
    };
    resources.append(
      this.resourceCounters.credits.element,
      this.resourceCounters.research.element,
    );

    this.storageQuickButton = new Button('Storage', () => this.openStorage(), {
      icon: '#',
      variant: 'metal',
      className: 'station-storage-quick-button',
    }).element;
    this.storageQuickButton.setAttribute('aria-label', 'Open storage inventory');

    this.objectiveChip = document.createElement('button');
    this.objectiveChip.type = 'button';
    this.objectiveChip.className = 'station-platformer-objective';
    this.objectiveChip.setAttribute('aria-label', 'Open objective details');
    this.objectiveChip.addEventListener('click', () => this.showObjectiveDetails());
    topBar.append(resources, this.objectiveChip);
    this.game.ui.addSceneElement(topBar);
    this.game.ui.addSceneElement(this.storageQuickButton);
    this.updateHud(true);
  }

  update(delta) {
    this.time += delta;
    this.sparkAudioTimer -= delta;
    if (this.sparkAudioTimer <= 0) {
      this.sparkAudioTimer = 1.6 + Math.random() * 2.3;
      this.game.audio.playSparkPop();
    }

    const actions = this.game.input.actions;
    const spaceJump = actions.justPressed.mine && this.game.input.keys.has(' ');
    const keyboardJump = actions.justPressed.up
      && (this.game.input.keys.has('w') || this.game.input.keys.has('W') || this.game.input.keys.has('ArrowUp'));
    this.player.update(delta, {
      moveX: this.game.input.moveVector.x,
      jumpPressed: actions.justPressed.jump || keyboardJump || spaceJump,
    }, this.world);

    this.updateCamera(delta);
    const active = this.interactionSystem.update(this.player);
    this.controls?.setActiveInteractable(active);
    this.updatePrompt(active);

    if (actions.justPressed.interact || actions.justPressed.confirm) this.tryInteract();
    this.updateHud();
  }

  updateCamera(delta) {
    const viewportWidth = this.getVisibleWorldWidth();
    this.camera.targetX = this.clampCamera(this.player.centerX - viewportWidth * 0.42);
    this.camera.x += (this.camera.targetX - this.camera.x) * Math.min(1, delta * 8);
  }

  clampCamera(x) {
    const viewportWidth = this.getVisibleWorldWidth();
    return Math.max(0, Math.min(Math.max(0, this.world.width - viewportWidth), x));
  }

  getVisibleWorldWidth(viewport = this.game.viewport) {
    const width = viewport?.width || this.camera.viewportWidth || 0;
    return width / Math.max(0.1, this.viewScale);
  }

  updatePrompt(active) {
    if (this.game.ui.hasBlockingOverlay()) {
      this.prompt.update({ interactable: null });
      return;
    }
    if (!active) {
      this.prompt.update({ interactable: null });
      return;
    }
    const viewport = this.game.viewport || { width: 0 };
    const rawX = active.centerX - this.camera.x;
    const rawY = active.y - 28;
    const x = Math.max(112, Math.min(viewport.width - 120, this.scaleScreenX(rawX, viewport)));
    const y = Math.max(82, this.scaleScreenY(rawY, viewport));
    const actionLabel = window.matchMedia?.('(pointer: coarse)').matches ? 'Tap' : 'E';
    this.prompt.update({ interactable: active, x, y, actionLabel });
  }

  scaleScreenX(x, viewport = this.game.viewport) {
    return (viewport?.width || 0) * 0.5 + (x - (viewport?.width || 0) * 0.5) * this.viewScale;
  }

  scaleScreenY(y, viewport = this.game.viewport) {
    return (viewport?.height || 0) + (y - (viewport?.height || 0)) * this.viewScale;
  }

  updateHud(force = false) {
    this.hudRefreshTimer -= 1 / 60;
    if (!force && this.hudRefreshTimer > 0) return;
    this.hudRefreshTimer = 0.2;
    this.resourceCounters?.credits.update(this.game.state.credits);
    this.resourceCounters?.research.update(this.game.state.researchPoints);

    const objective = this.game.systems.objectives.getCurrentObjective();
    const progress = this.game.systems.objectives.getProgress(objective);
    const key = objective ? `${objective.id}:${progress.text}` : 'complete';
    if (!force && this.lastObjectiveKey === key) return;
    this.lastObjectiveKey = key;
    if (!objective) {
      this.objectiveChip.innerHTML = '<span>Objective</span><strong>Reach the far planet</strong>';
      return;
    }
    this.objectiveChip.innerHTML = `
      <span>Objective</span>
      <strong>${objective.label}</strong>
      <em>${progress.text}</em>
    `;
  }

  showObjectiveDetails() {
    this.game.ui.showModal(createObjectiveModal(this.game, {
      onClose: () => this.game.ui.hideModal(),
    }));
  }

  openStorage() {
    if (this.transitioning || this.game.ui.hasBlockingOverlay()) return;
    this.rememberPlayerPosition();
    this.game.audio.playPickup();
    this.game.sceneManager.switchTo('storage');
  }

  tryInteract() {
    if (this.transitioning) return;
    if (this.game.ui.modalLayer?.children.length) return;
    const now = performance.now();
    if (now - this.lastInteractAt < 220) return;
    this.lastInteractAt = now;

    if (!this.interactionSystem.active) {
      this.game.audio.playError();
      this.game.ui.showToast('Move closer to a station.', 'default', 1000);
      return;
    }

    this.interactionSystem.tryInteract((interactable) => this.handleInteractable(interactable));
  }

  handleInteractable(interactable) {
    this.game.audio.playSuccess();
    if (interactable.id === 'upgrades') {
      this.rememberPlayerPosition();
      this.game.ui.clearHighlight();
      this.game.sceneManager.switchTo('upgrades');
      return;
    }
    if (interactable.id === 'research') {
      this.rememberPlayerPosition();
      this.game.sceneManager.switchTo('upgrades', { tab: 'research' });
      return;
    }
    if (interactable.id === 'navigation') {
      this.showNavigationMap();
      return;
    }
    if (interactable.id === 'launch') {
      this.startLaunchSequence();
    }
  }

  showNavigationMap() {
    this.rememberPlayerPosition();
    this.game.audio.playGpsOpen?.();
    this.game.ui.showModal(new NavigationMap(this.game).element);
  }

  startLaunchSequence() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.rememberPlayerPosition();
    this.game.audio.playShipLaunch();
    this.game.systems.tutorial.onLaunch();
    this.game.ui.root.classList.add('launch-wipe');
    window.setTimeout(() => {
      this.game.ui.root.classList.remove('launch-wipe');
      this.game.sceneManager.switchTo('mining');
    }, 360);
  }

  rememberPlayerPosition() {
    this.game.state.station ||= {};
    this.game.state.station.hubPlayerX = this.player?.x || this.getInteractableCenter('upgrades');
  }

  render(ctx) {
    this.renderer.draw(ctx, {
      viewport: this.game.viewport,
      world: this.world,
      camera: this.camera,
      player: this.player,
      interactables: this.interactables,
      activeInteractable: this.interactionSystem.active,
      time: this.time,
    });
  }

  exit() {
    this.controls?.destroy();
    this.prompt?.destroy();
    this.game.ui.clearHighlight();
  }
}
