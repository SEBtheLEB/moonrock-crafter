export class Station {
  draw(ctx, x, y, radius, time = 0) {
    ctx.save();
    ctx.translate(x, y);

    ctx.strokeStyle = 'rgba(107, 227, 255, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.8, radius * 0.48, Math.sin(time) * 0.05, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#2c3447';
    ctx.strokeStyle = '#9fb9c9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff8f3d';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.26 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6be3ff';
    ctx.fillRect(-radius * 1.25, -radius * 0.08, radius * 0.5, radius * 0.16);
    ctx.fillRect(radius * 0.75, -radius * 0.08, radius * 0.5, radius * 0.16);
    ctx.restore();
  }
}
