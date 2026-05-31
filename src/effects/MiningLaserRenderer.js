export class MiningLaserRenderer {
  drawBeam(ctx, { camera, ship, target, aimPoint, time }) {
    if (!target && !aimPoint) return;
    const endWorld = target || aimPoint;
    const hasTarget = Boolean(target);
    const start = camera.worldToScreen(ship.x, ship.y);
    const end = camera.worldToScreen(endWorld.x, endWorld.y);
    ctx.save();
    ctx.globalAlpha = hasTarget ? 1 : 0.62;
    ctx.strokeStyle = hasTarget ? 'rgba(255, 211, 107, 0.95)' : 'rgba(118, 243, 255, 0.62)';
    ctx.lineWidth = hasTarget ? 5 : 3;
    ctx.shadowColor = hasTarget ? '#ff8f3d' : '#76f3ff';
    ctx.shadowBlur = hasTarget ? 18 : 10;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.globalAlpha = hasTarget ? 0.9 : 0.46;
    ctx.strokeStyle = hasTarget ? 'rgba(118, 243, 255, 0.9)' : 'rgba(255, 242, 207, 0.72)';
    ctx.lineWidth = hasTarget ? 2 : 1.4;
    ctx.stroke();
    if (hasTarget) {
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = '#fff2cf';
      ctx.shadowColor = target.data?.accent || '#ffd36b';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 4.5 + Math.sin(time * 36) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
