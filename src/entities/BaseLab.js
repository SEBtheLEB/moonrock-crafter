const LAB_DEFAULT_WIDTH = 390;
const LAB_DEFAULT_HEIGHT = 178;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export class BaseLab {
  constructor({
    id = 'starter-base-lab',
    x = 0,
    y = 0,
    width = LAB_DEFAULT_WIDTH,
    height = LAB_DEFAULT_HEIGHT,
    rotation = 0,
    doorSide = 'left',
  } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.rotation = rotation;
    this.doorSide = doorSide;
    this.doorOpen = 0;
    this.doorTarget = 0;
  }

  static deserialize(data = {}) {
    return new BaseLab(data);
  }

  serialize() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      width: Math.round(this.width),
      height: Math.round(this.height),
      rotation: Math.round(this.rotation * 10000) / 10000,
      doorSide: this.doorSide,
    };
  }

  get left() {
    return this.x - this.width * 0.5;
  }

  get right() {
    return this.x + this.width * 0.5;
  }

  get top() {
    return this.y - this.height;
  }

  get bottom() {
    return this.y;
  }

  getCraftingStationPoint() {
    return {
      x: this.x - this.width * 0.22,
      y: this.y - 8,
      rotation: this.rotation,
    };
  }

  getResearchStationPoint() {
    return {
      x: this.x + this.width * 0.22,
      y: this.y - 8,
      rotation: this.rotation,
    };
  }

  getSpawnPoint(playerSize = { width: 30, height: 60 }) {
    return {
      x: this.x - playerSize.width * 0.5,
      y: this.y - playerSize.height - 12,
    };
  }

  containsPoint(x, y, padding = 0) {
    return x >= this.left - padding
      && x <= this.right + padding
      && y >= this.top - padding
      && y <= this.bottom + padding;
  }

  containsPlayer(player, padding = 18) {
    if (!player) return false;
    return this.containsPoint(player.centerX, player.centerY, padding);
  }

  update(delta, player = null) {
    this.doorTarget = this.containsPlayer(player, 34) ? 1 : 0;
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, delta * 9);
  }

  draw(ctx, { time = 0 } = {}) {
    const w = this.width;
    const h = this.height;
    const block = 22;
    const doorW = 58;
    const doorH = 92;
    const doorX = this.doorSide === 'right' ? w * 0.5 - doorW - 18 : -w * 0.5 + 18;
    const doorSlide = this.doorOpen * (doorW + 6);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.fillStyle = 'rgba(2, 7, 12, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 13, w * 0.58, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1d2a33';
    ctx.strokeStyle = 'rgba(3, 9, 15, 0.82)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w * 0.5, -h, w, h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#263846';
    ctx.beginPath();
    ctx.moveTo(-w * 0.5 - 8, -h + 22);
    ctx.lineTo(-w * 0.42, -h - 18);
    ctx.lineTo(w * 0.42, -h - 18);
    ctx.lineTo(w * 0.5 + 8, -h + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.52;
    for (let x = -w * 0.5 + 12; x < w * 0.5 - 8; x += block) {
      for (let y = -h + 18; y < -12; y += block) {
        const shade = ((Math.floor((x + 999) / block) + Math.floor((y + 999) / block)) % 2) * 10;
        ctx.fillStyle = `rgb(${43 + shade}, ${57 + shade}, ${68 + shade})`;
        ctx.fillRect(x, y, block - 3, block - 3);
      }
    }
    ctx.restore();

    ctx.fillStyle = '#101b24';
    ctx.strokeStyle = 'rgba(2, 8, 14, 0.74)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w * 0.33, -h + 42, 86, 54, 8);
    ctx.fill();
    ctx.stroke();

    const glow = 0.55 + Math.sin(time * 2.4) * 0.12;
    ctx.fillStyle = `rgba(112, 225, 255, ${0.28 + glow * 0.12})`;
    ctx.beginPath();
    ctx.roundRect(-w * 0.33 + 8, -h + 50, 70, 38, 6);
    ctx.fill();

    ctx.fillStyle = '#c28d58';
    ctx.strokeStyle = 'rgba(3, 9, 15, 0.84)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(doorX, -doorH, doorW, doorH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#293a46';
    ctx.beginPath();
    ctx.roundRect(doorX + (this.doorSide === 'right' ? doorSlide : -doorSlide), -doorH + 7, doorW - 10, doorH - 14, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#75e9ff';
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.arc(doorX + doorW * 0.5, -doorH * 0.55, 5 + Math.sin(time * 5) * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    this.drawConsoleHint(ctx, this.getCraftingStationPoint(), '#76f3ff', '#ffd36b');
    this.drawConsoleHint(ctx, this.getResearchStationPoint(), '#b794ff', '#76f3ff');

    ctx.restore();
  }

  drawConsoleHint(ctx, point, color, accent) {
    ctx.save();
    ctx.translate(point.x - this.x, point.y - this.y);
    ctx.scale(0.54, 0.54);
    ctx.fillStyle = '#16232d';
    ctx.strokeStyle = 'rgba(2, 7, 13, 0.78)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-48, -64, 96, 56, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.roundRect(-34, -52, 68, 22, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
