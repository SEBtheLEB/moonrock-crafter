import { research } from '../data/research.js?v=31';
import { gameBalance } from '../data/gameBalance.js?v=31';

export class ResearchSystem {
  constructor(game) {
    this.game = game;
    this.research = research;
  }

  getNode(id) {
    return this.research.find((node) => node.id === id);
  }

  isUnlocked(id) {
    return Boolean(this.game.state.research?.[id]);
  }

  getNodeState(id) {
    const node = this.getNode(id);
    if (!node) return { ok: false, missing: [{ label: 'Unknown research' }] };
    const unlocked = this.isUnlocked(id);
    const missing = unlocked ? [] : this.getMissing(node);
    return {
      ok: !unlocked && missing.length === 0,
      unlocked,
      available: !unlocked && missing.length === 0,
      missing,
      node,
    };
  }

  getMissing(node) {
    const missing = [];
    if ((node.cost || 0) > (this.game.state.researchPoints || 0)) {
      missing.push({ type: 'researchPoints', label: 'Research', needed: node.cost, owned: this.game.state.researchPoints || 0 });
    }
    (node.prerequisites || []).forEach((prerequisiteId) => {
      if (!this.isUnlocked(prerequisiteId)) {
        missing.push({ type: 'research', label: this.getNode(prerequisiteId)?.name || prerequisiteId });
      }
    });
    return missing;
  }

  unlock(id) {
    const state = this.getNodeState(id);
    if (!state.ok) return { ok: false, state };
    if (!this.game.systems.economy.spendResearch(state.node.cost || 0, { save: false })) {
      return { ok: false, state };
    }
    this.game.state.research = { ...(this.game.state.research || {}), [id]: true };
    if (state.node.unlocks?.zone) {
      this.game.state.unlockedZones = {
        ...(this.game.state.unlockedZones || {}),
        [state.node.unlocks.zone]: true,
      };
    }
    this.game.systems.objectives.record('researchUnlocked', { researchId: id });
    this.game.saveGame();
    return { ok: true, state: this.getNodeState(id) };
  }

  isZoneUnlocked(zoneId) {
    if (this.game.state.unlockedZones?.[zoneId]) return true;
    const zone = gameBalance.zones.find((entry) => entry.id === zoneId);
    if (!zone?.researchId) return true;
    return this.isUnlocked(zone.researchId);
  }

  getUnlockedZones() {
    return gameBalance.zones.filter((zone) => this.isZoneUnlocked(zone.id));
  }

  getZoneForDistance(distance) {
    const desiredZone = gameBalance.zones.find((zone) => distance >= zone.minDistance && distance < zone.maxDistance) || gameBalance.zones.at(-1);
    if (this.isZoneUnlocked(desiredZone.id)) return desiredZone;
    const unlocked = this.getUnlockedZones().filter((zone) => distance >= zone.minDistance);
    return unlocked.at(-1) || gameBalance.zones[0];
  }

  getLockedZoneForDistance(distance) {
    const desiredZone = gameBalance.zones.find((zone) => distance >= zone.minDistance && distance < zone.maxDistance) || gameBalance.zones.at(-1);
    return this.isZoneUnlocked(desiredZone.id) ? null : desiredZone;
  }
}
