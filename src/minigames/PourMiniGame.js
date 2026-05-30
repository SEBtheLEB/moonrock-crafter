export class PourMiniGame {
  constructor({ game }) {
    this.game = game;
    this.name = 'Pour Mold';
    this.instructions = 'Placeholder: tap to complete a careful pour.';
    this.complete = false;
    this.score = 72;
  }

  update(delta, input) {
    if (input.consumePointerDowns({ source: 'canvas' }).length || input.actions.justPressed.confirm || input.actions.justPressed.mine) {
      this.complete = true;
      this.game.audio.playMoltenPour();
    }
  }

  draw(ctx, bounds, time) {
    // Placeholder mold art; later this can read mold silhouettes from item data or sprites.
    ctx.save();
    ctx.fillStyle = '#ff8f3d';
    ctx.shadowColor = '#ffd36b';
    ctx.shadowBlur = 18;
    ctx.fillRect(bounds.x + bounds.width * 0.42, bounds.y + bounds.height * 0.22, 24, bounds.height * 0.28 + Math.sin(time * 3) * 8);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#081626';
    ctx.lineWidth = 6;
    ctx.strokeRect(bounds.x + bounds.width * 0.34, bounds.y + bounds.height * 0.58, bounds.width * 0.32, 46);
    ctx.fillStyle = '#ffd36b';
    ctx.font = '900 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Tap to pour', bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.42);
    ctx.restore();
  }

  getResult() {
    return { id: 'pourMold', name: this.name, score: this.score, stats: { placeholder: true } };
  }
}
