export class StationHubRenderer {
  constructor() {
    this.stars = Array.from({ length: 96 }, (_, index) => ({
      x: (index * 137) % 1000,
      y: (index * 71) % 560,
      size: 0.6 + (index % 4) * 0.35,
      speed: 4 + (index % 5) * 1.4,
    }));
    this.asteroids = Array.from({ length: 9 }, (_, index) => ({
      x: (index * 181) % 1000,
      y: 42 + ((index * 97) % 450),
      size: 8 + (index % 4) * 4,
      speed: 7 + (index % 3) * 2,
      wobble: index * 0.7,
    }));
  }

  draw(ctx, viewport, time, state) {
    const { width, height } = viewport;
    ctx.clearRect(0, 0, width, height);
    this.drawSpace(ctx, width, height, time);
    this.drawStation(ctx, width, height, time, state);
  }

  drawSpace(ctx, width, height, time) {
    const nebula = ctx.createRadialGradient(width * 0.5, height * 0.45, 24, width * 0.5, height * 0.45, width * 0.82);
    nebula.addColorStop(0, '#2f1a46');
    nebula.addColorStop(0.42, '#123d5c');
    nebula.addColorStop(1, '#050614');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, width, height);

    this.drawNebulaCloud(ctx, width * 0.28, height * 0.18, width * 0.34, '#ff8f3d', 0.08);
    this.drawNebulaCloud(ctx, width * 0.78, height * 0.34, width * 0.28, '#76f3ff', 0.08);
    this.drawNebulaCloud(ctx, width * 0.58, height * 0.9, width * 0.38, '#9055ff', 0.09);

    ctx.fillStyle = 'rgba(255, 250, 226, 0.86)';
    this.stars.forEach((star) => {
      const x = (star.x / 1000) * width - ((time * star.speed) % (width + 24));
      const wrappedX = x < -12 ? x + width + 24 : x;
      const y = (star.y / 560) * height;
      ctx.beginPath();
      ctx.arc(wrappedX, y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    this.asteroids.forEach((asteroid) => this.drawTinyAsteroid(ctx, asteroid, width, height, time));
  }

  drawNebulaCloud(ctx, x, y, radius, color, alpha) {
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, `${color}30`);
    cloud.addColorStop(1, `${color}00`);
    ctx.globalAlpha = alpha * 4;
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawTinyAsteroid(ctx, asteroid, width, height, time) {
    const x = ((asteroid.x / 1000) * width + time * asteroid.speed) % (width + 80) - 40;
    const y = (asteroid.y / 560) * height + Math.sin(time + asteroid.wobble) * 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.18 + asteroid.wobble);
    ctx.fillStyle = 'rgba(122, 130, 143, 0.55)';
    ctx.strokeStyle = 'rgba(238, 229, 204, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 7; i += 1) {
      const angle = (Math.PI * 2 * i) / 7;
      const radius = asteroid.size * (0.78 + (i % 3) * 0.1);
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawStation(ctx, width, height, time, state) {
    const cx = width * 0.5;
    const cy = height * 0.49;
    const stationWidth = Math.min(width * 0.72, height * 1.62);
    const stationHeight = Math.min(height * 0.52, width * 0.38);
    const left = cx - stationWidth / 2;
    const top = cy - stationHeight / 2;

    this.drawExteriorHull(ctx, left, top, stationWidth, stationHeight);
    this.drawWorkshopWarmth(ctx, left, top, stationWidth, stationHeight, time);
    this.drawDeckFloor(ctx, left, top, stationWidth, stationHeight);
    this.drawWindow(ctx, left + stationWidth * 0.67, top + stationHeight * 0.17, stationWidth * 0.22, stationHeight * 0.25, time);
    this.drawLaunchBay(ctx, left, top, stationWidth, stationHeight, time);
    this.drawForgeArea(ctx, left, top, stationWidth, stationHeight, time);
    this.drawShopCounter(ctx, left, top, stationWidth, stationHeight, time);
    this.drawStorageAndResearch(ctx, left, top, stationWidth, stationHeight, time, state);
    this.drawHangingTools(ctx, left, top, stationWidth, stationHeight, time);
    this.drawPhysicalSigns(ctx, left, top, stationWidth, stationHeight, time);
    this.drawStationLights(ctx, left, top, stationWidth, stationHeight, time);
  }

  drawWorkshopWarmth(ctx, x, y, width, height, time) {
    const glow = ctx.createRadialGradient(x + width * 0.46, y + height * 0.52, 10, x + width * 0.46, y + height * 0.52, height * 0.62);
    glow.addColorStop(0, `rgba(255, 143, 61, ${0.28 + Math.sin(time * 8) * 0.03})`);
    glow.addColorStop(0.46, 'rgba(255, 211, 107, 0.08)');
    glow.addColorStop(1, 'rgba(255, 143, 61, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, width, height);
  }

  drawDeckFloor(ctx, x, y, width, height) {
    ctx.save();
    const floorY = y + height * 0.72;
    ctx.fillStyle = 'rgba(9, 24, 39, 0.76)';
    ctx.fillRect(x + 14, floorY, width - 28, height * 0.18);
    ctx.strokeStyle = 'rgba(118, 151, 172, 0.36)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const px = x + width * (0.08 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(px, floorY + 2);
      ctx.lineTo(px + width * 0.04, floorY + height * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawExteriorHull(ctx, x, y, width, height) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 143, 61, 0.26)';
    ctx.shadowBlur = 28;
    this.roundRect(ctx, x, y, width, height, 30);
    ctx.fillStyle = '#17324b';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();

    this.roundRect(ctx, x + 10, y + 10, width - 20, height - 20, 24);
    ctx.strokeStyle = '#4d7890';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#253f58';
    ctx.fillRect(x + width * 0.32, y + 8, width * 0.08, height - 16);
    ctx.fillRect(x + width * 0.64, y + 8, width * 0.08, height - 16);
    ctx.restore();
  }

  drawWindow(ctx, x, y, width, height, time) {
    this.roundRect(ctx, x, y, width, height, 18);
    ctx.fillStyle = '#081728';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    this.roundRect(ctx, x + 5, y + 5, width - 10, height - 10, 13);
    ctx.clip();
    ctx.fillStyle = '#10233c';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#fff2cf';
    for (let i = 0; i < 12; i += 1) {
      const sx = x + ((i * 43 + time * 8) % width);
      const sy = y + 10 + ((i * 29) % (height - 20));
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLaunchBay(ctx, x, y, width, height, time) {
    const bayX = x + width * 0.07;
    const bayY = y + height * 0.26;
    const bob = Math.sin(time * 1.6) * 4;
    this.drawZonePlate(ctx, bayX - 14, bayY - 28, width * 0.22, height * 0.42, '#1c4862');

    ctx.save();
    ctx.globalAlpha = 0.42 + Math.sin(time * 3) * 0.08;
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff8f3d';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(bayX + width * 0.11, bayY + height * 0.13, width * 0.12, height * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#0b1829';
    ctx.fillRect(bayX - 12, bayY + height * 0.19, width * 0.21, 10);
    ctx.fillStyle = '#76f3ff';
    ctx.fillRect(bayX + 12, bayY + height * 0.21, width * 0.12, 6);

    ctx.save();
    ctx.translate(bayX + width * 0.11, bayY + height * 0.12 + bob);
    ctx.fillStyle = '#f3fbff';
    ctx.strokeStyle = '#0a1728';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(-28, -18);
    ctx.lineTo(-16, 0);
    ctx.lineTo(-28, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff8f3d';
    ctx.fillRect(-42, -8, 18, 16);
    ctx.restore();
  }

  drawForgeArea(ctx, x, y, width, height, time) {
    const forgeX = x + width * 0.39;
    const forgeY = y + height * 0.22;
    const flicker = 1 + Math.sin(time * 8) * 0.08 + Math.sin(time * 17) * 0.04;

    this.drawPipe(ctx, forgeX - width * 0.08, y + 28, forgeX + width * 0.12, y + 28);
    this.drawZonePlate(ctx, forgeX - width * 0.1, forgeY - height * 0.08, width * 0.26, height * 0.46, '#4b2e3d');

    ctx.save();
    ctx.shadowColor = '#ff8f3d';
    ctx.shadowBlur = 24 * flicker;
    this.roundRect(ctx, forgeX, forgeY, width * 0.11, height * 0.26, 16);
    ctx.fillStyle = '#2a1824';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();
    ctx.fillStyle = '#ff8f3d';
    ctx.beginPath();
    ctx.ellipse(forgeX + width * 0.055, forgeY + height * 0.15, width * 0.04 * flicker, height * 0.08 * flicker, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.ellipse(forgeX + width * 0.055, forgeY + height * 0.16, width * 0.024 * flicker, height * 0.045 * flicker, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.drawAnvil(ctx, forgeX - width * 0.07, forgeY + height * 0.26);
    this.drawSparks(ctx, forgeX + width * 0.055, forgeY + height * 0.11, time);
  }

  drawShopCounter(ctx, x, y, width, height, time) {
    const counterX = x + width * 0.75;
    const counterY = y + height * 0.48;
    this.drawZonePlate(ctx, counterX - width * 0.08, y + height * 0.2, width * 0.22, height * 0.42, '#234763');
    this.roundRect(ctx, counterX - width * 0.07, counterY, width * 0.2, height * 0.13, 14);
    ctx.fillStyle = '#7a4a2b';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();
    ctx.fillStyle = '#ffd36b';
    ctx.fillRect(counterX - width * 0.035, counterY - 13, width * 0.09, 11);
    ctx.fillStyle = Math.sin(time * 2) > 0.5 ? '#76f3ff' : '#2dffb1';
    ctx.beginPath();
    ctx.arc(counterX + width * 0.095, counterY - 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStorageAndResearch(ctx, x, y, width, height, time, state) {
    const crateX = x + width * 0.68;
    const crateY = y + height * 0.66;
    const shimmer = Math.sin(time * 2.8) * 1.5 + (state.station.storageUsed > 0 ? 2 : 0);
    for (let i = 0; i < 3; i += 1) {
      const px = crateX + i * width * 0.045;
      const py = crateY - (i % 2) * 12 - shimmer;
      this.drawCrate(ctx, px, py, width * 0.05, height * 0.11);
    }

    const computerX = x + width * 0.56;
    const computerY = y + height * 0.18;
    this.drawScanner(ctx, computerX, computerY, width * 0.09, height * 0.13, time);
  }

  drawPhysicalSigns(ctx, x, y, width, height, time) {
    this.drawPhysicalSign(ctx, 'LAUNCH BAY', x + width * 0.13, y + height * 0.145, width * 0.2, 30, '#76f3ff', time);
    this.drawPhysicalSign(ctx, 'FORGE', x + width * 0.385, y + height * 0.12, width * 0.15, 30, '#ff8f3d', time);
    this.drawPhysicalSign(ctx, 'SHOP', x + width * 0.765, y + height * 0.36, width * 0.13, 30, '#ffd36b', time);
    this.drawPhysicalSign(ctx, 'STORAGE', x + width * 0.68, y + height * 0.59, width * 0.16, 28, '#d8944d', time);
    this.drawPhysicalSign(ctx, 'RESEARCH', x + width * 0.535, y + height * 0.105, width * 0.17, 28, '#76f3ff', time);
  }

  drawPhysicalSign(ctx, label, x, y, width, height, accent, time) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8 + Math.sin(time * 2.2) * 1.5;
    this.roundRect(ctx, x, y, width, height, 8);
    ctx.fillStyle = '#f0c982';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(x + 6, y + height - 7, width - 12, 4);
    ctx.fillStyle = '#102033';
    ctx.font = `900 ${Math.max(10, Math.min(14, height * 0.42))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + height * 0.48);
    [[x + 8, y + 8], [x + width - 8, y + 8]].forEach(([boltX, boltY]) => {
      ctx.beginPath();
      ctx.arc(boltX, boltY, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawHangingTools(ctx, x, y, width, height, time) {
    const railY = y + height * 0.14;
    ctx.strokeStyle = '#0a1728';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.18, railY);
    ctx.lineTo(x + width * 0.48, railY);
    ctx.stroke();

    ['hammer', 'tongs', 'pick'].forEach((_, index) => {
      const toolX = x + width * (0.22 + index * 0.1);
      const sway = Math.sin(time * 1.2 + index) * 0.06;
      ctx.save();
      ctx.translate(toolX, railY);
      ctx.rotate(sway);
      ctx.strokeStyle = '#c5d7df';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 34);
      ctx.stroke();
      ctx.fillStyle = index === 0 ? '#ffd36b' : '#76f3ff';
      ctx.fillRect(-8, 30, 16, 8);
      ctx.restore();
    });
  }

  drawStationLights(ctx, x, y, width, height, time) {
    for (let i = 0; i < 7; i += 1) {
      const lightX = x + width * (0.08 + i * 0.14);
      const lightY = y + height * 0.08;
      const on = Math.sin(time * 2 + i) > -0.3;
      ctx.fillStyle = on ? '#ffd36b' : '#315069';
      ctx.beginPath();
      ctx.arc(lightX, lightY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawZonePlate(ctx, x, y, width, height, color) {
    this.roundRect(ctx, x, y, width, height, 18);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();
  }

  drawPipe(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = '#0a1728';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = '#6b8395';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  drawAnvil(ctx, x, y) {
    ctx.fillStyle = '#aebdca';
    ctx.strokeStyle = '#0a1728';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 32, y - 10);
    ctx.lineTo(x + 28, y - 10);
    ctx.lineTo(x + 44, y - 20);
    ctx.lineTo(x + 28, y + 5);
    ctx.lineTo(x - 8, y + 5);
    ctx.lineTo(x - 16, y + 28);
    ctx.lineTo(x - 44, y + 28);
    ctx.lineTo(x - 30, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawSparks(ctx, x, y, time) {
    ctx.fillStyle = '#ffd36b';
    for (let i = 0; i < 9; i += 1) {
      const life = (time * 1.8 + i * 0.23) % 1;
      const px = x + Math.sin(i * 2.4) * 34 * life;
      const py = y - life * 52 + Math.cos(i) * 8;
      ctx.globalAlpha = 1 - life;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawCrate(ctx, x, y, width, height) {
    this.roundRect(ctx, x, y, width, height, 6);
    ctx.fillStyle = '#8a5630';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();
    ctx.strokeStyle = '#d8944d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 6);
    ctx.lineTo(x + width - 6, y + height - 6);
    ctx.moveTo(x + width - 6, y + 6);
    ctx.lineTo(x + 6, y + height - 6);
    ctx.stroke();
  }

  drawScanner(ctx, x, y, width, height, time) {
    this.roundRect(ctx, x, y, width, height, 12);
    ctx.fillStyle = '#22304a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0a1728';
    ctx.stroke();
    ctx.fillStyle = '#76f3ff';
    ctx.fillRect(x + width * 0.18, y + height * 0.2, width * 0.64, height * 0.36);
    ctx.strokeStyle = '#2dffb1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.2, y + height * (0.78 + Math.sin(time * 4) * 0.04));
    ctx.lineTo(x + width * 0.82, y + height * (0.78 - Math.sin(time * 3) * 0.04));
    ctx.stroke();
  }

  roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
}
