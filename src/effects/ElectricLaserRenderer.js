const clamp01 = (value) => Math.max(0, Math.min(1, value));

export class ElectricLaserRenderer {
  drawRangeField(ctx, {
    worldToScreen,
    origin,
    radius,
    aimPoint = null,
    active = false,
    time = 0,
    color = '118, 243, 255',
  }) {
    if (!origin || !radius || !worldToScreen) return;
    let ratio = active ? 0.86 : 0;
    if (aimPoint) {
      ratio = clamp01(Math.hypot(aimPoint.x - origin.x, aimPoint.y - origin.y) / radius);
    }
    const proximity = clamp01((ratio - 0.68) / 0.32);
    const alpha = Math.max(active ? 0.18 : 0, proximity * 0.42);
    if (alpha <= 0.015) return;

    const center = worldToScreen(origin.x, origin.y);
    const pulse = Math.sin(time * 5.5) * 0.08 + 0.92;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `rgba(${color}, 0.95)`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([9, 12]);
    ctx.lineDashOffset = -time * 26;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = alpha * 0.78;
    ctx.lineWidth = 2.2;
    for (let index = 0; index < 4; index += 1) {
      const start = time * 0.9 + index * Math.PI * 0.5;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * pulse, start, start + Math.PI * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBeam(ctx, {
    worldToScreen,
    start,
    end,
    hit = null,
    time = 0,
    outerColor = 'rgba(101, 214, 255, 0.58)',
    innerColor = 'rgba(255, 255, 255, 0.9)',
    hitColor = '#ffd36b',
    alpha = 1,
  }) {
    if (!worldToScreen || !start || !end) return;
    const startScreen = worldToScreen(start.x, start.y);
    const endScreen = worldToScreen(end.x, end.y);
    const dx = endScreen.x - startScreen.x;
    const dy = endScreen.y - startScreen.y;
    const length = Math.hypot(dx, dy);
    if (length < 2) return;

    const normalX = -dy / length;
    const normalY = dx / length;
    const segmentCount = Math.max(2, Math.min(30, Math.ceil(length / 18)));
    const points = [];
    for (let index = 0; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const baseX = startScreen.x + dx * t;
      const baseY = startScreen.y + dy * t;
      const isEndpoint = index === 0 || index === segmentCount;
      const wobble = isEndpoint
        ? 0
        : Math.sin(time * 24 + index * 1.91) * 3.4 + Math.sin(time * 43 + index * 2.37) * 1.7;
      points.push({
        x: baseX + normalX * wobble,
        y: baseY + normalY * wobble,
      });
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = hit ? hitColor : '#65d6ff';
    ctx.shadowBlur = hit ? 16 : 10;
    this.strokePoints(ctx, points, outerColor, hit ? 5.2 : 3.6);

    ctx.shadowBlur = 0;
    this.strokePoints(ctx, points, innerColor, hit ? 1.7 : 1.2);

    ctx.globalAlpha = alpha * 0.72;
    ctx.strokeStyle = hit ? 'rgba(255, 211, 107, 0.85)' : 'rgba(118, 243, 255, 0.55)';
    ctx.lineWidth = 1;
    for (let index = 2; index < points.length - 2; index += 5) {
      const point = points[index];
      const branch = 7 + ((index * 13) % 9);
      const side = index % 2 === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + normalX * branch * side, point.y + normalY * branch * side);
      ctx.stroke();
    }

    if (hit) {
      const endPoint = points[points.length - 1];
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#fff8d8';
      ctx.shadowColor = hitColor;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(endPoint.x, endPoint.y, 4.8 + Math.sin(time * 36) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  strokePoints(ctx, points, style, width) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.stroke();
  }
}
