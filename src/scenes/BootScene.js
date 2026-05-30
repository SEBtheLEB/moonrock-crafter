export class BootScene {
  constructor(game) {
    this.game = game;
    this.timer = 0;
  }

  enter() {
    this.game.ui.setScreen('boot-screen');
    this.game.ui.addPanel({
      title: 'Moonrock Crafter',
      body: 'Charging expedition systems...',
      className: 'boot-panel',
    });
    this.game.sceneManager.switchTo('station');
  }

  update(delta) {
    this.timer += delta;
  }

  render(ctx) {
    const { width, height } = this.game.viewport;
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#06121f');
    gradient.addColorStop(1, '#140b24');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}
