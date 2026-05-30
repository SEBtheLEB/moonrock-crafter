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

  bindJoystick(element, { mode = 'move', radius = 48, floating = false, activationRegion = 'element' } = {}) {
    element.__inputCleanup?.();
    let activePointerId = null;
    let floatingCenter = null;
    const windowListeners = [];
    const knob = element.querySelector('[data-joystick-knob]');

    if (floating) element.classList.add('is-floating');

    const getJoystickCenter = () => {
      if (floatingCenter) return floatingCenter;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    const setVector = (event) => {
      const rect = element.getBoundingClientRect();
      const movementRadius = Math.max(radius, rect.width * 0.34);
      const center = getJoystickCenter();
      const centerX = center.x;
      const centerY = center.y;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.hypot(dx, dy);
      const scale = distance > movementRadius ? movementRadius / distance : 1;
      const vector = {
        x: Math.max(-1, Math.min(1, (dx * scale) / movementRadius)),
        y: Math.max(-1, Math.min(1, (dy * scale) / movementRadius)),
      };
      if (mode === 'aim') this.virtualAim = vector;
      else this.virtualMove = vector;
      knob.style.transform = `translate(${vector.x * movementRadius}px, ${vector.y * movementRadius}px)`;
    };

    const canActivateFromEvent = (event) => {
      if (!floating) return true;
      if (event.pointerType === 'mouse') return false;
      if (!event.target.closest?.('#game-shell')) return false;
      if (event.target.closest?.('button, .modal-backdrop, .global-dialogue-box, .debug-panel')) return false;
      if (activationRegion === 'left' && event.clientX > window.innerWidth * 0.54) return false;
      return true;
    };

    const positionFloatingJoystick = (event) => {
      if (!floating) return;
      const rect = element.getBoundingClientRect();
      const baseCenterX = rect.left + rect.width / 2;
      const baseCenterY = rect.top + rect.height / 2;
      const leftLimit = Math.max(8, window.innerWidth * 0.08);
      const rightLimit = Math.max(leftLimit, window.innerWidth * 0.54 - rect.width * 0.5);
      const topLimit = 44;
      const bottomLimit = Math.max(topLimit, window.innerHeight - rect.height * 0.42);
      const centerX = Math.max(leftLimit, Math.min(rightLimit, event.clientX));
      const centerY = Math.max(topLimit, Math.min(bottomLimit, event.clientY));
      floatingCenter = { x: centerX, y: centerY };
      element.style.setProperty('--joystick-float-x', `${Math.round(centerX - baseCenterX)}px`);
      element.style.setProperty('--joystick-float-y', `${Math.round(centerY - baseCenterY)}px`);
    };

    const activate = (event) => {
      if (!canActivateFromEvent(event)) return;
      if (activePointerId !== null) return;
      activePointerId = event.pointerId;
      positionFloatingJoystick(event);
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch {
        // Floating joysticks may begin from a sibling/canvas pointer target.
      }
      element.classList.add('is-active');
      setVector(event);
    };

    element.addEventListener('pointerdown', activate);
    if (floating) {
      window.addEventListener('pointerdown', activate, { passive: false, capture: true });
      windowListeners.push(['pointerdown', activate]);
    }

    const move = (event) => {
      if (event.pointerId === activePointerId) setVector(event);
    };
    element.addEventListener('pointermove', move);
    if (floating) {
      window.addEventListener('pointermove', move, { passive: false, capture: true });
      windowListeners.push(['pointermove', move]);
    }

    const release = (event) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      floatingCenter = null;
      if (mode === 'aim') this.virtualAim = { x: 0, y: 0 };
      else this.virtualMove = { x: 0, y: 0 };
      knob.style.transform = 'translate(0, 0)';
      element.style.setProperty('--joystick-float-x', '0px');
      element.style.setProperty('--joystick-float-y', '0px');
      element.classList.remove('is-active');
    };

    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    if (floating) {
      window.addEventListener('pointerup', release, { passive: false, capture: true });
      window.addEventListener('pointercancel', release, { passive: false, capture: true });
      windowListeners.push(['pointerup', release], ['pointercancel', release]);
    }

    element.__inputCleanup = () => {
      windowListeners.forEach(([type, listener]) => {
        window.removeEventListener(type, listener, { capture: true });
      });
      if (activePointerId !== null) {
        activePointerId = null;
        floatingCenter = null;
        if (mode === 'aim') this.virtualAim = { x: 0, y: 0 };
        else this.virtualMove = { x: 0, y: 0 };
      }
    };
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
