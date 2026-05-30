export class Joystick {
  constructor({ label = 'Move', className = '', mode = 'move' } = {}) {
    this.element = document.createElement('div');
    this.element.className = `joystick ${className}`.trim();
    this.element.dataset.joystickMode = mode;
    this.element.innerHTML = `
      <span class="joystick-label">${label}</span>
      <span class="joystick-base" aria-hidden="true">
        <span class="joystick-knob" data-joystick-knob></span>
      </span>
    `;
  }
}
