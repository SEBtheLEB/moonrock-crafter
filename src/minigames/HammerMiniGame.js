export class HammerMiniGame {
  constructor({ game }) {
    this.game = game;
    this.name = 'Hammer Timing';
    this.instructions = 'Placeholder: tap to land a solid hammer strike.';
    this.complete = false;
    this.score = 74 + (game.state.crafting?.hammerBonus || 0);
  }

  update(delta, input) {
    if (input.consumePointerDowns({ source: 'canvas' }).length || input.actions.justPressed.confirm || input.actions.justPressed.mine) {
      this.complete = true;
      this.game.audio.playHammerHit();
      this.game.audio.playHammerPerfect();
    }
  }

  draw(ctx, bounds, time) {
    // Placeholder anvil art; replace with item-specific sprites once the asset pipeline starts.
    ctx.save();
    ctx.fillStyle = '#aebdca';
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 6;
    ctx.fillRect(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.55, bounds.width * 0.4, 34);
    ctx.strokeRect(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.55, bounds.width * 0.4, 34);
    ctx.fillStyle = '#ffd36b';
    ctx.font = '900 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Tap to hammer', bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.38 + Math.sin(time * 4) * 4);
    ctx.restore();
  }

  getResult() {
    return { id: 'hammerTiming', name: this.name, score: this.score, stats: { placeholder: true } };
  }
}
