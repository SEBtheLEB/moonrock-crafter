import { drawGameArtSprite, isGameArtReady } from '../data/gameArt.js?v=158';

const STATION_WIDTH = 132;
const STATION_HEIGHT = 78;
const STATION_TOUCH_RADIUS = 100;

export class PlacedCraftingStation {
  constructor({
    id = null,
    x = 0,
    y = 0,
    rotation = 0,
    compact = false,
    color = '#76f3ff',
    accent = '#ffd36b',
  } = {}) {
    this.id = id || `crafting-station-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.compact = compact;
    this.color = color;
    this.accent = accent;
    this.pulse = 0;
  }

  static deserialize(data = {}) {
    return new PlacedCraftingStation(data);
  }

  serialize() {
    return {
      id: this.id,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      rotation: Math.round(this.rotation * 10000) / 10000,
      compact: this.compact,
      color: this.color,
      accent: this.accent,
    };
  }

  update(delta) {
    this.pulse += delta;
  }

  overlapsPlayer(player) {
    if (!player) return false;
    const scale = this.compact ? 0.68 : 1;
    const dx = player.centerX - this.x;
    const dy = player.centerY - (this.y - STATION_HEIGHT * 0.45 * scale);
    const radius = this.compact ? STATION_TOUCH_RADIUS * 1.08 : STATION_TOUCH_RADIUS;
    return dx * dx + dy * dy < radius * radius;
  }

  draw(ctx, { time = 0, ghost = false } = {}) {
    PlacedCraftingStation.drawShape(ctx, {
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      compact: this.compact,
      time,
      ghost,
      color: this.color,
      accent: this.accent,
    });
  }

  static drawGhost(ctx, { x, y, viewRotation = 0, rotation = -viewRotation, compact = false, time = 0, color = '#76f3ff', accent = '#ffd36b' } = {}) {
    PlacedCraftingStation.drawShape(ctx, { x, y, rotation, compact, time, ghost: true, color, accent });
  }

  static drawShape(ctx, {
    x,
    y,
    rotation = 0,
    compact = false,
    time = 0,
    ghost = false,
    color = '#76f3ff',
    accent = '#ffd36b',
  } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    if (compact) ctx.scale(0.68, 0.68);
    ctx.globalAlpha *= ghost ? 0.56 : 1;

    ctx.fillStyle = ghost ? 'rgba(118, 243, 255, 0.14)' : 'rgba(3, 9, 16, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 7, STATION_WIDTH * 0.52, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isGameArtReady()) {
      drawGameArtSprite(ctx, 'craftingStation', 0, -STATION_HEIGHT * 0.42, STATION_WIDTH * 1.1, STATION_HEIGHT * 1.02, {
        alpha: ghost ? 0.7 : 1,
      });
      if (!ghost) {
        const glow = 0.42 + Math.sin(time * 4) * 0.08;
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-STATION_WIDTH * 0.36, -STATION_HEIGHT * 0.72, STATION_WIDTH * 0.72, STATION_HEIGHT * 0.34, 8);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    ctx.fillStyle = ghost ? 'rgba(118, 243, 255, 0.18)' : '#253847';
    ctx.strokeStyle = ghost ? 'rgba(118, 243, 255, 0.7)' : 'rgba(5, 12, 19, 0.82)';
    ctx.lineWidth = ghost ? 2 : 2.4;
    ctx.beginPath();
    ctx.roundRect(-STATION_WIDTH / 2, -STATION_HEIGHT, STATION_WIDTH, 54, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#17242d';
    ctx.beginPath();
    ctx.roundRect(-52, -69, 104, 34, 9);
    ctx.fill();
    ctx.stroke();

    const glow = 0.55 + Math.sin(time * 4) * 0.14;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14 + glow * 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha *= 0.8;
    for (let index = 0; index < 4; index += 1) {
      const ox = -36 + index * 24;
      ctx.beginPath();
      ctx.roundRect(ox, -61, 14, 14, 3);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = ghost ? 'rgba(255, 211, 107, 0.45)' : accent;
    ctx.beginPath();
    ctx.moveTo(-48, -23);
    ctx.lineTo(48, -23);
    ctx.lineTo(38, 0);
    ctx.lineTo(-38, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 242, 207, 0.62)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-42, -8);
    ctx.lineTo(-54, 16);
    ctx.moveTo(42, -8);
    ctx.lineTo(54, 16);
    ctx.stroke();

    ctx.restore();
  }
}
