import { HOTBAR_SLOT_COUNT, getHotbarSlot } from '../data/hotbar.js?v=93';

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
  f: 'primaryUse',
  F: 'primaryUse',
  g: 'stabilize',
  G: 'stabilize',
  i: 'inventory',
  I: 'inventory',
  c: 'crafting',
  C: 'crafting',
  k: 'primaryUse',
  K: 'primaryUse',
  Tab: 'inventory',
  ' ': 'jump',
  Enter: 'confirm',
  Escape: 'pause',
  F2: 'debugToggle',
  '`': 'debugToggle',
};

const GAMEPAD_DEADZONE = 0.18;
const GAMEPAD_TRIGGER_THRESHOLD = 0.34;

const GAMEPAD_BUTTONS = {
  confirm: 0,
  cancel: 1,
  mineFace: 2,
  stabilize: 3,
  tool: 4,
  attackShoulder: 5,
  attackTrigger: 6,
  mineTrigger: 7,
  select: 8,
  pause: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
};

export class InputManager {
  constructor(canvas, uiRoot = document.body) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.keys = new Set();
    this.pointers = new Map();
    this.primaryPointer = { x: 0, y: 0, down: false, source: 'none' };
    this.mousePointer = { x: 0, y: 0, canvasX: 0, canvasY: 0, down: false, button: -1, buttons: 0, inside: false, source: 'none' };
    this.virtualMove = { x: 0, y: 0 };
    this.virtualAim = { x: 0, y: 0 };
    this.gamepadMove = { x: 0, y: 0 };
    this.gamepadAim = { x: 0, y: 0 };
    this.gamepadIndex = null;
    this.gamepadLabel = '';
    this.gamepadConnected = false;
    this.controllerActivityFrames = 0;
    this.inputMode = document.documentElement.dataset.inputMode || 'keyboard';
    this.cursorElement = this.createCustomCursor();
    this.cursorX = -100;
    this.cursorY = -100;
    this.cursorVisible = false;
    this.selectedHotbarIndex = 0;
    this.selectHotbarSlot(0);
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
    this.onWheel = this.onWheel.bind(this);
    this.onGamepadConnected = this.onGamepadConnected.bind(this);
    this.onGamepadDisconnected = this.onGamepadDisconnected.bind(this);

    window.addEventListener('keydown', (event) => this.onKey(event, true), { passive: false });
    window.addEventListener('keyup', (event) => this.onKey(event, false), { passive: false });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: false, capture: true });
    window.addEventListener('pointermove', this.onPointerMove, { passive: false, capture: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: false, capture: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: false, capture: true });
    window.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    window.addEventListener('contextmenu', (event) => {
      if (event.target.closest?.('#game-shell')) event.preventDefault();
    }, { capture: true });
    window.addEventListener('blur', () => this.resetTransientState());
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
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
      primaryUse: false,
      stabilize: false,
      mine: false,
      attack: false,
      placeFlag: false,
      placeFurnace: false,
      placeCraftingStation: false,
      inventory: false,
      crafting: false,
      hotbarNext: false,
      hotbarPrevious: false,
      debug1: false,
      debug2: false,
      debug3: false,
      justPressed: {},
      justReleased: {},
    };
  }

  onKey(event, isDown) {
    const mappedAction = KEY_BINDINGS[event.key];
    const hotbarKey = /^[1-7]$/.test(event.key);
    if (mappedAction || hotbarKey) event.preventDefault();
    if (isDown && hotbarKey && !event.repeat) this.selectHotbarSlot(Number(event.key) - 1);
    if (isDown && (mappedAction || hotbarKey)) this.setInputMode('keyboard');
    if (isDown) this.keys.add(event.key);
    else this.keys.delete(event.key);
  }

  onPointerDown(event) {
    this.setInputMode(event.pointerType === 'touch' ? 'touch' : 'mouse');
    this.updateCustomCursor(event, event.buttons > 0);
    this.capturePointer(event);
    const pointer = this.pointerFromEvent(event, true);
    this.pointers.set(event.pointerId, pointer);
    if (event.pointerType === 'mouse') this.updateMousePointer(pointer, true);
    this.pointerDownEvents.push(pointer);
    this.updatePrimaryPointer(event.pointerId);
  }

  onPointerMove(event) {
    if (event.pointerType === 'mouse') this.setInputMode('mouse');
    if (event.pointerType === 'touch') this.setInputMode('touch');
    this.updateCustomCursor(event, event.buttons > 0);
    const isTrackedPointer = this.pointers.has(event.pointerId);
    this.capturePointer(event);
    const pointer = this.pointerFromEvent(event, isTrackedPointer);
    if (event.pointerType === 'mouse') this.updateMousePointer(pointer, isTrackedPointer);
    if (!isTrackedPointer) return;
    this.pointers.set(event.pointerId, pointer);
    this.pointerMoveEvents.push(pointer);
    this.updatePrimaryPointer(event.pointerId);
  }

  onPointerUp(event) {
    this.setInputMode(event.pointerType === 'touch' ? 'touch' : 'mouse');
    this.updateCustomCursor(event, false);
    this.capturePointer(event);
    const pointer = this.pointerFromEvent(event, false);
    this.pointers.set(event.pointerId, pointer);
    if (event.pointerType === 'mouse') this.updateMousePointer(pointer, false);
    this.pointerUpEvents.push(pointer);
    this.pointers.delete(event.pointerId);
    this.updatePrimaryPointer();
  }

  onWheel(event) {
    if (!event.target.closest?.('#game-shell')) return;
    if (event.target.closest?.('.modal-backdrop, .global-dialogue-box, .debug-panel, .upgrade-workbench, .storage-workshop')) return;
    if (Math.abs(event.deltaY) < 1 && Math.abs(event.deltaX) < 1) return;
    event.preventDefault();
    const direction = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? Math.sign(event.deltaY)
      : Math.sign(event.deltaX);
    if (direction === 0) return;
    this.setInputMode('mouse');
    this.cycleHotbar(direction);
  }

  onGamepadConnected(event) {
    this.gamepadIndex = event.gamepad.index;
    this.gamepadLabel = event.gamepad.id || 'Controller';
    this.gamepadConnected = true;
  }

  onGamepadDisconnected(event) {
    if (this.gamepadIndex === event.gamepad.index) {
      this.gamepadIndex = null;
      this.gamepadLabel = '';
      this.gamepadMove = { x: 0, y: 0 };
      this.gamepadAim = { x: 0, y: 0 };
      this.controllerActivityFrames = 0;
    }
    this.gamepadConnected = this.findConnectedGamepad() !== null;
  }

  setInputMode(mode) {
    if (!mode || this.inputMode === mode) return;
    this.inputMode = mode;
    document.documentElement.dataset.inputMode = mode;
  }

  capturePointer(event) {
    if (event.target.closest?.('#game-shell')) event.preventDefault();
  }

  createCustomCursor() {
    if (typeof document === 'undefined' || !document.body) return null;
    const existing = document.querySelector('.game-custom-cursor');
    if (existing) return existing;
    const element = document.createElement('div');
    element.className = 'game-custom-cursor';
    element.setAttribute('aria-hidden', 'true');
    document.body.append(element);
    return element;
  }

  updateCustomCursor(event, pressed = false) {
    if (!this.cursorElement || event.pointerType === 'touch') {
      this.cursorElement?.classList.remove('is-visible', 'is-pressed');
      return;
    }
    const insideGame = Boolean(event.target?.closest?.('#game-shell'));
    if (!insideGame) {
      this.cursorElement.classList.remove('is-visible', 'is-pressed');
      this.cursorVisible = false;
      return;
    }
    const previousX = this.cursorX;
    const previousY = this.cursorY;
    this.cursorX = event.clientX;
    this.cursorY = event.clientY;
    const dx = this.cursorX - previousX;
    const dy = this.cursorY - previousY;
    const speed = Math.min(1, Math.hypot(dx, dy) / 34);
    this.cursorElement.style.setProperty('--cursor-x', `${this.cursorX}px`);
    this.cursorElement.style.setProperty('--cursor-y', `${this.cursorY}px`);
    this.cursorElement.style.setProperty('--cursor-speed', `${speed.toFixed(3)}`);
    this.cursorElement.classList.toggle('is-visible', true);
    this.cursorElement.classList.toggle('is-pressed', Boolean(pressed));
    this.cursorVisible = true;
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
      button: event.button,
      buttons: event.buttons,
      type: event.pointerType,
      source: event.target.closest?.('#ui-root') ? 'ui' : 'canvas',
      target: event.target,
    };
  }

  updateMousePointer(pointer, down) {
    this.mousePointer = {
      x: pointer.x,
      y: pointer.y,
      canvasX: pointer.canvasX,
      canvasY: pointer.canvasY,
      down,
      button: pointer.button,
      buttons: pointer.buttons,
      inside: Boolean(pointer.target?.closest?.('#game-shell')),
      source: pointer.source,
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

  selectHotbarSlot(index) {
    const nextIndex = Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, Number(index) || 0));
    this.selectedHotbarIndex = nextIndex;
    document.documentElement.dataset.selectedTool = this.getSelectedHotbarSlot()?.id || '';
  }

  cycleHotbar(direction = 1) {
    const normalized = direction >= 0 ? 1 : -1;
    this.selectHotbarSlot((this.selectedHotbarIndex + normalized + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT);
  }

  getSelectedHotbarSlot() {
    return getHotbarSlot(this.selectedHotbarIndex);
  }

  getSelectedHotbarAction() {
    return this.getSelectedHotbarSlot()?.action || null;
  }

  update() {
    const next = this.createActionState();
    const keyActionNames = new Set();
    const gamepadState = this.readGamepad();

    this.keys.forEach((key) => {
      const mapped = KEY_BINDINGS[key];
      if (mapped) keyActionNames.add(mapped);
    });

    keyActionNames.forEach((actionName) => {
      next[actionName] = true;
    });

    gamepadState.actions.forEach((actionName) => {
      next[actionName] = true;
    });

    this.virtualButtons.forEach((held, actionName) => {
      if (held) next[actionName] = true;
    });

    this.pointers.forEach((pointer) => {
      if (pointer.down && pointer.source === 'canvas' && pointer.type === 'mouse') {
        if ((pointer.buttons & 1) === 1 || pointer.button === 0) next.primaryUse = true;
      }
    });

    if (next.primaryUse) {
      const selectedAction = this.getSelectedHotbarAction();
      if (selectedAction) next[selectedAction] = true;
    }

    const keyboardX = Number(keyActionNames.has('right')) - Number(keyActionNames.has('left'));
    const keyboardY = Number(keyActionNames.has('down')) - Number(keyActionNames.has('up'));
    const padX = Math.abs(gamepadState.move.x) > 0.01 ? gamepadState.move.x : 0;
    const padY = Math.abs(gamepadState.move.y) > 0.01 ? gamepadState.move.y : 0;
    const virtualAimMagnitude = Math.hypot(this.virtualAim.x, this.virtualAim.y);
    const gamepadAimMagnitude = Math.hypot(gamepadState.aim.x, gamepadState.aim.y);
    const aimSource = virtualAimMagnitude > 0.01
      ? this.virtualAim
      : (gamepadAimMagnitude > 0.01 ? gamepadState.aim : { x: 0, y: 0 });
    this.gamepadMove = gamepadState.move;
    this.gamepadAim = gamepadState.aim;
    this.moveVector = this.normalizeVector({
      x: keyboardX || this.virtualMove.x || padX,
      y: keyboardY || this.virtualMove.y || padY,
    });
    this.aimVector = this.normalizeVector(aimSource);

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

    if (next.justPressed.hotbarNext) this.cycleHotbar(1);
    if (next.justPressed.hotbarPrevious) this.cycleHotbar(-1);

    this.previousActions = this.actions;
    this.actions = next;
  }

  readGamepad() {
    const actions = new Set();
    const gamepad = this.getActiveGamepad();
    if (!gamepad) {
      this.gamepadConnected = false;
      return { actions, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } };
    }

    this.gamepadConnected = true;
    this.gamepadIndex = gamepad.index;
    this.gamepadLabel = gamepad.id || 'Controller';

    const buttonHeld = (index, threshold = GAMEPAD_TRIGGER_THRESHOLD) => {
      const button = gamepad.buttons?.[index];
      if (!button) return false;
      return Boolean(button.pressed || button.value > threshold);
    };

    if (buttonHeld(GAMEPAD_BUTTONS.confirm)) {
      actions.add('confirm');
      actions.add('jump');
    }
    if (buttonHeld(GAMEPAD_BUTTONS.cancel)) actions.add('cancel');
    if (buttonHeld(GAMEPAD_BUTTONS.mineFace) || buttonHeld(GAMEPAD_BUTTONS.mineTrigger)) actions.add('primaryUse');
    if (buttonHeld(GAMEPAD_BUTTONS.stabilize)) actions.add('stabilize');
    if (buttonHeld(GAMEPAD_BUTTONS.tool)) actions.add('hotbarPrevious');
    if (buttonHeld(GAMEPAD_BUTTONS.attackShoulder) || buttonHeld(GAMEPAD_BUTTONS.attackTrigger)) actions.add('hotbarNext');
    if (buttonHeld(GAMEPAD_BUTTONS.select)) actions.add('interact');
    if (buttonHeld(GAMEPAD_BUTTONS.pause)) actions.add('pause');

    const leftStick = this.readGamepadStick(gamepad, 0, 1);
    const rightStick = this.readGamepadStick(gamepad, 2, 3);
    const dpad = {
      x: Number(buttonHeld(GAMEPAD_BUTTONS.dpadRight, 0.1)) - Number(buttonHeld(GAMEPAD_BUTTONS.dpadLeft, 0.1)),
      y: Number(buttonHeld(GAMEPAD_BUTTONS.dpadDown, 0.1)) - Number(buttonHeld(GAMEPAD_BUTTONS.dpadUp, 0.1)),
    };
    const move = Math.hypot(leftStick.x, leftStick.y) > 0.01 ? leftStick : dpad;
    if (move.y < -0.05) actions.add('up');
    if (move.y > 0.05) actions.add('down');
    if (move.x < -0.05) actions.add('left');
    if (move.x > 0.05) actions.add('right');

    const hasActivity = actions.size > 0
      || Math.hypot(move.x, move.y) > 0.06
      || Math.hypot(rightStick.x, rightStick.y) > 0.06;
    if (hasActivity) {
      this.controllerActivityFrames = 60;
      this.setInputMode('controller');
    } else {
      this.controllerActivityFrames = Math.max(0, this.controllerActivityFrames - 1);
    }

    return { actions, move, aim: rightStick };
  }

  getActiveGamepad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;
    const current = this.gamepadIndex !== null ? pads[this.gamepadIndex] : null;
    if (current?.connected) return current;
    const fallback = this.findConnectedGamepad(pads);
    if (fallback) this.gamepadIndex = fallback.index;
    return fallback;
  }

  findConnectedGamepad(pads = null) {
    const gamepads = pads || (typeof navigator !== 'undefined' && navigator.getGamepads?.());
    if (!gamepads) return null;
    for (let index = 0; index < gamepads.length; index += 1) {
      if (gamepads[index]?.connected) return gamepads[index];
    }
    return null;
  }

  readGamepadStick(gamepad, axisX, axisY) {
    return {
      x: this.applyDeadzone(gamepad.axes?.[axisX] || 0),
      y: this.applyDeadzone(gamepad.axes?.[axisY] || 0),
    };
  }

  applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
    const magnitude = Math.abs(value);
    if (magnitude <= deadzone) return 0;
    return Math.sign(value) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  }

  isControllerActive() {
    return this.controllerActivityFrames > 0 && this.gamepadConnected;
  }

  getControllerLabel() {
    return this.gamepadLabel || 'Controller';
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

  endFrame() {
    this.pointerDownEvents = [];
    this.pointerMoveEvents = [];
    this.pointerUpEvents = [];
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
    this.gamepadMove = { x: 0, y: 0 };
    this.gamepadAim = { x: 0, y: 0 };
    this.controllerActivityFrames = 0;
    this.mousePointer = { ...this.mousePointer, down: false, button: -1, buttons: 0 };
    this.actions = this.createActionState();
    this.previousActions = this.createActionState();
  }
}
