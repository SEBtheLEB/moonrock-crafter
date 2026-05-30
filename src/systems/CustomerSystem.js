import { customers } from '../data/customers.js';
import { items } from '../data/items.js';
import { recipes } from '../data/recipes.js';

export class CustomerSystem {
  constructor(game) {
    this.game = game;
    this.customers = customers;
    this.items = items;
    this.recipes = recipes;
    this.shift = null;
    this.orderCounter = 0;
  }

  startShift() {
    if (this.shift?.active) return this.shift;
    this.shift = {
      active: true,
      timer: 180,
      customers: [],
      completed: 0,
      creditsEarned: 0,
      reputationDelta: 0,
      missed: 0,
      bestCraft: null,
      lastResult: null,
    };
    this.fillCustomerSlots();
    return this.shift;
  }

  closeShift() {
    if (!this.shift) this.startShift();
    this.shift.active = false;
    return this.getShiftSummary();
  }

  getShiftSummary() {
    return {
      customersServed: this.shift?.completed || 0,
      creditsEarned: this.shift?.creditsEarned || 0,
      reputationDelta: this.shift?.reputationDelta || 0,
      bestCraft: this.shift?.bestCraft || 'None yet',
      missedCustomers: this.shift?.missed || 0,
    };
  }

  update(delta) {
    if (!this.shift?.active) return [];
    this.shift.timer = Math.max(0, this.shift.timer - delta);
    const expired = [];
    this.shift.customers.forEach((visit) => {
      if (visit.status !== 'waiting') return;
      visit.patienceRemaining = Math.max(0, visit.patienceRemaining - delta);
      if (visit.patienceRemaining <= 0) {
        visit.status = 'left';
        expired.push(visit);
      }
    });
    if (expired.length) {
      this.shift.missed += expired.length;
      this.shift.customers = this.shift.customers.filter((visit) => visit.status !== 'left');
      this.fillCustomerSlots();
    }
    if (this.shift.timer <= 0) this.closeShift();
    return expired;
  }

  fillCustomerSlots() {
    const maxSlots = this.getCustomerSlots();
    while (this.shift.customers.length < maxSlots) {
      this.shift.customers.push(this.createCustomerVisit());
    }
  }

  getCustomerSlots() {
    return Math.max(1, Math.round(this.game.state.shop?.customerSlots || 1));
  }

  createCustomerVisit(customerId = null) {
    const customer = customerId
      ? this.customers.find((entry) => entry.id === customerId)
      : this.pickCustomer();
    const order = this.createOrder(customer);
    return {
      id: `visit-${Date.now()}-${this.orderCounter}`,
      customer,
      order,
      patienceRemaining: customer.patience + (this.game.state.shop?.patienceBonus || 0),
      status: 'waiting',
      firstMeeting: !this.game.state.metCustomers?.[customer.id],
      dockProgress: 0,
    };
  }

  pickCustomer() {
    const reputation = this.game.state.reputation || 0;
    if (!this.game.state.metCustomers?.bolt) {
      return this.customers.find((customer) => customer.id === 'bolt');
    }
    const available = this.customers.filter((customer) => {
      return customer.reputationRequirement <= reputation
        && (!customer.requiresVipDock || this.game.state.shop?.vipDock)
        && customer.possibleOrders.some((itemId) => this.game.systems.crafting.isItemUnlocked(itemId));
    });
    return available[Math.floor(Math.random() * available.length)] || this.customers[0];
  }

  createOrder(customer) {
    const availableOrders = customer.possibleOrders.filter((itemId) => this.game.systems.crafting.isItemUnlocked(itemId));
    const orderItemId = customer.id === 'bolt' && !this.game.state.metCustomers?.bolt
      ? 'basicPickaxe'
      : (availableOrders[Math.floor(Math.random() * availableOrders.length)] || 'basicPickaxe');
    const item = this.items.find((entry) => entry.id === orderItemId) || this.items[0];
    const recipe = this.recipes.find((entry) => entry.output === item.id) || { ingredients: {} };
    const materialPreferenceBonus = Object.keys(recipe.ingredients).some((materialId) => customer.favoriteMaterials.includes(materialId)) ? 1.1 : 1;
    const estimatedPay = Math.round(item.basePrice * customer.budgetMultiplier * materialPreferenceBonus);
    this.orderCounter += 1;
    return {
      id: `order-${this.orderCounter}`,
      item,
      recipe,
      requestedItem: item.name,
      estimatedPay,
      qualityExpectation: item.qualityExpectation,
      status: 'waiting',
    };
  }

  getActiveVisit() {
    this.startShift();
    return this.shift.customers.find((visit) => visit.status === 'waiting' || visit.status === 'accepted') || null;
  }

  getVisitByOrder(orderId) {
    return this.shift?.customers.find((visit) => visit.order.id === orderId) || null;
  }

  getMissingMaterials(order) {
    return Object.entries(order.recipe.ingredients).filter(([materialId, required]) => {
      return this.game.systems.inventory.getStoredAmount(materialId) < required;
    }).map(([materialId, required]) => ({
      materialId,
      required,
      owned: this.game.systems.inventory.getStoredAmount(materialId),
      name: this.game.systems.materials.getDisplayName(materialId),
    }));
  }

  canCraftOrder(order) {
    return this.getMissingMaterials(order).length === 0;
  }

  acceptOrder(orderId) {
    const visit = this.getVisitByOrder(orderId);
    if (!visit) return { ok: false, reason: 'missing-order' };
    const missing = this.getMissingMaterials(visit.order);
    if (missing.length) return { ok: false, reason: 'missing-materials', missing };
    visit.status = 'accepted';
    visit.order.status = 'accepted';
    return { ok: true, visit };
  }

  completeCraft(orderId, quality = 'good') {
    const visit = this.getVisitByOrder(orderId);
    if (!visit) return null;
    const qualityMeta = this.game.systems.crafting.getQualityMeta(quality);

    const tipChance = Math.max(0, visit.customer.tipChance + qualityMeta.tipChanceBonus + (this.game.state.shop?.tipBonus || 0));
    const tip = Math.random() < tipChance ? Math.round(visit.order.estimatedPay * 0.18) : 0;
    const credits = Math.max(1, Math.round(visit.order.estimatedPay * qualityMeta.pay) + tip);
    const reputationBase = (visit.customer.reputationBonus || 0) + qualityMeta.reputation;
    const researchPoints = visit.customer.researchRewardChance && Math.random() < visit.customer.researchRewardChance ? 1 : 0;

    this.game.systems.economy.addCredits(credits, { save: false });
    this.game.systems.economy.addReputation(reputationBase, { save: false });
    this.game.systems.economy.addResearch(researchPoints, { save: false, recordObjective: false });
    if (researchPoints > 0) this.game.systems.objectives.record('researchEarned', { amount: researchPoints, source: visit.customer.id });
    this.game.state.metCustomers = { ...(this.game.state.metCustomers || {}), [visit.customer.id]: true };
    this.game.state.customerTrust = { ...(this.game.state.customerTrust || {}) };
    this.game.state.customerTrust[visit.customer.id] = (this.game.state.customerTrust[visit.customer.id] || 0) + qualityMeta.trust;
    this.game.state.completedCustomerOrders = [
      ...(this.game.state.completedCustomerOrders || []),
      {
        orderId,
        customerId: visit.customer.id,
        itemId: visit.order.item.id,
        quality,
        credits,
        tip,
        completedAt: Date.now(),
      },
    ].slice(-80);
    this.game.state.station.storageUsed = this.game.systems.inventory.getTotalStored();

    visit.status = 'served';
    visit.order.status = 'complete';
    const result = {
      ok: true,
      visit,
      quality,
      credits,
      tip,
      reputationDelta: reputationBase,
      researchPoints,
    };
    this.shift.completed += 1;
    this.shift.creditsEarned += credits;
    this.shift.reputationDelta += reputationBase;
    this.shift.bestCraft = this.pickBestCraft(this.shift.bestCraft, quality, visit.order.requestedItem);
    this.shift.lastResult = result;
    this.shift.customers = this.shift.customers.filter((entry) => entry !== visit);
    this.fillCustomerSlots();
    this.game.systems.objectives.record('saleCompleted', {
      customerId: visit.customer.id,
      itemId: visit.order.item.id,
      quality,
      credits,
    });
    this.game.systems.achievements.record('saleCompleted', { customerId: visit.customer.id, itemId: visit.order.item.id });
    this.game.saveGame();
    return result;
  }

  pickBestCraft(current, quality, itemName) {
    const rank = ['broken', 'poor', 'decent', 'good', 'excellent', 'masterwork'];
    if (!current) return `${quality} ${itemName}`;
    const currentQuality = current.split(' ')[0];
    return rank.indexOf(quality) > rank.indexOf(currentQuality) ? `${quality} ${itemName}` : current;
  }

  rejectOrder(orderId) {
    const visit = this.getVisitByOrder(orderId);
    if (!visit) return null;
    visit.status = 'rejected';
    this.shift.missed += 1;
    this.shift.customers = this.shift.customers.filter((entry) => entry !== visit);
    this.fillCustomerSlots();
    return visit;
  }

  getQualityReactionKey(quality) {
    if (quality === 'broken' || quality === 'poor') return 'poorCraft';
    if (quality === 'excellent' || quality === 'masterwork') return 'excellentCraft';
    return 'goodCraft';
  }
}
