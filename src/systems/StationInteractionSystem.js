export class StationInteractionSystem {
  constructor(interactables = []) {
    this.interactables = interactables;
    this.active = null;
  }

  setInteractables(interactables = []) {
    this.interactables = interactables;
    this.active = null;
  }

  update(player) {
    let best = null;
    let bestScore = Infinity;
    for (const interactable of this.interactables) {
      if (!interactable.containsPlayer(player)) continue;
      const score = interactable.distanceScore(player);
      if (score < bestScore) {
        best = interactable;
        bestScore = score;
      }
    }
    this.active = best;
    return this.active;
  }

  tryInteract(callback) {
    if (!this.active) return false;
    callback?.(this.active);
    return true;
  }
}
