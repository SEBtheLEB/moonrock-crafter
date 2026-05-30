export class RockIsland {
  constructor(data) {
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.x = data.worldPosition.x;
    this.y = data.worldPosition.y;
    this.radius = data.landingZoneRadius || 220;
    this.width = data.size?.width || this.radius * 3;
    this.height = data.size?.height || this.radius * 1.5;
    this.biome = data.biome || 'scrap';
  }

  isNearLandingZone(ship) {
    const dx = ship.x - this.x;
    const dy = ship.y - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  distanceSqTo(ship) {
    const dx = ship.x - this.x;
    const dy = ship.y - this.y;
    return dx * dx + dy * dy;
  }

  draw(ctx, camera, { active = false, discovered = false, time = 0 } = {}) {
    const screen = camera.worldToScreen(this.x, this.y);
    const colors = {
      scrap: ['#55606d', '#8a5630', '#76f3ff'],
      forest: ['#48664d', '#57c77c', '#ffd36b'],
      crystal: ['#315a72', '#8ee8ff', '#b58cff'],
      ember: ['#5d3440', '#ff8f3d', '#ffd36b'],
    }[this.biome] || ['#55606d', '#8a5630', '#76f3ff'];

    ctx.save();
    ctx.translate(screen.x, screen.y);
    const pulse = active ? 1 + Math.sin(time * 5) * 0.03 : 1;
    ctx.scale(pulse, pulse);

    ctx.fillStyle = active ? 'rgba(255, 211, 107, 0.18)' : 'rgba(118, 243, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors[0];
    ctx.strokeStyle = '#102033';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-this.width * 0.42, -this.height * 0.08);
    ctx.lineTo(-this.width * 0.22, -this.height * 0.38);
    ctx.lineTo(this.width * 0.18, -this.height * 0.34);
    ctx.lineTo(this.width * 0.44, -this.height * 0.05);
    ctx.lineTo(this.width * 0.32, this.height * 0.26);
    ctx.lineTo(-this.width * 0.12, this.height * 0.38);
    ctx.lineTo(-this.width * 0.46, this.height * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.ellipse(-this.width * 0.08, -this.height * 0.22, this.width * 0.23, this.height * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors[2];
    ctx.globalAlpha = discovered ? 0.9 : 0.45;
    ctx.beginPath();
    ctx.arc(this.width * 0.2, -this.height * 0.16, 14, 0, Math.PI * 2);
    ctx.arc(-this.width * 0.28, this.height * 0.04, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (active) {
      ctx.strokeStyle = '#ffd36b';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#fff2cf';
    ctx.strokeStyle = '#102033';
    ctx.lineWidth = 4;
    ctx.font = '900 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText(this.name, 0, -this.height * 0.48);
    ctx.fillText(this.name, 0, -this.height * 0.48);
    ctx.restore();
  }
}
