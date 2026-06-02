import { Game } from './core/Game.js?v=153';

const game = new Game({
  canvas: document.querySelector('#game-canvas'),
  uiRoot: document.querySelector('#ui-root'),
});

game.start();

window.moonrockCrafter = game;
