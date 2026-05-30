export class PolishMiniGame {
  constructor({ game }) {
    this.game = game;
    this.name = 'Polish Finish';
    this.instructions = 'Placeholder: tap to sparkle-polish the edges.';
    this.complete = false;
    this.score = 78;
  }

  update(delta, input) {
    if (input.consumePointerDowns({ source: 'canvas' }).length || input.actions.justPressed.confirm || input.actions.justPressed.mine) {
      this.complete = true;
      this.game.audio.playPolishSwipe();
    }
  }

  draw(ctx, bounds, time) {
    // Placeholder polish stroke; swap for item edge paths or sprite masks later.
    ctx.save();
    ctx.strokeStyle = '#d8fbff';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#76f3ff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(bounds.x + bounds.width * 0.32, bounds.y + bounds.height * 0.62);
    ctx.quadraticCurveTo(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.34 + Math.sin(time * 3) * 8, bounds.x + bounds.width * 0.68, bounds.y + bounds.height * 0.62);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd36b';
    ctx.font = '900 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Tap to polish', bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.42);
    ctx.restore();
  }

  getResult() {
    return { id: 'polishFinish', name: this.name, score: this.score, stats: { placeholder: true } };
  }
}
