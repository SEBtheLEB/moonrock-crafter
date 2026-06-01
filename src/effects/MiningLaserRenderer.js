import { ElectricLaserRenderer } from './ElectricLaserRenderer.js?v=121';

export class MiningLaserRenderer {
  constructor() {
    this.electric = new ElectricLaserRenderer();
  }

  drawRangeField(ctx, { camera, ship, radius, aimPoint, active, time }) {
    this.electric.drawRangeField(ctx, {
      worldToScreen: (x, y) => camera.worldToScreen(x, y),
      origin: ship,
      radius,
      aimPoint,
      active,
      time,
    });
  }

  drawBeam(ctx, { camera, ship, target, aimPoint, time }) {
    if (!target && !aimPoint) return;
    const endWorld = target || aimPoint;
    const hasTarget = Boolean(target);
    this.electric.drawBeam(ctx, {
      worldToScreen: (x, y) => camera.worldToScreen(x, y),
      start: ship,
      end: endWorld,
      hit: hasTarget ? target : null,
      time,
      outerColor: hasTarget ? 'rgba(255, 211, 107, 0.92)' : 'rgba(118, 243, 255, 0.6)',
      innerColor: hasTarget ? 'rgba(118, 243, 255, 0.88)' : 'rgba(255, 255, 255, 0.72)',
      hitColor: target?.data?.accent || '#ffd36b',
      alpha: hasTarget ? 1 : 0.68,
    });
  }

  drawAimReticle(ctx, { camera, mouseAimWorld, mouseAimTarget, snapRadius, time, inputMode }) {
    if (!mouseAimWorld || inputMode === 'touch') return;
    const screen = camera.worldToScreen(mouseAimWorld.x, mouseAimWorld.y);
    const locked = Boolean(mouseAimTarget);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.globalAlpha = locked ? 0.9 : 0.55;
    ctx.strokeStyle = locked ? 'rgba(255, 211, 107, 0.95)' : 'rgba(118, 243, 255, 0.72)';
    ctx.lineWidth = locked ? 2 : 1.25;
    ctx.setLineDash(locked ? [] : [4, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, snapRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.stroke();
    if (locked) {
      const target = camera.worldToScreen(mouseAimTarget.x, mouseAimTarget.y);
      const targetRadius = Math.min(34, mouseAimTarget.radius * 0.68) * (1 + Math.sin(time * 16) * 0.08);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = mouseAimTarget.data?.accent || 'rgba(255, 211, 107, 0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(target.x - screen.x, target.y - screen.y, targetRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
