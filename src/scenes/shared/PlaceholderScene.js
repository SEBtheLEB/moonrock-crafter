import { Button } from '../../ui/Button.js';

export class PlaceholderScene {
  constructor(game, { name, className, message }) {
    this.game = game;
    this.name = name;
    this.className = className;
    this.message = message;
    this.time = 0;
  }

  enter() {
    this.game.ui.setScreen(this.className);
    this.game.ui.addPanel({
      title: this.name,
      body: this.message,
      className: 'placeholder-panel',
      children: [
        new Button('Station', () => this.game.sceneManager.switchTo('station'), { icon: '<' }).element,
      ],
    });
  }

  update(delta) {
    this.time += delta;
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#09111e';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(107, 227, 255, 0.22)';
    ctx.lineWidth = 2;
    const size = Math.max(36, Math.min(width, height) * 0.16);
    const cx = width * 0.5;
    const cy = height * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 0.25);
    ctx.strokeRect(-size, -size, size * 2, size * 2);
    ctx.restore();
  }
}
