import { drawGameArtSprite, isGameArtReady } from '../data/gameArt.js?v=158';

const STATION_WIDTH = 112;
const STATION_HEIGHT = 70;
const STATION_TOUCH_RADIUS = 82;

export class PlacedResearchStation {
  constructor({
    id = null,
    x = 0,
    y = 0,
    rotation = 0,
    compact = true,
    color = '#b794ff',
    accent = '#76f3ff',
  } = {}) {
    this.id = id || `research-station-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999).toString(36)}`;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.compact = compact;
    this.color = color;
    this.accent = accent;
    this.pulse = 0;
  }

  static deserialize(data = {}) {
    return new PlacedResearchStation(data);
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
    const scale = this.compact ? 0.72 : 1;
    const dx = player.centerX - this.x;
    const dy = player.centerY - (this.y - STATION_HEIGHT * 0.42 * scale);
    const radius = this.compact ? STATION_TOUCH_RADIUS * 1.1 : STATION_TOUCH_RADIUS * scale;
    return dx * dx + dy * dy < radius * radius;
  }

  draw(ctx, { time = 0, ghost = false } = {}) {
    PlacedResearchStation.drawShape(ctx, {
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

  static drawGhost(ctx, {
    x,
    y,
    viewRotation = 0,
    rotation = -viewRotation,
    compact = true,
    time = 0,
    color = '#b794ff',
    accent = '#76f3ff',
  } = {}) {
    PlacedResearchStation.drawShape(ctx, { x, y, rotation, compact, time, ghost: true, color, accent });
  }

  static drawShape(ctx, {
    x,
    y,
    rotation = 0,
    compact = true,
    time = 0,
    ghost = false,
    color = '#b794ff',
    accent = '#76f3ff',
  } = {}) {
    const scale = compact ? 0.72 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.globalAlpha *= ghost ? 0.56 : 1;

    ctx.fillStyle = ghost ? 'rgba(183, 148, 255, 0.16)' : 'rgba(3, 9, 16, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 6, STATION_WIDTH * 0.54, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isGameArtReady()) {
      drawGameArtSprite(ctx, 'researchStation', 0, -STATION_HEIGHT * 0.43, STATION_WIDTH * 1.02, STATION_HEIGHT * 1.06, {
        alpha: ghost ? 0.72 : 1,
      });
      if (!ghost) {
        const pulse = 0.42 + Math.sin(time * 3.1) * 0.1;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(0, -STATION_HEIGHT * 0.63, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    ctx.fillStyle = ghost ? 'rgba(183, 148, 255, 0.18)' : '#22303c';
    ctx.strokeStyle = ghost ? 'rgba(183, 148, 255, 0.7)' : 'rgba(5, 12, 19, 0.82)';
    ctx.lineWidth = ghost ? 2 : 2.2;
    ctx.beginPath();
    ctx.roundRect(-STATION_WIDTH / 2, -STATION_HEIGHT, STATION_WIDTH, 54, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111a23';
    ctx.beginPath();
    ctx.roundRect(-42, -62, 84, 30, 7);
    ctx.fill();
    ctx.stroke();

    const pulse = 0.55 + Math.sin(time * 3.1) * 0.14;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + pulse * 9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha *= 0.82;
    ctx.beginPath();
    ctx.moveTo(-30, -47);
    ctx.lineTo(-10, -55);
    ctx.lineTo(10, -42);
    ctx.lineTo(31, -51);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -47, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = ghost ? 'rgba(118, 243, 255, 0.4)' : accent;
    ctx.beginPath();
    ctx.moveTo(-42, -22);
    ctx.lineTo(42, -22);
    ctx.lineTo(34, 0);
    ctx.lineTo(-34, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
