const FLAG_HEIGHT = 78;
const FLAG_POLE_WIDTH = 5;
const FLAG_TOUCH_RADIUS = 42;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class PlacedFlag {
  constructor({ id = null, x = 0, y = 0, rotation = 0, color = '#ffd36b', accent = '#66d8e8' } = {}) {
    this.id = id || `flag-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.color = color;
    this.accent = accent;
    this.wiggle = 0;
    this.wiggleVelocity = 0;
    this.bumpCooldown = 0;
  }

  static deserialize(data = {}) {
    return new PlacedFlag(data);
  }

  serialize() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      rotation: Math.round(this.rotation * 10000) / 10000,
      color: this.color,
      accent: this.accent,
    };
  }

  update(delta) {
    const dt = Math.min(delta, 0.05);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    const spring = -this.wiggle * 38;
    const damping = -this.wiggleVelocity * 9.5;
    this.wiggleVelocity += (spring + damping) * dt;
    this.wiggle += this.wiggleVelocity * dt;
    this.wiggle = clamp(this.wiggle, -0.32, 0.32);
  }

  overlapsPlayer(player) {
    if (!player) return false;
    const dx = player.centerX - this.x;
    const dy = player.centerY - (this.y - FLAG_HEIGHT * 0.42);
    return (dx * dx) / (FLAG_TOUCH_RADIUS * FLAG_TOUCH_RADIUS)
      + (dy * dy) / ((FLAG_HEIGHT * 0.55) * (FLAG_HEIGHT * 0.55)) <= 1;
  }

  bumpFromPlayer(player) {
    if (!this.overlapsPlayer(player) || this.bumpCooldown > 0) return false;
    const direction = player.centerX < this.x ? 1 : -1;
    this.wiggleVelocity += direction * (7 + Math.min(6, Math.abs(player.vx || 0) * 0.012));
    this.bumpCooldown = 0.14;
    if (Math.abs(player.vx || 0) > 30) player.vx *= 0.86;
    return true;
  }

  draw(ctx, { time = 0, ghost = false } = {}) {
    PlacedFlag.drawShape(ctx, {
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      time,
      wiggle: this.wiggle,
      color: this.color,
      accent: this.accent,
      ghost,
    });
  }

  static drawGhost(ctx, { x, y, viewRotation = 0, rotation = -viewRotation, time = 0, color = '#ffd36b', accent = '#66d8e8' } = {}) {
    PlacedFlag.drawShape(ctx, {
      x,
      y,
      rotation,
      time,
      wiggle: Math.sin(time * 8) * 0.035,
      color,
      accent,
      ghost: true,
    });
  }

  static drawShape(ctx, {
    x,
    y,
    rotation = 0,
    time = 0,
    wiggle = 0,
    color = '#ffd36b',
    accent = '#66d8e8',
    ghost = false,
  } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha *= ghost ? 0.58 : 1;

    ctx.fillStyle = ghost ? 'rgba(102, 216, 232, 0.16)' : 'rgba(3, 9, 16, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(wiggle);
    ctx.strokeStyle = ghost ? 'rgba(255, 242, 207, 0.58)' : 'rgba(7, 15, 24, 0.8)';
    ctx.lineWidth = ghost ? 2 : 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -FLAG_HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = ghost ? 'rgba(255, 211, 107, 0.8)' : '#fff2cf';
    ctx.lineWidth = FLAG_POLE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -FLAG_HEIGHT);
    ctx.stroke();

    const wave = Math.sin(time * 5 + wiggle * 10) * 2;
    const flagTop = -FLAG_HEIGHT + 8;
    ctx.fillStyle = color;
    ctx.strokeStyle = ghost ? 'rgba(255, 242, 207, 0.7)' : 'rgba(7, 15, 24, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(2, flagTop);
    ctx.bezierCurveTo(18, flagTop - 6 + wave, 34, flagTop + 3 - wave, 48, flagTop - 4);
    ctx.lineTo(43, flagTop + 26);
    ctx.bezierCurveTo(29, flagTop + 31 + wave, 16, flagTop + 18 - wave, 2, flagTop + 23);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.globalAlpha *= ghost ? 0.65 : 0.9;
    ctx.beginPath();
    ctx.arc(18 + Math.sin(time * 4) * 1.5, flagTop + 12, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
