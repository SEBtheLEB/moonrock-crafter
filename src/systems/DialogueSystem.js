import { dialogue } from '../data/dialogue.js?v=116';

export class DialogueSystem {
  constructor(game) {
    this.game = game;
    this.dialogue = dialogue;
    this.active = null;
    this.queue = [];
    this.nextEntryId = 1;
  }

  createEntry({ speaker = '', portraitStyle = null, lines = [], choices = [], speed = 48, onStart = null, onComplete = null, meta = {}, mood = '' } = {}) {
    return {
      id: this.nextEntryId++,
      speaker,
      portraitStyle,
      lines: Array.isArray(lines) ? lines : [lines],
      choices,
      speed,
      lineIndex: 0,
      charIndex: 0,
      displayedText: '',
      complete: false,
      done: false,
      lastBlipIndex: 0,
      onStart,
      onComplete,
      meta,
      mood,
    };
  }

  start(options = {}, { enqueue = false } = {}) {
    const entry = this.createEntry(options);
    if (enqueue && this.active && !this.active.done) {
      this.queue.push(entry);
      return entry;
    }
    this.active = entry;
    this.startActive();
    return this.active;
  }

  queueDialogue(entries = []) {
    const normalized = entries.map((entry) => this.createEntry(entry));
    if (!this.active || this.active.done) {
      this.active = normalized.shift() || null;
      if (this.active) this.startActive();
    }
    this.queue.push(...normalized);
    return this.active;
  }

  startSet(setId, key, { speaker = '', portraitStyle = null, fallback = '', enqueue = false, onStart = null, onComplete = null, meta = {}, mood = '' } = {}) {
    const lines = this.getLines(setId, key);
    return this.start({
      speaker,
      portraitStyle,
      lines: lines.length ? lines : [fallback],
      onStart,
      onComplete,
      meta: { ...meta, setId, key },
      mood,
    }, { enqueue });
  }

  getLines(setId, key) {
    const value = this.dialogue[setId]?.[key] || this.dialogue.generic?.[key] || [];
    return Array.isArray(value) ? value : [value];
  }

  getLine(key) {
    return this.dialogue.generic?.[key]?.[0] || '';
  }

  startActive() {
    if (!this.active) return;
    this.active.onStart?.(this.active);
    this.game.events.emit('dialogue:started', this.active);
  }

  update(delta) {
    if (!this.active || this.active.done) return;
    const line = this.active.lines[this.active.lineIndex] || '';
    if (this.active.complete) return;
    this.active.charIndex = Math.min(line.length, this.active.charIndex + this.active.speed * delta);
    this.active.displayedText = line.slice(0, Math.floor(this.active.charIndex));
    if (
      this.active.displayedText.length >= this.active.lastBlipIndex + 3
      && /\S/.test(this.active.displayedText.at(-1) || '')
    ) {
      this.active.lastBlipIndex = this.active.displayedText.length;
      this.game.audio.playDialogueBlip();
    }
    if (this.active.displayedText.length >= line.length) {
      this.active.complete = true;
    }
    this.game.events.emit('dialogue:updated', this.active);
  }

  continue() {
    if (!this.active) return null;
    if (!this.active.complete) {
      this.skip();
      return this.active;
    }
    if (this.active.lineIndex < this.active.lines.length - 1) {
      this.active.lineIndex += 1;
      this.active.charIndex = 0;
      this.active.displayedText = '';
      this.active.complete = false;
      this.active.lastBlipIndex = 0;
      return this.active;
    }
    return this.finishActive();
  }

  choose(choice) {
    if (!this.active?.complete || !choice) return;
    choice.onSelect?.();
    if (choice.next) {
      this.finishActive({ suppressQueue: true });
      return this.start(choice.next);
    }
    return this.continue();
  }

  finishActive({ suppressQueue = false } = {}) {
    if (!this.active) return null;
    const completed = this.active;
    completed.done = true;
    completed.onComplete?.(completed);
    this.game.events.emit('dialogue:ended', completed);
    if (!suppressQueue && this.queue.length) {
      this.active = this.queue.shift();
      this.startActive();
      return this.active;
    }
    this.active = null;
    return null;
  }

  skip() {
    if (!this.active) return;
    const line = this.active.lines[this.active.lineIndex] || '';
    this.active.displayedText = line;
    this.active.charIndex = line.length;
    this.active.complete = true;
  }

  clear() {
    this.active = null;
    this.queue = [];
  }
}
