const KEY_BINDINGS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  a: 'left',
  A: 'left',
  s: 'down',
  S: 'down',
  d: 'right',
  D: 'right',
  e: 'interact',
  E: 'interact',
  j: 'tool',
  J: 'tool',
  ' ': 'mine',
  Enter: 'confirm',
  Escape: 'pause',
  F2: 'debugToggle',
  '`': 'debugToggle',
};

export class InputManager {
  constructor(canvas, uiRoot = document.body) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.keys = new Set();
    this.pointers = new Map();
    this.primaryPointer = { x: 0, y: 0, down: false, source: 'none' };
    this.virtualMove = { x: 0, y: 0 };
    this.virtualAim = { x: 0, y: 0 };
    this.virtualButtons = new Map();
    this.pointerDownEvents = [];
    this.pointerMoveEvents = [];
    this.pointerUpEvents = [];
    this.actions = this.createActionState();
    this.previousActions = this.createActionState();
    this.moveVector = { x: 0, y: 0 };
    this.aimVector = { x: 0, y: 0 };

    this.onKey = this.onKey.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    window.addEventListener('keydown', (event) => this.onKey(event, true), { passive: false });
    window.addEventListener('keyup', (event) => this.onKey(event, false), { passive: false });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: false, capture: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: false, capture: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: false, capture: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: false, capture: true });
    window.addEventListener('blur', () => this.resetTransientState());
  }

  createActionState() {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
      confirm: false,
      cancel: false,
      pause: false,
      debugToggle: false,
      interact: false,
      jump: false,
      tool: false,
      mine: false,
      debug1: false,
      debug2: false,
      debug3: false,
      justPressed: {},
      justReleased: {},
    };
  }

  onKey(event, isDown) {
    const mappedAction = KEY_BINDINGS[event.key];
    const isDebugKey = /^[1-9]$/.test(event.key);
    if (mappedAction || isDebugKey) event.preventDefault();
    if (isDown) this.keys.add(event.key);
    else this.keys.delete(event.key);
  }

  onPointerDown(event) {
    this.capturePointer(event);
    const pointer = this.pointerFromEvent(event, true);
    this.pointers.set(event.pointerId, pointer);
    this.pointerDownEvents.push(pointer);
    this.updatePrimaryPointer(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.pointers.has(event.pointerId)) return;
    this.capturePointer(event);
    const pointer = this.pointerFromEvent(event, true);
    this.pointers.set(event.pointerId, pointer);
    this.pointerMoveEvents.push(pointer);
    this.updatePrimaryPointer(event.pointerId);
  }

  onPointerUp(event) {
    this.capturePointer(event);
    const pointer = this.pointerFromEvent(event, false);
    this.pointers.set(event.pointerId, pointer);
    this.pointerUpEvents.push(pointer);
    this.pointers.delete(event.pointerId);
    this.updatePrimaryPointer();
  }

  capturePointer(event) {
    if (event.target.closest?.('#game-shell')) event.preventDefault();
  }

  pointerFromEvent(event, down) {
    const canvasRect = this.canvas.getBoundingClientRect();
    return {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      canvasX: event.clientX - canvasRect.left,
      canvasY: event.clientY - canvasRect.top,
      down,
      type: event.pointerType,
      source: event.target.closest?.('#ui-root') ? 'ui' : 'canvas',
      target: event.target,
    };
  }

  updatePrimaryPointer(preferredId) {
    const pointer = preferredId ? this.pointers.get(preferredId) : this.pointers.values().next().value;
    if (!pointer) {
      this.primaryPointer = { ...this.primaryPointer, down: false, source: 'none' };
      return;
    }
    this.primaryPointer = {
      x: pointer.canvasX,
      y: pointer.canvasY,
      down: pointer.down,
      source: pointer.source,
    };
  }

  bindJoystick(element, { mode = 'move', radius = 48 } = {}) {
    let activePointerId = null;
    const knob = element.querySelector('[data-joystick-knob]');

    const setVector = (event) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.hypot(dx, dy);
      const scale = distance > radius ? radius / distance : 1;
      const vector = {
        x: Math.max(-1, Math.min(1, (dx * scale) / radius)),
        y: Math.max(-1, Math.min(1, (dy * scale) / radius)),
      };
      if (mode === 'aim') this.virtualAim = vector;
      else this.virtualMove = vector;
      knob.style.transform = `translate(${vector.x * radius}px, ${vector.y * radius}px)`;
    };

    element.addEventListener('pointerdown', (event) => {
      activePointerId = event.pointerId;
      element.setPointerCapture?.(event.pointerId);
      element.classList.add('is-active');
      setVector(event);
    });

    element.addEventListener('pointermove', (event) => {
      if (event.pointerId === activePointerId) setVector(event);
    });

    const release = (event) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      if (mode === 'aim') this.virtualAim = { x: 0, y: 0 };
      else this.virtualMove = { x: 0, y: 0 };
      knob.style.transform = 'translate(0, 0)';
      element.classList.remove('is-active');
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
  }

  bindHoldButton(element, actionName) {
    const activePointers = new Set();
    const setHeld = () => {
      this.virtualButtons.set(actionName, activePointers.size > 0);
      element.classList.toggle('is-held', activePointers.size > 0);
    };

    element.addEventListener('pointerdown', (event) => {
      activePointers.add(event.pointerId);
      element.setPointerCapture?.(event.pointerId);
      setHeld();
    });

    const release = (event) => {
      activePointers.delete(event.pointerId);
      setHeld();
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', release);
  }

  update() {
    const next = this.createActionState();
    const keyActionNames = new Set();

    this.keys.forEach((key) => {
      const mapped = KEY_BINDINGS[key];
      if (mapped) keyActionNames.add(mapped);
      if (/^[1-9]$/.test(key)) keyActionNames.add(`debug${key}`);
    });

    keyActionNames.forEach((actionName) => {
      next[actionName] = true;
    });

    this.virtualButtons.forEach((held, actionName) => {
      if (held) next[actionName] = true;
    });

    this.pointers.forEach((pointer) => {
      if (pointer.down && pointer.source === 'canvas' && pointer.type === 'mouse') {
        next.mine = true;
      }
    });

    const keyboardX = Number(next.right) - Number(next.left);
    const keyboardY = Number(next.down) - Number(next.up);
    this.moveVector = this.normalizeVector({
      x: keyboardX || this.virtualMove.x,
      y: keyboardY || this.virtualMove.y,
    });
    this.aimVector = this.normalizeVector(this.virtualAim);

    if (Math.abs(this.moveVector.x) > 0.05) {
      next.left = this.moveVector.x < -0.05;
      next.right = this.moveVector.x > 0.05;
    }
    if (Math.abs(this.moveVector.y) > 0.05) {
      next.up = this.moveVector.y < -0.05;
      next.down = this.moveVector.y > 0.05;
    }

    Object.keys(next).forEach((actionName) => {
      if (actionName === 'justPressed' || actionName === 'justReleased') return;
      next.justPressed[actionName] = next[actionName] && !this.actions[actionName];
      next.justReleased[actionName] = !next[actionName] && this.actions[actionName];
    });

    this.previousActions = this.actions;
    this.actions = next;
  }

  consumePointerDowns({ source = null } = {}) {
    return this.consumePointerEvents('pointerDownEvents', source);
  }

  consumePointerMoves({ source = null } = {}) {
    return this.consumePointerEvents('pointerMoveEvents', source);
  }

  consumePointerUps({ source = null } = {}) {
    return this.consumePointerEvents('pointerUpEvents', source);
  }

  consumePointerEvents(queueName, source) {
    const events = this[queueName];
    this[queueName] = [];
    return source ? events.filter((event) => event.source === source) : events;
  }

  normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (length <= 1) return vector;
    return { x: vector.x / length, y: vector.y / length };
  }

  resetTransientState() {
    this.keys.clear();
    this.pointers.clear();
    this.virtualButtons.clear();
    this.pointerDownEvents = [];
    this.pointerMoveEvents = [];
    this.pointerUpEvents = [];
    this.virtualMove = { x: 0, y: 0 };
    this.virtualAim = { x: 0, y: 0 };
    this.actions = this.createActionState();
    this.previousActions = this.createActionState();
  }
}
