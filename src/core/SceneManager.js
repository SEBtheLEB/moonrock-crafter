export class SceneManager {
  constructor(game) {
    this.game = game;
    this.sceneTypes = new Map();
    this.current = null;
    this.currentName = '';
  }

  register(name, SceneType) {
    this.sceneTypes.set(name, SceneType);
  }

  switchTo(name, payload = {}) {
    const SceneType = this.sceneTypes.get(name);
    if (!SceneType) throw new Error(`Scene "${name}" has not been registered.`);

    this.current?.exit?.();
    this.game.paused = false;
    this.game.ui.clearScene();
    this.game.ui.hidePauseMenu();
    this.currentName = name;
    this.current = new SceneType(this.game, payload);
    const scene = this.current;
    this.current.enter?.();
    if (this.current !== scene) return;
    this.current.resize?.(this.game.viewport);
    this.game.audio.playSceneTransition();
    this.game.audio.setScene(name);
  }

  update(delta) {
    this.current?.update?.(delta);
  }

  render(ctx) {
    this.current?.render?.(ctx);
  }
}
