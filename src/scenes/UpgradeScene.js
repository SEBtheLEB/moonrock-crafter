import { Button } from '../ui/Button.js';
import { ResourceCounter } from '../ui/ResourceCounter.js';
import { TabButton } from '../ui/TabButton.js';
import { upgradeCategories } from '../data/upgrades.js';

const TABS = [
  ...upgradeCategories,
  { id: 'research', label: 'Research', icon: 'R' },
];

export class UpgradeScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.activeTab = payload.tab || 'ship';
    this.time = 0;
    this.purchaseFlashId = '';
  }

  enter() {
    this.game.systems.upgrades.applyUpgrades();
    this.game.ui.setScreen('upgrades-screen');
    this.mountUi();
    this.game.systems.tutorial.onUpgradeSceneEnter();
  }

  mountUi() {
    this.mountTopBar();
    this.shell = document.createElement('section');
    this.shell.className = 'upgrade-workbench';
    this.shell.innerHTML = '<nav class="upgrade-tabs"></nav><main class="upgrade-content"></main>';
    this.game.ui.addSceneElement(this.shell);
    this.tabs = this.shell.querySelector('.upgrade-tabs');
    this.content = this.shell.querySelector('.upgrade-content');
    this.renderTabs();
    this.renderContent();
  }

  mountTopBar() {
    this.hud = this.game.ui.addHud('<div class="upgrade-top-bar"></div>');
    this.renderTopBar();
  }

  renderTopBar() {
    const bar = this.hud.querySelector('.upgrade-top-bar');
    bar.replaceChildren(
      new ResourceCounter('Credits', this.game.state.credits, { icon: '$' }).element,
      new ResourceCounter('Research', this.game.state.researchPoints, { icon: 'R' }).element,
      new ResourceCounter('Storage', `${this.game.systems.inventory.getTotalStored()}/${this.game.state.station.storageMax}`, { icon: '#' }).element,
      new Button('Station', () => this.game.sceneManager.switchTo('station'), { icon: '<', variant: 'metal', className: 'upgrade-back-button' }).element,
    );
  }

  renderTabs() {
    this.tabs.replaceChildren();
    TABS.forEach((tab) => {
      const button = new TabButton(`${tab.icon} ${tab.label}`, () => {
        this.activeTab = tab.id;
        this.game.audio.playTabSwitch();
        this.renderTabs();
        this.renderContent();
      }, { active: this.activeTab === tab.id }).element;
      this.tabs.append(button);
    });
  }

  renderContent() {
    this.content.replaceChildren();
    if (this.activeTab === 'research') this.renderResearch();
    else this.renderUpgradeCards(this.activeTab);
  }

  renderUpgradeCards(categoryId) {
    const category = upgradeCategories.find((entry) => entry.id === categoryId);
    const list = document.createElement('section');
    list.className = 'upgrade-card-grid';
    const heading = document.createElement('header');
    heading.className = 'upgrade-section-heading';
    heading.innerHTML = `
      <span class="upgrade-section-icon">${category?.icon || '+'}</span>
      <div>
        <h1>${category?.label || 'Upgrades'}</h1>
        <p>${this.getCategoryCopy(categoryId)}</p>
      </div>
    `;
    this.content.append(heading, list);

    this.game.systems.upgrades.getByCategory(categoryId).forEach((upgrade) => {
      list.append(this.createUpgradeCard(upgrade));
    });
  }

  createUpgradeCard(upgrade) {
    const state = this.game.systems.upgrades.getPurchaseState(upgrade.id);
    const card = document.createElement('article');
    card.className = `upgrade-card ${state.maxed ? 'is-maxed' : state.ok ? 'is-available' : 'is-locked'} ${this.purchaseFlashId === upgrade.id ? 'is-purchased' : ''}`.trim();
    card.innerHTML = `
      <header>
        <span class="upgrade-card-icon">${upgrade.icon}</span>
        <div>
          <h2>${upgrade.name}</h2>
          <p>${upgrade.description}</p>
        </div>
        <strong class="upgrade-level">Lv ${state.level}/${upgrade.maxLevel}</strong>
      </header>
      <div class="upgrade-preview">
        ${state.preview.map((preview) => `
          <span>
            <small>${preview.label}</small>
            <strong>${preview.current} <b>></b> ${state.maxed ? preview.current : preview.next}</strong>
          </span>
        `).join('')}
      </div>
      <div class="upgrade-card-footer">
        <div>
          <h3>${state.maxed ? 'Installed' : 'Cost'}</h3>
          ${state.maxed ? '<span class="upgrade-cost-chip success">Max Level</span>' : this.renderCost(state.cost)}
          ${state.missing.length ? `<div class="upgrade-missing">Missing: ${state.missing.map((entry) => entry.label).join(', ')}</div>` : ''}
        </div>
      </div>
    `;
    const footer = card.querySelector('.upgrade-card-footer');
    const button = new Button(state.maxed ? 'Maxed' : 'Buy', () => this.buyUpgrade(upgrade.id), {
      icon: state.maxed ? '*' : '+',
      variant: state.ok ? 'forge' : 'metal',
    }).element;
    button.disabled = !state.ok;
    footer.append(button);
    return card;
  }

  buyUpgrade(upgradeId) {
    const result = this.game.systems.upgrades.purchase(upgradeId);
    if (!result.ok) {
      this.game.ui.showToast(this.describeMissing(result.state.missing), 'danger');
      this.game.audio.playError();
      return;
    }
    this.purchaseFlashId = upgradeId;
    this.game.ui.showToast(`Installed ${result.state.upgrade.name} Lv ${result.purchasedLevel}`, 'success');
    this.game.audio.playPurchase();
    this.renderTopBar();
    this.renderContent();
    window.setTimeout(() => {
      this.purchaseFlashId = '';
      this.renderContent();
    }, 320);
  }

  renderResearch() {
    const wrap = document.createElement('section');
    wrap.className = 'research-wrap';
    wrap.innerHTML = `
      <header class="upgrade-section-heading research-heading">
        <span class="upgrade-section-icon">R</span>
        <div>
          <h1>Research Star Map</h1>
          <p>Spend research points to chart deeper zones and unlock advanced station plans.</p>
        </div>
      </header>
      <div class="research-board"></div>
    `;
    const board = wrap.querySelector('.research-board');
    board.append(this.createResearchLines());
    this.game.systems.research.research.forEach((node) => {
      board.append(this.createResearchNode(node));
    });
    this.content.append(wrap);
  }

  createResearchLines() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('research-lines');
    svg.setAttribute('viewBox', '0 0 100 100');
    this.game.systems.research.research.forEach((node) => {
      (node.prerequisites || []).forEach((prerequisiteId) => {
        const from = this.game.systems.research.getNode(prerequisiteId);
        if (!from) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', from.position.x);
        line.setAttribute('y1', from.position.y);
        line.setAttribute('x2', node.position.x);
        line.setAttribute('y2', node.position.y);
        line.classList.add(this.game.systems.research.isUnlocked(prerequisiteId) ? 'is-lit' : 'is-dim');
        svg.append(line);
      });
    });
    return svg;
  }

  createResearchNode(node) {
    const state = this.game.systems.research.getNodeState(node.id);
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `research-node ${state.unlocked ? 'is-unlocked' : state.available ? 'is-available' : 'is-locked'}`;
    element.style.left = `${node.position.x}%`;
    element.style.top = `${node.position.y}%`;
    element.innerHTML = `
      <span>${node.icon}</span>
      <strong>${node.name}</strong>
      <small>${state.unlocked ? 'Unlocked' : `${node.cost} RP`}</small>
      ${state.missing.length ? `<em>${state.missing.map((entry) => entry.label).join(', ')}</em>` : `<em>${node.description}</em>`}
    `;
    element.addEventListener('click', () => this.unlockResearch(node.id));
    return element;
  }

  unlockResearch(nodeId) {
    const result = this.game.systems.research.unlock(nodeId);
    if (!result.ok) {
      this.game.ui.showToast(this.describeMissing(result.state.missing), 'danger');
      this.game.audio.playError();
      return;
    }
    this.game.ui.showToast(`Research unlocked: ${result.state.node.name}`, 'success');
    this.game.audio.playPurchase();
    this.renderTopBar();
    this.renderContent();
  }

  renderCost(cost = {}) {
    const chips = [];
    if (cost.credits) chips.push(`<span class="upgrade-cost-chip"><b>$</b>${cost.credits}</span>`);
    if (cost.researchPoints) chips.push(`<span class="upgrade-cost-chip"><b>R</b>${cost.researchPoints}</span>`);
    Object.entries(cost.materials || {}).forEach(([materialId, amount]) => {
      const material = this.game.systems.materials.getMaterial(materialId);
      chips.push(`<span class="upgrade-cost-chip" style="--material-color:${material?.color || '#ffd36b'}"><b></b>${amount} ${this.game.systems.materials.getDisplayName(materialId)}</span>`);
    });
    return `<div class="upgrade-cost-list">${chips.join('') || '<span class="upgrade-cost-chip success">Free</span>'}</div>`;
  }

  describeMissing(missing = []) {
    if (!missing.length) return 'Requirements not met.';
    return `Missing: ${missing.map((entry) => entry.label).join(', ')}`;
  }

  getCategoryCopy(categoryId) {
    const copy = {
      ship: 'Range, survivability, cargo, and control upgrades for deeper runs.',
      mining: 'Laser, scanner, magnet, and precision tools for better asteroid work.',
      forge: 'Workbench improvements that make crafting easier and unlock better recipes.',
      shop: 'Customer flow, patience, tips, and rare visitor upgrades.',
      utility: 'Station storage and service upgrades that keep the workshop humming.',
    };
    return copy[categoryId] || 'Blueprints ready for station work.';
  }

  update(delta) {
    this.time += delta;
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawBlueprintWorkshop(ctx, width, height);
  }

  drawBlueprintWorkshop(ctx, width, height) {
    const gradient = ctx.createRadialGradient(width * 0.48, height * 0.55, 20, width * 0.48, height * 0.55, width);
    gradient.addColorStop(0, '#2e4260');
    gradient.addColorStop(0.48, '#17233d');
    gradient.addColorStop(1, '#050614');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#76f3ff';
    ctx.lineWidth = 1;
    const spacing = 34;
    for (let x = -spacing; x < width + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + (this.time * 6) % spacing, 0);
      ctx.lineTo(x + (this.time * 6) % spacing, height);
      ctx.stroke();
    }
    for (let y = -spacing; y < height + spacing; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255, 143, 61, 0.18)';
    ctx.beginPath();
    ctx.arc(width * 0.16, height * 0.86, height * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 211, 107, 0.82)';
    for (let i = 0; i < 28; i += 1) {
      const x = (i * 91 + this.time * 18) % width;
      const y = (i * 39 + Math.sin(this.time + i) * 8) % height;
      ctx.globalAlpha = 0.2 + (i % 3) * 0.09;
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
