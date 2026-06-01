import {
  DEFAULT_HOTBAR_SLOT_IDS,
  EMPTY_HOTBAR_SLOT,
  HOTBAR_SLOT_COUNT,
  getHotbarSlotById,
} from '../data/hotbar.js?v=116';

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
  r: 'buildModeToggle',
  R: 'buildModeToggle',
  i: 'inventory',
  I: 'inventory',
  b: 'dropHeldAll',
  B: 'dropHeldAll',
  y: 'dropHeldOne',
  Y: 'dropHeldOne',
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
  jumpFace: 0,
  cancel: 1,
  interactFace: 2,
  stabilize: 3,
  hotbarPrevious: 4,
  hotbarNext: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  select: 8,
  pause: 9,
  rightStickClick: 11,
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
    this.cursorHost = null;
    this.gameShellRect = null;
    this.canvasRect = null;
    this.cursorSpeedBucket = -1;
    this.cursorElement = this.createCustomCursor();
    this.cursorX = -100;
    this.cursorY = -100;
    this.cursorVisible = false;
    this.cursorPressed = false;
    this.selectedHotbarIndex = 0;
    this.hotbarSlotIds = [...DEFAULT_HOTBAR_SLOT_IDS];
    this.hotbarOwnershipResolver = null;
    this.hotbarChangeHandler = null;
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
    this.onFullscreenChange = this.onFullscreenChange.bind(this);
    this.invalidatePointerBounds = this.invalidatePointerBounds.bind(this);

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
    window.addEventListener('resize', this.invalidatePointerBounds, { passive: true });
    window.addEventListener('scroll', this.invalidatePointerBounds, { passive: true });
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
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
      boost: false,
      tool: false,
      primaryUse: false,
      aimUse: false,
      stabilize: false,
      mine: false,
      attack: false,
      placeFlag: false,
      placeTorch: false,
      placeFurnace: false,
      placeCraftingStation: false,
      placeResearchStation: false,
      build: false,
      buildModeToggle: false,
      buildWallModifier: false,
      buildSnapToggle: false,
      dropHeldAll: false,
      dropHeldOne: false,
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

  invalidatePointerBounds() {
    this.gameShellRect = null;
    this.canvasRect = null;
    this.cursorHost = null;
  }

  capturePointer(event) {
    if (event.target.closest?.('#game-shell')) event.preventDefault();
  }

  createCustomCursor() {
    if (typeof document === 'undefined' || !document.body) return null;
    const existing = document.querySelector('.game-custom-cursor');
    if (existing) {
      this.ensureCursorParent(existing);
      return existing;
    }
    const element = document.createElement('div');
    element.className = 'game-custom-cursor';
    element.setAttribute('aria-hidden', 'true');
    this.ensureCursorParent(element);
    return element;
  }

  getGameShell() {
    return this.canvas?.closest?.('#game-shell') || document.querySelector('#game-shell');
  }

  getCursorHost() {
    const shell = this.getGameShell();
    const fullscreenElement = document.fullscreenElement;
    if (fullscreenElement && fullscreenElement !== this.canvas) return fullscreenElement;
    return shell || document.body;
  }

  ensureCursorParent(element = this.cursorElement) {
    if (!element || typeof document === 'undefined') return;
    const host = this.cursorHost || this.getCursorHost();
    this.cursorHost = host;
    if (host && element.parentElement !== host) host.append(element);
  }

  onFullscreenChange() {
    this.invalidatePointerBounds();
    this.ensureCursorParent();
  }

  isPointerInsideGameViewport(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
    if (event.clientX < 0 || event.clientY < 0 || event.clientX > window.innerWidth || event.clientY > window.innerHeight) return false;
    if (document.fullscreenElement) return true;
    const shell = this.getGameShell();
    if (!shell) return true;
    const rect = this.gameShellRect || shell.getBoundingClientRect();
    this.gameShellRect = rect;
    return event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom;
  }

  updateCustomCursor(event, pressed = false) {
    if (!this.cursorElement || event.pointerType === 'touch') {
      this.cursorElement?.classList.remove('is-visible', 'is-pressed');
      this.cursorVisible = false;
      this.cursorPressed = false;
      return;
    }
    if (!this.cursorElement.parentElement || this.cursorElement.parentElement !== this.cursorHost) this.ensureCursorParent();
    if (!this.isPointerInsideGameViewport(event)) {
      this.cursorElement.classList.remove('is-visible', 'is-pressed');
      this.cursorVisible = false;
      this.cursorPressed = false;
      return;
    }
    const previousX = this.cursorVisible ? this.cursorX : event.clientX;
    const previousY = this.cursorVisible ? this.cursorY : event.clientY;
    this.cursorX = event.clientX;
    this.cursorY = event.clientY;
    const dx = this.cursorX - previousX;
    const dy = this.cursorY - previousY;
    const speed = Math.min(1, Math.hypot(dx, dy) / 42);
    const scale = (pressed ? 0.9 : 1) + speed * 0.08;
    const speedBucket = Math.round(speed * 10);
    if (speedBucket !== this.cursorSpeedBucket) {
      this.cursorSpeedBucket = speedBucket;
      this.cursorElement.style.setProperty('--cursor-speed', `${(speedBucket / 10).toFixed(1)}`);
    }
    this.cursorElement.style.transform = `translate3d(${this.cursorX - 7}px, ${this.cursorY - 7}px, 0) scale(${scale.toFixed(3)})`;
    if (!this.cursorVisible) this.cursorElement.classList.add('is-visible');
    if (this.cursorPressed !== Boolean(pressed)) {
      this.cursorPressed = Boolean(pressed);
      this.cursorElement.classList.toggle('is-pressed', this.cursorPressed);
    }
    this.cursorVisible = true;
  }

  pointerFromEvent(event, down) {
    const canvasRect = this.canvasRect || this.canvas.getBoundingClientRect();
    this.canvasRect = canvasRect;
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
      inside: this.isPointerInsideGameViewport({ clientX: pointer.x, clientY: pointer.y }),
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

  bindJoystick(element, {
    mode = 'move',
    radius = 48,
    floating = false,
    activationRegion = 'element',
    holdAction = null,
  } = {}) {
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
      if (activationRegion === 'left' && event.clientX > window.innerWidth * 0.48) return false;
      if (activationRegion === 'right' && event.clientX < window.innerWidth * 0.52) return false;
      return true;
    };

    const positionFloatingJoystick = (event) => {
      if (!floating) return;
      const rect = element.getBoundingClientRect();
      const baseCenterX = rect.left + rect.width / 2;
      const baseCenterY = rect.top + rect.height / 2;
      const leftLimit = activationRegion === 'right'
        ? Math.min(window.innerWidth - 8, window.innerWidth * 0.56)
        : Math.max(8, window.innerWidth * 0.08);
      const rightLimit = activationRegion === 'right'
        ? Math.max(leftLimit, window.innerWidth - 8)
        : Math.max(leftLimit, window.innerWidth * 0.46 - rect.width * 0.5);
      const topLimit = 44;
      const bottomLimit = Math.max(topLimit, window.innerHeight - rect.height * 0.42);
      const centerX = Math.max(leftLimit, Math.min(rightLimit, event.clientX));
      const centerY = Math.max(topLimit, Math.min(bottomLimit, event.clientY));
      floatingCenter = { x: centerX, y: centerY };
      element.style.setProperty('--joystick-float-x', `${Math.round(centerX - baseCenterX)}px`);
      element.style.setProperty('--joystick-float-y', `${Math.round(centerY - baseCenterY)}px`);
    };

    const setHoldAction = (isHeld) => {
      if (!holdAction) return;
      this.virtualButtons.set(holdAction, Boolean(isHeld));
      element.classList.toggle('is-held', Boolean(isHeld));
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
      setHoldAction(true);
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
      setHoldAction(false);
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
        setHoldAction(false);
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

  configureHotbar({ slotIds = DEFAULT_HOTBAR_SLOT_IDS, isSlotOwned = null, onChange = null } = {}) {
    this.hotbarSlotIds = this.normalizeHotbarSlotIds(slotIds);
    this.hotbarOwnershipResolver = typeof isSlotOwned === 'function' ? isSlotOwned : null;
    this.hotbarChangeHandler = typeof onChange === 'function' ? onChange : null;
    this.syncHotbarWithInventory({ notify: false });
    this.selectHotbarSlot(this.selectedHotbarIndex);
  }

  normalizeHotbarSlotIds(slotIds = []) {
    const normalized = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => {
      const slotId = slotIds[index];
      const slot = getHotbarSlotById(slotId);
      return slot?.id && slot.id !== EMPTY_HOTBAR_SLOT.id ? slot.id : null;
    });
    return normalized;
  }

  isHotbarSlotOwned(slot) {
    if (!slot || slot.id === EMPTY_HOTBAR_SLOT.id) return false;
    if (!this.hotbarOwnershipResolver) return true;
    return Boolean(this.hotbarOwnershipResolver(slot));
  }

  getHotbarSlotAt(index, { ignoreOwnership = false } = {}) {
    const normalizedIndex = ((index % HOTBAR_SLOT_COUNT) + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT;
    const slot = getHotbarSlotById(this.hotbarSlotIds[normalizedIndex]);
    if (slot.id === EMPTY_HOTBAR_SLOT.id) return EMPTY_HOTBAR_SLOT;
    if (!ignoreOwnership && !this.isHotbarSlotOwned(slot)) return EMPTY_HOTBAR_SLOT;
    return slot;
  }

  assignHotbarSlot(index, slotId) {
    const nextIndex = Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, Number(index) || 0));
    const slot = getHotbarSlotById(slotId);
    if (!slot || slot.id === EMPTY_HOTBAR_SLOT.id || !this.isHotbarSlotOwned(slot)) return false;
    this.hotbarSlotIds[nextIndex] = slot.id;
    this.selectHotbarSlot(nextIndex);
    this.hotbarChangeHandler?.([...this.hotbarSlotIds]);
    return true;
  }

  clearHotbarSlot(index, { notify = true } = {}) {
    const nextIndex = Math.max(0, Math.min(HOTBAR_SLOT_COUNT - 1, Number(index) || 0));
    if (!this.hotbarSlotIds[nextIndex]) return false;
    this.hotbarSlotIds[nextIndex] = null;
    this.selectHotbarSlot(this.selectedHotbarIndex);
    if (notify) this.hotbarChangeHandler?.([...this.hotbarSlotIds]);
    return true;
  }

  syncHotbarWithInventory({ notify = true } = {}) {
    let changed = false;
    this.hotbarSlotIds = this.normalizeHotbarSlotIds(this.hotbarSlotIds).map((slotId) => {
      const slot = getHotbarSlotById(slotId);
      if (slot.id !== EMPTY_HOTBAR_SLOT.id && !this.isHotbarSlotOwned(slot)) {
        changed = true;
        return null;
      }
      return slotId;
    });
    if (changed && notify) this.hotbarChangeHandler?.([...this.hotbarSlotIds]);
    document.documentElement.dataset.selectedTool = this.getSelectedHotbarSlot()?.id || '';
    return changed;
  }

  getSelectedHotbarSlot() {
    return this.getHotbarSlotAt(this.selectedHotbarIndex);
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
    if (next.jump) next.boost = true;

    this.pointers.forEach((pointer) => {
      if (pointer.down && pointer.source === 'canvas' && pointer.type === 'mouse') {
        if ((pointer.buttons & 1) === 1 || pointer.button === 0) next.primaryUse = true;
      }
    });

    if (next.primaryUse || next.aimUse) {
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

    if (buttonHeld(GAMEPAD_BUTTONS.jumpFace)) {
      actions.add('jump');
      actions.add('boost');
    }
    if (buttonHeld(GAMEPAD_BUTTONS.interactFace)) {
      actions.add('confirm');
      actions.add('interact');
    }
    if (buttonHeld(GAMEPAD_BUTTONS.cancel)) {
      actions.add('cancel');
      actions.add('dropHeldAll');
    }
    if (buttonHeld(GAMEPAD_BUTTONS.rightTrigger)) actions.add('primaryUse');
    if (buttonHeld(GAMEPAD_BUTTONS.leftTrigger)) actions.add('buildWallModifier');
    if (buttonHeld(GAMEPAD_BUTTONS.stabilize)) {
      actions.add('stabilize');
      actions.add('dropHeldOne');
    }
    if (buttonHeld(GAMEPAD_BUTTONS.hotbarPrevious)) actions.add('hotbarPrevious');
    if (buttonHeld(GAMEPAD_BUTTONS.hotbarNext)) actions.add('hotbarNext');
    if (buttonHeld(GAMEPAD_BUTTONS.rightStickClick, 0.1)) actions.add('buildSnapToggle');
    if (buttonHeld(GAMEPAD_BUTTONS.select)) actions.add('inventory');
    if (buttonHeld(GAMEPAD_BUTTONS.pause)) actions.add('pause');

    const leftStick = this.readGamepadStick(gamepad, 0, 1);
    const rightStick = this.readGamepadStick(gamepad, 2, 3);
    const dpad = {
      x: Number(buttonHeld(GAMEPAD_BUTTONS.dpadRight, 0.1)) - Number(buttonHeld(GAMEPAD_BUTTONS.dpadLeft, 0.1)),
      y: Number(buttonHeld(GAMEPAD_BUTTONS.dpadDown, 0.1)) - Number(buttonHeld(GAMEPAD_BUTTONS.dpadUp, 0.1)),
    };
    const move = Math.hypot(leftStick.x, leftStick.y) > 0.01 ? leftStick : dpad;
    const aim = rightStick;
    if (move.y < -0.05) actions.add('up');
    if (move.y > 0.05) actions.add('down');
    if (move.x < -0.05) actions.add('left');
    if (move.x > 0.05) actions.add('right');

    const hasActivity = actions.size > 0
      || Math.hypot(move.x, move.y) > 0.06
      || Math.hypot(aim.x, aim.y) > 0.06;
    if (hasActivity) {
      this.controllerActivityFrames = 60;
      this.setInputMode('controller');
    } else {
      this.controllerActivityFrames = Math.max(0, this.controllerActivityFrames - 1);
    }

    return { actions, move, aim };
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
