import { materialRarities, materials } from '../data/materials.js';

export class MaterialSystem {
  constructor(game) {
    this.game = game;
    this.materials = materials;
    this.rarities = materialRarities;
  }

  getMaterial(id) {
    return this.materials.find((material) => material.id === id);
  }

  getDisplayName(id) {
    return this.getMaterial(id)?.name || id;
  }

  getRarity(id) {
    return this.getMaterial(id)?.rarity || 'common';
  }

  getColor(id) {
    return this.getMaterial(id)?.color || this.rarities.common.color;
  }

  getRarityColor(rarity) {
    return this.rarities[rarity]?.color || this.rarities.common.color;
  }

  getWeight(id) {
    return this.getMaterial(id)?.weight ?? 1;
  }

  getBaseValue(id) {
    return this.getMaterial(id)?.baseValue ?? 0;
  }

  getValue(id, amount = 1) {
    return this.getBaseValue(id) * amount;
  }

  getCargoWeight(cargo = {}) {
    return Object.entries(cargo).reduce((total, [materialId, amount]) => {
      return total + this.getWeight(materialId) * amount;
    }, 0);
  }

  getCargoValue(cargo = {}) {
    return Object.entries(cargo).reduce((total, [materialId, amount]) => {
      return total + this.getValue(materialId, amount);
    }, 0);
  }

  groupCargoByRarity(cargo = {}) {
    const groups = {};
    Object.entries(cargo).forEach(([itemId, amount]) => {
      if (amount <= 0) return;
      const material = this.getMaterial(itemId);
      const rarity = this.getRarity(itemId);
      if (!groups[rarity]) groups[rarity] = [];
      groups[rarity].push({
        itemId,
        amount,
        name: this.getDisplayName(itemId),
        color: this.getColor(itemId),
        icon: material?.icon || '?',
        rarity,
        baseValue: this.getBaseValue(itemId),
        totalValue: this.getValue(itemId, amount),
        weight: this.getWeight(itemId),
        totalWeight: this.getWeight(itemId) * amount,
        description: material?.description || '',
      });
    });
    return groups;
  }

  getRarityLabel(rarity) {
    return this.rarities[rarity]?.name || rarity;
  }
}
