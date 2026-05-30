import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { ResourceCounter } from '../ui/ResourceCounter.js';

export class ShopScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.payload = payload;
    this.time = 0;
    this.selectedVisitId = null;
    this.lastDialogueKey = '';
    this.reactionClass = '';
    this.patienceWarned = new Set();
    this.uiRefreshTimer = 0;
    this.uiCache = {};
  }

  enter() {
    this.game.ui.setScreen('shop-screen');
    this.shift = this.game.systems.customers.startShift();
    if (this.payload.completedOrder) this.processCompletedOrder(this.payload.completedOrder);
    this.mountUi();
    this.selectFirstVisit();
    this.startArrivalDialogue();
    this.game.systems.tutorial.onShopEnter();
    this.updateUi(true);
  }

  mountUi() {
    this.mountTopBar();
    this.customerArea = document.createElement('section');
    this.customerArea.className = 'shop-customer-area';
    this.customerArea.innerHTML = `
      <div class="customer-dock-window">
        <span class="shop-open-sign">OPEN</span>
        <span class="dock-window-rim"></span>
      </div>
      <div class="customer-card-list"></div>
    `;
    this.game.ui.addSceneElement(this.customerArea);

    this.ticketPanel = document.createElement('aside');
    this.ticketPanel.className = 'order-ticket-panel';
    this.game.ui.addSceneElement(this.ticketPanel);

    this.actionDock = document.createElement('nav');
    this.actionDock.className = 'shop-action-dock';
    this.acceptButton = new Button('Accept', () => this.acceptOrder(), { icon: 'A', variant: 'success' }).element;
    this.craftButton = new Button('Craft', () => this.craftOrder(), { icon: 'F', variant: 'forge' }).element;
    this.acceptButton.classList.add('accept-order-button');
    this.craftButton.classList.add('craft-order-button');
    this.rejectButton = new Button('Reject', () => this.rejectOrder(), { icon: 'X', variant: 'danger' }).element;
    this.closeButton = new Button('Close Shop', () => this.closeShop(), { icon: '<', variant: 'metal' }).element;
    this.actionDock.append(this.acceptButton, this.craftButton, this.rejectButton, this.closeButton);
    this.game.ui.addSceneElement(this.actionDock);
  }

  mountTopBar() {
    const hud = this.game.ui.addHud('<div class="shop-top-bar"></div>');
    this.topBar = hud.querySelector('.shop-top-bar');
  }

  processCompletedOrder(completedOrder) {
    const result = this.game.systems.customers.completeCraft(completedOrder.orderId, completedOrder.quality);
    if (!result?.ok) return;
    const key = this.game.systems.customers.getQualityReactionKey(result.quality);
    this.reactionClass = this.getReactionClass(result.quality);
    this.game.systems.dialogue.startForCustomer(result.visit.customer, key);
    this.lastDialogueKey = `${result.visit.customer.id}-${key}`;
    this.game.ui.showToast(`Sold: +${result.credits} credits`, ['broken', 'poor'].includes(result.quality) ? 'danger' : 'success');
    this.game.audio.playSaleComplete();
    if (result.tip > 0) this.game.audio.playTipReceived();
    if (result.reputationDelta > 0) this.game.audio.playReputationUp();
    if (result.reputationDelta < 0) this.game.audio.playReputationDown();
    this.game.systems.tutorial.onSaleComplete();
  }

  selectFirstVisit() {
    const active = this.game.systems.customers.getActiveVisit();
    this.selectedVisitId = active?.id || null;
  }

  getSelectedVisit() {
    return this.shift.customers.find((visit) => visit.id === this.selectedVisitId) || this.game.systems.customers.getActiveVisit();
  }

  startArrivalDialogue({ enqueue = false } = {}) {
    const visit = this.getSelectedVisit();
    if (!visit || this.payload.completedOrder) return;
    const key = visit.firstMeeting ? 'firstArrival' : 'repeatArrival';
    const dialogueKey = `${visit.customer.id}-${key}-${visit.id}`;
    if (this.lastDialogueKey === dialogueKey) return;
    this.lastDialogueKey = dialogueKey;
    this.reactionClass = 'reaction-happy';
    this.game.systems.dialogue.startForCustomer(visit.customer, key, '', { enqueue, mood: this.reactionClass });
    this.game.audio.playCustomerArrive();
  }

  update(delta) {
    this.time += delta;
    const expired = this.game.systems.customers.update(delta);
    if (expired.length) {
      this.game.ui.showToast('A customer left impatiently.', 'danger');
      this.game.audio.playCustomerLeave();
      this.reactionClass = 'reaction-disappointed';
      this.game.systems.dialogue.startForCustomer(expired[0].customer, 'leaving', '', { mood: this.reactionClass });
      this.selectFirstVisit();
      this.startArrivalDialogue({ enqueue: true });
      this.updateUi(true);
    }
    this.warnLowPatience();
    this.uiRefreshTimer -= delta;
    if (this.uiRefreshTimer <= 0) {
      this.uiRefreshTimer = 0.18;
      this.updateUi();
    }
  }

  updateUi(force = false) {
    this.updateTopBar(force);
    this.updateCustomerCards(force);
    this.updateTicket(force);
    this.updateDialogueUi();
  }

  updateTopBar(force = false) {
    const key = `${this.game.state.credits}|${this.game.state.reputation}|${Math.ceil(this.shift.timer)}`;
    if (!force && this.uiCache.topBar === key) return;
    this.uiCache.topBar = key;
    this.topBar.replaceChildren(
      new ResourceCounter('Credits', this.game.state.credits, { icon: '$' }).element,
      new ResourceCounter('Rep', this.game.state.reputation, { icon: '*' }).element,
      new ResourceCounter('Shift', `${Math.ceil(this.shift.timer)}s`, { icon: 'T' }).element,
    );
  }

  updateCustomerCards(force = false) {
    const key = this.shift.customers
      .map((visit) => `${visit.id}:${visit.status}:${Math.ceil(visit.patienceRemaining)}:${visit.id === this.selectedVisitId}`)
      .join('|');
    if (!force && this.uiCache.customerCards === key) return;
    this.uiCache.customerCards = key;
    const list = this.customerArea.querySelector('.customer-card-list');
    list.replaceChildren();
    this.shift.customers.forEach((visit) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `customer-card ${visit.id === this.selectedVisitId ? `is-active ${this.reactionClass}` : ''}`;
      card.style.setProperty('--portrait-primary', visit.customer.portraitStyle.primary);
      card.style.setProperty('--portrait-secondary', visit.customer.portraitStyle.secondary);
      card.innerHTML = `
        <span class="customer-mini-portrait ${visit.customer.portraitStyle.shape}"></span>
        <span><strong>${visit.customer.name}</strong><small>${visit.customer.species}</small></span>
        <i style="--patience:${this.getPatiencePercent(visit)}%"></i>
      `;
      card.addEventListener('click', () => {
        this.selectedVisitId = visit.id;
        this.startOrderDialogue(visit);
        this.updateUi(true);
      });
      list.append(card);
    });
  }

  updateTicket(force = false) {
    const visit = this.getSelectedVisit();
    if (!visit) {
      if (!force && this.uiCache.ticket === 'empty') return;
      this.uiCache.ticket = 'empty';
      this.ticketPanel.innerHTML = '<h1>No Customers</h1><p>The dock is quiet for now.</p>';
      return;
    }
    const order = visit.order;
    const missing = this.game.systems.customers.getMissingMaterials(order);
    const ticketKey = `${visit.id}:${order.status}:${Math.ceil(visit.patienceRemaining)}:${missing.map((entry) => `${entry.materialId}:${entry.owned}/${entry.required}`).join(',')}`;
    if (!force && this.uiCache.ticket === ticketKey) return;
    this.uiCache.ticket = ticketKey;
    const ingredients = Object.entries(order.recipe.ingredients).map(([materialId, amount]) => {
      const owned = this.game.systems.inventory.getStoredAmount(materialId);
      const material = this.game.systems.materials.getMaterial(materialId);
      return `<li class="${owned >= amount ? 'has-material' : 'missing-material'}" style="--material-color:${material?.color || '#ffd36b'}">
        <span>${this.game.systems.materials.getDisplayName(materialId)}</span>
        <strong>${owned}/${amount}</strong>
      </li>`;
    }).join('');
    this.ticketPanel.innerHTML = `
      <span class="ticket-stamp ${order.status === 'accepted' ? 'is-stamped' : ''}">Accepted</span>
      <h1>${order.requestedItem}</h1>
      <p>${visit.customer.name}'s order ticket</p>
      <div class="ticket-meta">
        <span>Pay <strong>${order.estimatedPay}</strong></span>
        <span>Quality <strong>${order.qualityExpectation}</strong></span>
        <span>Patience <strong>${Math.ceil(visit.patienceRemaining)}s</strong></span>
      </div>
      <h2>Materials</h2>
      <ul>${ingredients}</ul>
      ${missing.length ? `<div class="missing-note">Missing: ${missing.map((entry) => `${entry.required - entry.owned} ${entry.name}`).join(', ')}</div>` : ''}
    `;
    this.acceptButton.disabled = order.status === 'accepted';
    this.craftButton.disabled = order.status !== 'accepted';
  }

  updateDialogueUi() {
    const active = this.game.systems.dialogue.active;
    if (active && !active.done && active.meta?.customerId) active.mood = this.reactionClass;
    this.game.ui.setDialogueMood(this.reactionClass);
  }

  acceptOrder() {
    const visit = this.getSelectedVisit();
    if (!visit) return;
    const result = this.game.systems.customers.acceptOrder(visit.order.id);
    if (!result.ok && result.reason === 'missing-materials') {
      this.reactionClass = 'reaction-disappointed';
      this.game.systems.dialogue.startForCustomer(visit.customer, 'missingMaterials');
      this.game.ui.showToast(`Missing: ${result.missing.map((entry) => entry.name).join(', ')}`, 'danger');
      this.game.audio.playError();
      this.updateUi(true);
      return;
    }
    this.reactionClass = 'reaction-happy';
    this.startOrderDialogue(visit);
    this.game.audio.playOrderAccepted();
    this.game.ui.showToast('Order accepted. Firing up the forge...', 'success');
    this.game.systems.tutorial.onOrderAccepted();
    this.updateUi(true);
    window.setTimeout(() => {
      if (this.game.sceneManager.current !== this) return;
      if (visit.order.status === 'accepted') this.craftOrder();
    }, 420);
  }

  craftOrder() {
    const visit = this.getSelectedVisit();
    if (!visit || visit.order.status !== 'accepted') return;
    this.game.systems.dialogue.clear();
    this.game.ui.clearHighlight();
    this.game.sceneManager.switchTo('crafting', {
      mode: 'shop-order',
      orderId: visit.order.id,
      itemName: visit.order.requestedItem,
      customerName: visit.customer.name,
    });
  }

  rejectOrder() {
    const visit = this.getSelectedVisit();
    if (!visit) return;
    this.reactionClass = 'reaction-angry';
    this.game.systems.customers.rejectOrder(visit.order.id);
    this.game.ui.showToast(`${visit.customer.name} left the counter.`, 'danger');
    this.game.audio.playOrderRejected();
    this.game.audio.playCustomerLeave();
    this.selectFirstVisit();
    this.startArrivalDialogue();
    this.updateUi(true);
  }

  closeShop() {
    const sign = this.customerArea?.querySelector('.shop-open-sign');
    if (sign) {
      sign.textContent = 'CLOSED';
      sign.classList.add('is-closed');
    }
    const summary = this.game.systems.customers.closeShift();
    const modal = new Modal({
      title: 'Shift Summary',
      body: 'The counter shutters roll down with a cozy clank.',
      className: 'shop-summary-modal',
      children: [
        new Button('Station', () => this.game.sceneManager.switchTo('station'), { icon: '<', variant: 'success' }).element,
        new Button('Keep Shop Open', () => {
          const sign = this.customerArea?.querySelector('.shop-open-sign');
          if (sign) {
            sign.textContent = 'OPEN';
            sign.classList.remove('is-closed');
          }
          this.shift = this.game.systems.customers.startShift();
          this.game.ui.hideModal();
          this.selectFirstVisit();
          this.startArrivalDialogue();
          this.updateUi(true);
        }, { icon: 'S', variant: 'metal' }).element,
      ],
    }).element;
    const panel = modal.querySelector('.modal-panel');
    const details = document.createElement('div');
    details.className = 'shop-summary-grid';
    details.innerHTML = `
      <span>Customers <strong>${summary.customersServed}</strong></span>
      <span>Credits <strong>${summary.creditsEarned}</strong></span>
      <span>Reputation <strong>${summary.reputationDelta}</strong></span>
      <span>Best Craft <strong>${summary.bestCraft}</strong></span>
      <span>Missed <strong>${summary.missedCustomers}</strong></span>
    `;
    panel.insertBefore(details, panel.querySelector('.modal-actions'));
    this.game.ui.showModal(modal);
  }

  getPatiencePercent(visit) {
    const maxPatience = visit.customer.patience + (this.game.state.shop?.patienceBonus || 0);
    return Math.max(0, Math.min(100, (visit.patienceRemaining / maxPatience) * 100));
  }

  warnLowPatience() {
    this.shift.customers.forEach((visit) => {
      if (visit.status !== 'waiting' || this.patienceWarned.has(visit.id)) return;
      if (this.getPatiencePercent(visit) > 28) return;
      this.patienceWarned.add(visit.id);
      this.reactionClass = 'reaction-disappointed';
      this.game.systems.dialogue.startForCustomer(visit.customer, 'patienceLow', '', { enqueue: true, mood: this.reactionClass });
    });
  }

  startOrderDialogue(visit) {
    this.reactionClass = '';
    this.game.systems.dialogue.startForCustomer(visit.customer, 'request');
    if (this.orderUsesRareMaterial(visit.order)) {
      this.game.systems.dialogue.startForCustomer(visit.customer, 'rareMaterial', '', { enqueue: true });
    }
  }

  orderUsesRareMaterial(order) {
    return Object.keys(order.recipe.ingredients || {}).some((materialId) => {
      const rarity = this.game.systems.materials.getRarity(materialId);
      return rarity === 'rare' || rarity === 'epic';
    });
  }

  getReactionClass(quality) {
    if (quality === 'masterwork' || quality === 'excellent') return 'reaction-impressed';
    if (quality === 'good' || quality === 'decent') return 'reaction-happy';
    if (quality === 'poor') return 'reaction-disappointed';
    return 'reaction-angry';
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawBackdrop(ctx, width, height);
    this.drawShopInterior(ctx, width, height);
    this.drawCustomerShip(ctx, width, height);
  }

  drawBackdrop(ctx, width, height) {
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, 20, width * 0.5, height * 0.48, width);
    gradient.addColorStop(0, '#4b2e3d');
    gradient.addColorStop(0.5, '#102943');
    gradient.addColorStop(1, '#050614');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 250, 226, 0.8)';
    for (let i = 0; i < 70; i += 1) {
      const x = (i * 101 + this.time * 8) % width;
      const y = (i * 47) % height;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawShopInterior(ctx, width, height) {
    const floorY = height * 0.72;
    ctx.fillStyle = 'rgba(8, 22, 38, 0.82)';
    ctx.fillRect(0, floorY, width, height - floorY);
    ctx.fillStyle = 'rgba(255, 143, 61, 0.18)';
    ctx.beginPath();
    ctx.arc(width * 0.28, height * 0.62, height * 0.34, 0, Math.PI * 2);
    ctx.fill();

    this.roundRect(ctx, width * 0.1, height * 0.18, width * 0.32, height * 0.26, 22);
    ctx.fillStyle = '#0b1829';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#081626';
    ctx.stroke();

    this.roundRect(ctx, width * 0.16, height * 0.53, width * 0.2, height * 0.18, 18);
    ctx.fillStyle = '#3b2631';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff8f3d';
    ctx.shadowColor = '#ffd36b';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(width * 0.26, height * 0.61, 22 + Math.sin(this.time * 8) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    this.roundRect(ctx, width * 0.56, height * 0.56, width * 0.3, height * 0.16, 18);
    ctx.fillStyle = '#7a4a2b';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#081626';
    ctx.stroke();
  }

  drawCustomerShip(ctx, width, height) {
    const visit = this.getSelectedVisit();
    if (!visit) return;
    const bob = Math.sin(this.time * 2.4) * 5;
    const x = width * 0.27;
    const y = height * 0.31 + bob;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = visit.customer.portraitStyle.primary;
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = visit.customer.portraitStyle.secondary;
    ctx.beginPath();
    ctx.arc(18, -4, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8f3d';
    ctx.fillRect(-64, -7, 16, 14);
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
