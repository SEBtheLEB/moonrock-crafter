import { Button } from './Button.js';
import { Joystick } from './Joystick.js';

export class MobileStationControls {
  constructor(game, { onInteract } = {}) {
    this.game = game;
    this.onInteract = onInteract;
    this.moveStick = new Joystick({ label: 'Walk', className: 'station-joystick' }).element;
    this.jumpButton = new Button('Jump', () => {}, {
      icon: '^',
      variant: 'forge',
      className: 'station-jump-button',
      holdAction: 'jump',
    }).element;
    this.interactButton = new Button('Interact', () => this.onInteract?.(), {
      icon: 'E',
      variant: 'success',
      className: 'station-interact-button',
      holdAction: 'interact',
    }).element;
    this.actionCluster = document.createElement('div');
    this.actionCluster.className = 'station-action-controls';
    this.actionCluster.append(this.jumpButton, this.interactButton);
    this.interactLabel = this.interactButton.querySelector('span:last-child');
  }

  mount() {
    this.container = this.game.ui.addControls([this.moveStick, this.actionCluster]);
    this.container.classList.add('station-mobile-controls');
    this.game.input.bindJoystick(this.moveStick, { mode: 'move', radius: 46 });
    this.game.input.bindHoldButton(this.jumpButton, 'jump');
    this.game.input.bindHoldButton(this.interactButton, 'interact');
    this.setActiveInteractable(null);
  }

  setActiveInteractable(interactable) {
    const active = Boolean(interactable);
    this.interactButton.disabled = !active;
    this.interactButton.classList.toggle('is-active', active);
    this.interactLabel.textContent = active ? 'Interact' : 'Find Station';
  }

  destroy() {
    this.game.input.virtualButtons.set('jump', false);
    this.game.input.virtualButtons.set('interact', false);
    this.container?.remove();
  }
}
