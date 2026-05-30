import { gameBalance } from '../data/gameBalance.js?v=32';

export class AchievementSystem {
  constructor(game) {
    this.game = game;
    this.achievements = gameBalance.progression.achievements;
  }

  get state() {
    this.game.state.achievements ||= {};
    return this.game.state.achievements;
  }

  record(trigger, payload = {}) {
    const achievement = this.achievements.find((entry) => entry.trigger === trigger);
    if (!achievement || this.state[achievement.id]) return false;
    if (trigger === 'rareFind' && payload.rarity === 'common') return false;
    this.unlock(achievement);
    return true;
  }

  unlock(achievement) {
    this.state[achievement.id] = true;
    this.grantReward(achievement.reward);
    this.game.ui.showToast(`Achievement: ${achievement.label}`, 'success', 2800);
    this.game.audio.playSuccess();
    this.game.saveGame();
  }

  grantReward(reward = {}) {
    this.game.systems.economy.addCredits(reward.credits || 0, { save: false });
    this.game.systems.economy.addResearch(reward.researchPoints || 0, { save: false, recordObjective: false });
  }
}
