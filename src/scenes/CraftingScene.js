import { Button } from '../ui/Button.js';
import { OreCrackMiniGame } from '../minigames/OreCrackMiniGame.js';
import { FurnaceMiniGame } from '../minigames/FurnaceMiniGame.js';
import { HammerMiniGame } from '../minigames/HammerMiniGame.js';
import { PourMiniGame } from '../minigames/PourMiniGame.js';
import { PolishMiniGame } from '../minigames/PolishMiniGame.js';

const MINI_GAME_TYPES = {
  oreCracking: OreCrackMiniGame,
  furnaceHeating: FurnaceMiniGame,
  hammerTiming: HammerMiniGame,
  pourMold: PourMiniGame,
  polishFinish: PolishMiniGame,
};

export class CraftingScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.time = 0;
    this.run = null;
    this.currentMiniGame = null;
    this.playBounds = null;
    this.finalResult = null;
    this.didConsumeMaterials = false;
  }

  enter() {
    this.game.ui.setScreen('crafting-screen');
    if (this.payload.mode === 'shop-order') this.startShopOrder();
    else this.mountFreeCraftPicker();
  }

  exit() {
    this.game.audio.stopFurnaceLoop();
  }

  startShopOrder() {
    const visit = this.game.systems.customers.getVisitByOrder(this.payload.orderId);
    const itemId = visit?.order.item.id || this.payload.itemId;
    this.startCraftRun({
      itemId,
      orderId: this.payload.orderId,
      customerName: this.payload.customerName || visit?.customer.name || '',
      source: 'shop',
    });
  }

  mountFreeCraftPicker() {
    const available = this.game.systems.crafting.getAvailableRecipes();
    const craftable = available.filter((item) => this.game.systems.crafting.canCraftItem(item.id));
    if (!craftable.length) {
      this.game.ui.addPanel({
        title: 'Crafting',
        body: 'No craftable items yet. Mine more materials, then fire up the forge.',
        className: 'crafting-panel',
        children: [
          new Button('Station', () => this.game.sceneManager.switchTo('station'), { icon: '<', variant: 'metal' }).element,
        ],
      });
      return;
    }

    this.game.ui.addPanel({
      title: 'Free Craft',
      body: 'Choose an item to practice with. Real storage for crafted goods will come later.',
      className: 'crafting-panel free-craft-picker',
      children: craftable.slice(0, 6).map((item) => new Button(item.name, () => {
        this.game.ui.clearScene();
        this.startCraftRun({ itemId: item.id, source: 'free' });
      }, { icon: 'F', variant: item.difficulty > 2 ? 'forge' : 'primary' }).element),
    });
  }

  startCraftRun({ itemId, orderId = null, customerName = '', source = 'free' }) {
    const missing = this.game.systems.crafting.getMissingMaterials(itemId);
    if (missing.length) {
      this.game.ui.addPanel({
        title: 'Missing Materials',
        body: missing.map((entry) => `${entry.required - entry.owned} ${entry.name}`).join(', '),
        className: 'crafting-panel',
        children: [
          new Button(source === 'shop' ? 'Back to Shop' : 'Station', () => this.game.sceneManager.switchTo(source === 'shop' ? 'shop' : 'station'), { icon: '<', variant: 'metal' }).element,
        ],
      });
      this.game.audio.playError();
      return;
    }

    this.run = this.game.systems.crafting.createCraftRun({ itemId, orderId, customerName, source });
    this.didConsumeMaterials = this.game.systems.crafting.consumeMaterials(itemId);
    if (!this.run || !this.didConsumeMaterials) {
      this.game.ui.showToast('Unable to start craft.', 'danger');
      this.game.sceneManager.switchTo(source === 'shop' ? 'shop' : 'station');
      return;
    }

    this.mountCraftUi();
    this.startCurrentStep();
    this.game.systems.tutorial.onCraftingEnter({ source: this.run.source });
  }

  mountCraftUi() {
    this.hud = this.game.ui.addHud(`
      <div class="crafting-top-bar">
        <span><strong data-craft-item>${this.run.item.name}</strong><small>${this.run.item.category}</small></span>
        <span><strong data-craft-step></strong><small data-craft-progress></small></span>
        <span><strong data-craft-quality>Quality --</strong><small data-craft-score>Score 0</small></span>
      </div>
    `);
    this.hudRefs = {
      step: this.hud.querySelector('[data-craft-step]'),
      progress: this.hud.querySelector('[data-craft-progress]'),
      quality: this.hud.querySelector('[data-craft-quality]'),
      score: this.hud.querySelector('[data-craft-score]'),
    };
    this.hudCache = {};

    this.sidePanel = document.createElement('aside');
    this.sidePanel.className = 'crafting-side-panel';
    this.sidePanel.innerHTML = `
      <h2>${this.run.customerName || 'Free Craft'}</h2>
      <p>${this.run.item.description}</p>
      <h3>Materials Used</h3>
      <ul>${Object.entries(this.run.item.requiredMaterials).map(([materialId, amount]) => {
        const material = this.game.systems.materials.getMaterial(materialId);
        return `<li style="--material-color:${material?.color || '#ffd36b'}"><span>${this.game.systems.materials.getDisplayName(materialId)}</span><strong>${amount}</strong></li>`;
      }).join('')}</ul>
    `;
    this.game.ui.addSceneElement(this.sidePanel);

    this.controls = document.createElement('nav');
    this.controls.className = 'crafting-controls';
    this.heatButton = new Button('Heat', () => {}, {
      icon: 'H',
      className: 'heat-hold-button',
      variant: 'forge',
      holdAction: 'heat',
    }).element;
    this.abortButton = new Button('Abort', () => this.abortCraft(), { icon: '<', variant: 'danger' }).element;
    this.controls.append(this.heatButton, this.abortButton);
    this.game.ui.addSceneElement(this.controls);
    this.game.input.bindHoldButton(this.heatButton, 'heat');
  }

  startCurrentStep() {
    this.game.audio.stopFurnaceLoop();
    this.game.input.consumePointerDowns();
    this.game.input.consumePointerMoves();
    this.game.input.consumePointerUps();
    const stepId = this.run.sequence[this.run.stepIndex];
    const MiniGame = MINI_GAME_TYPES[stepId] || HammerMiniGame;
    this.currentMiniGame = new MiniGame({
      game: this.game,
      item: this.run.item,
      difficulty: this.run.item.difficulty,
    });
    if (this.currentMiniGame.name === 'Furnace Heating') {
      this.game.audio.playFurnaceIgnite();
      this.game.audio.startFurnaceLoop();
    }
    this.updateCraftUi();
  }

  update(delta) {
    this.time += delta;
    if (!this.run || this.finalResult) return;
    this.currentMiniGame?.update(delta, this.game.input, this.playBounds || this.getPlayBounds());
    if (this.currentMiniGame?.complete) {
      if (this.currentMiniGame.name === 'Furnace Heating') this.game.audio.stopFurnaceLoop();
      const result = this.currentMiniGame.getResult();
      this.run.stepResults.push(result);
      this.game.audio.playSuccess();
      this.advanceStep();
    }
    this.updateCraftUi();
  }

  advanceStep() {
    this.run.stepIndex += 1;
    if (this.run.stepIndex >= this.run.sequence.length) {
      this.finalResult = this.game.systems.crafting.calculateFinalQuality(this.run.stepResults, this.run.item);
      this.game.state.stats ||= {};
      this.game.state.stats.totalItemsCrafted = (this.game.state.stats.totalItemsCrafted || 0) + 1;
      this.game.state.knownRecipes = {
        ...(this.game.state.knownRecipes || {}),
        [this.run.item.id]: true,
      };
      this.game.systems.objectives.record('itemCrafted', {
        itemId: this.run.item.id,
        quality: this.finalResult.quality,
        source: this.run.source,
      });
      if (this.finalResult.quality === 'masterwork') {
        this.game.systems.achievements.record('masterworkCrafted', { itemId: this.run.item.id });
      }
      if (this.finalResult.quality === 'broken' || this.finalResult.quality === 'poor') this.game.audio.playCraftFail();
      else if (this.finalResult.quality === 'masterwork') this.game.audio.playMasterworkSting();
      else this.game.audio.playCraftSuccess();
      if (!['broken', 'poor'].includes(this.finalResult.quality)) this.game.flashCraftingSuccess();
      this.showResultPanel();
      return;
    }
    this.startCurrentStep();
  }

  showResultPanel() {
    this.controls?.classList.add('is-hidden');
    const buttonLabel = this.run.source === 'shop' ? 'Deliver to Customer' : 'Finish';
    const targetScene = this.run.source === 'shop' ? 'shop' : 'station';
    this.game.ui.addPanel({
      title: this.finalResult.label,
      body: `${this.run.item.name} finished with score ${this.finalResult.score}.`,
      className: 'craft-result-panel',
      children: [
        new Button(buttonLabel, () => {
          if (this.run.source === 'shop') {
            this.game.sceneManager.switchTo('shop', {
              completedOrder: {
                orderId: this.run.orderId,
                quality: this.finalResult.quality,
              },
            });
          } else {
            this.game.sceneManager.switchTo(targetScene);
          }
        }, { icon: '>', variant: 'success' }).element,
      ],
    });
  }

  abortCraft() {
    this.game.audio.stopFurnaceLoop();
    this.game.audio.playCraftFail();
    this.game.ui.showToast('Craft abandoned. Materials were already committed to the forge.', 'danger');
    this.game.sceneManager.switchTo(this.run?.source === 'shop' ? 'shop' : 'station');
  }

  updateCraftUi() {
    if (!this.hud || !this.run) return;
    const stepName = this.currentMiniGame?.name || 'Complete';
    const result = this.game.systems.crafting.calculateFinalQuality(this.run.stepResults, this.run.item);
    const progressText = `Step ${Math.min(this.run.stepIndex + 1, this.run.sequence.length)} / ${this.run.sequence.length}`;
    const qualityText = this.finalResult
      ? this.finalResult.label
      : this.run.stepResults.length
        ? `Quality ${result.label}`
        : 'Quality --';
    const scoreText = `Score ${this.finalResult?.score ?? result.score}`;
    this.setHudText('step', this.hudRefs.step, stepName);
    this.setHudText('progress', this.hudRefs.progress, progressText);
    this.setHudText('quality', this.hudRefs.quality, qualityText);
    this.setHudText('score', this.hudRefs.score, scoreText);
    this.heatButton.classList.toggle('is-hidden', this.currentMiniGame?.name !== 'Furnace Heating' || Boolean(this.finalResult));
  }

  setHudText(key, element, value) {
    if (!element || this.hudCache[key] === value) return;
    this.hudCache[key] = value;
    element.textContent = value;
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawForgeBackground(ctx, width, height);
    this.playBounds = this.getPlayBounds();
    this.drawPlaySurface(ctx, this.playBounds);
    if (!this.finalResult) this.currentMiniGame?.draw(ctx, this.playBounds, this.time);
  }

  getPlayBounds() {
    const { width, height } = this.game.viewport;
    return {
      x: width * 0.17,
      y: height * 0.19,
      width: width * 0.58,
      height: height * 0.62,
    };
  }

  drawForgeBackground(ctx, width, height) {
    // Swap this procedural forge backdrop for layered workshop art when final assets arrive.
    const gradient = ctx.createRadialGradient(width * 0.46, height * 0.56, 20, width * 0.46, height * 0.56, width);
    gradient.addColorStop(0, '#7d3028');
    gradient.addColorStop(0.42, '#2a1824');
    gradient.addColorStop(1, '#050614');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 143, 61, 0.16)';
    ctx.beginPath();
    ctx.arc(width * 0.14, height * 0.86, height * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = 'rgba(7, 18, 34, 0.78)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.13);
    ctx.lineTo(width, height * 0.13);
    ctx.moveTo(width * 0.08, 0);
    ctx.lineTo(width * 0.08, height);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(165, 190, 203, 0.52)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.13);
    ctx.lineTo(width, height * 0.13);
    ctx.moveTo(width * 0.08, 0);
    ctx.lineTo(width * 0.08, height);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 211, 107, 0.72)';
    for (let i = 0; i < 36; i += 1) {
      const x = (i * 83 + this.time * 42) % width;
      const y = height - ((i * 47 + this.time * 50) % height);
      ctx.globalAlpha = 0.25 + (i % 4) * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawPlaySurface(ctx, bounds) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 143, 61, 0.38)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(13, 31, 50, 0.78)';
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 6;
    this.roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 24);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 242, 207, 0.12)';
    ctx.lineWidth = 3;
    this.roundRect(ctx, bounds.x + 12, bounds.y + 12, bounds.width - 24, bounds.height - 24, 16);
    ctx.stroke();

    ctx.fillStyle = '#ffd36b';
    [[bounds.x + 20, bounds.y + 20], [bounds.x + bounds.width - 20, bounds.y + 20], [bounds.x + 20, bounds.y + bounds.height - 20], [bounds.x + bounds.width - 20, bounds.y + bounds.height - 20]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    const heat = ctx.createLinearGradient(bounds.x, bounds.y + bounds.height, bounds.x, bounds.y + bounds.height * 0.55);
    heat.addColorStop(0, 'rgba(255, 143, 61, 0.18)');
    heat.addColorStop(1, 'rgba(255, 143, 61, 0)');
    ctx.fillStyle = heat;
    this.roundRect(ctx, bounds.x + 8, bounds.y + bounds.height * 0.58, bounds.width - 16, bounds.height * 0.36, 20);
    ctx.fill();

    ctx.fillStyle = '#ffd36b';
    ctx.font = '900 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(this.currentMiniGame?.instructions || '', bounds.x + bounds.width / 2, bounds.y + 34);
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
}
