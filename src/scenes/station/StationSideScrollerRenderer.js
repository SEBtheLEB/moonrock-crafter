export class StationSideScrollerRenderer {
  constructor() {
    this.stars = Array.from({ length: 95 }, (_, index) => ({
      x: (index * 211) % 2600,
      y: 18 + ((index * 83) % 420),
      size: 1 + (index % 3) * 0.55,
      speed: 4 + (index % 5) * 2,
      twinkle: index * 0.37,
    }));
    this.drifters = Array.from({ length: 12 }, (_, index) => ({
      x: (index * 431) % 2600,
      y: 46 + ((index * 97) % 310),
      size: 9 + (index % 4) * 5,
      speed: 9 + (index % 3) * 4,
      spin: index * 0.8,
    }));
  }

  draw(ctx, { viewport, world, camera, player, interactables, activeInteractable, time }) {
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    this.drawSpace(ctx, viewport, world, camera, time);
    ctx.save();
    this.applyWorldScale(ctx, viewport, camera.viewScale || 1);
    this.drawStationShell(ctx, viewport, world, camera, time);
    this.drawSections(ctx, world, camera, time);
    this.drawInteractables(ctx, interactables, activeInteractable, camera, time);
    player.draw(ctx, camera, time);
    this.drawForeground(ctx, viewport, world, camera, time);
    ctx.restore();
    this.drawWarmOverlay(ctx, viewport, time);
  }

  applyWorldScale(ctx, viewport, scale) {
    if (Math.abs(scale - 1) < 0.001) return;
    ctx.translate(viewport.width / 2, viewport.height);
    ctx.scale(scale, scale);
    ctx.translate(-viewport.width / 2, -viewport.height);
  }

  drawSpace(ctx, viewport, world, camera, time) {
    const gradient = ctx.createLinearGradient(0, 0, viewport.width, viewport.height);
    gradient.addColorStop(0, '#050914');
    gradient.addColorStop(0.48, '#111827');
    gradient.addColorStop(1, '#0b1724');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = 'rgba(102, 216, 232, 0.1)';
    ctx.beginPath();
    ctx.ellipse(viewport.width * 0.72 - camera.x * 0.03, viewport.height * 0.18, viewport.width * 0.32, viewport.height * 0.16, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(217, 134, 66, 0.07)';
    ctx.beginPath();
    ctx.ellipse(viewport.width * 0.18 - camera.x * 0.018, viewport.height * 0.74, viewport.width * 0.32, viewport.height * 0.18, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (const star of this.stars) {
      const sx = ((star.x - camera.x * 0.16 - time * star.speed) % world.width + world.width) % world.width;
      if (sx < -20 || sx > viewport.width + 20) continue;
      const alpha = 0.44 + Math.sin(time * 2.2 + star.twinkle) * 0.24;
      ctx.fillStyle = `rgba(236, 231, 216, ${alpha})`;
      ctx.fillRect(sx, star.y % viewport.height, star.size, star.size);
    }

    for (const rock of this.drifters) {
      const sx = ((rock.x - camera.x * 0.23 - time * rock.speed) % world.width + world.width) % world.width;
      if (sx < -50 || sx > viewport.width + 50) continue;
      ctx.save();
      ctx.translate(sx, rock.y % Math.max(240, viewport.height - 80));
      ctx.rotate(time * 0.18 + rock.spin);
      ctx.fillStyle = 'rgba(90, 105, 118, 0.42)';
      ctx.strokeStyle = 'rgba(236, 231, 216, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-rock.size, -rock.size * 0.2);
      ctx.lineTo(-rock.size * 0.2, -rock.size);
      ctx.lineTo(rock.size, -rock.size * 0.45);
      ctx.lineTo(rock.size * 0.75, rock.size * 0.55);
      ctx.lineTo(-rock.size * 0.6, rock.size);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawStationShell(ctx, viewport, world, camera, time) {
    const y = world.floorY;
    const wallTop = Math.max(72, y - 236);
    const sx = -camera.x;

    ctx.fillStyle = 'rgba(8, 17, 26, 0.78)';
    ctx.fillRect(sx, wallTop, world.width, y - wallTop);
    ctx.fillStyle = 'rgba(236, 231, 216, 0.045)';
    for (let x = 0; x < world.width; x += 180) {
      ctx.fillRect(Math.round(sx + x), wallTop, 5, y - wallTop);
    }

    for (let x = 90; x < world.width; x += 420) {
      const wx = Math.round(sx + x);
      if (wx < -180 || wx > viewport.width + 120) continue;
      ctx.fillStyle = '#101923';
      ctx.beginPath();
      ctx.roundRect(wx, wallTop + 34, 126, 82, 18);
      ctx.fill();
      ctx.fillStyle = 'rgba(102, 216, 232, 0.12)';
      ctx.beginPath();
      ctx.roundRect(wx + 10, wallTop + 44, 106, 62, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(236, 231, 216, 0.12)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.fillStyle = '#0a141f';
    ctx.fillRect(sx, y, world.width, viewport.height - y + 60);
    ctx.fillStyle = '#253b4c';
    ctx.fillRect(sx, y - 10, world.width, 12);
    ctx.fillStyle = '#76543a';
    ctx.fillRect(sx, y + 2, world.width, 8);
    ctx.fillStyle = 'rgba(231, 184, 92, 0.08)';
    for (let x = 0; x < world.width; x += 74) {
      ctx.fillRect(Math.round(sx + x), y - 11, 36, 7);
    }

    ctx.save();
    ctx.globalAlpha = 0.42 + Math.sin(time * 3) * 0.08;
    ctx.fillStyle = 'rgba(217, 134, 66, 0.22)';
    ctx.beginPath();
    ctx.ellipse(710 - camera.x, y - 54, 240, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSections(ctx, world, camera, time) {
    const floorY = world.floorY;
    const sections = [
      { x: 430, w: 370, title: 'FORGE', color: '#76543a' },
      { x: 850, w: 360, title: 'ENGINEERING', color: '#2b4557' },
      { x: 1190, w: 250, title: 'RESEARCH', color: '#37405f' },
      { x: 1460, w: 290, title: 'STAR MAP', color: '#30455e' },
      { x: 1780, w: 390, title: 'SHOP', color: '#5b4655' },
      { x: 2290, w: 500, title: 'LAUNCH BAY', color: '#294358' },
    ];

    for (const section of sections) {
      const sx = section.x - camera.x;
      if (sx > world.width + 400 || sx + section.w < -400) continue;
      this.drawSign(ctx, sx + section.w / 2, Math.max(54, floorY - 220), section.title, section.color);
      ctx.fillStyle = 'rgba(236, 231, 216, 0.055)';
      ctx.fillRect(sx + 12, floorY - 198, section.w - 24, 2);
    }

    this.drawForgeGlow(ctx, 620 - camera.x, floorY, time);
    this.drawPipes(ctx, camera, floorY, time);
  }

  drawSign(ctx, x, y, text, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(236, 231, 216, 0.82)';
    ctx.font = '680 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, 0, 1);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-46, 17);
    ctx.lineTo(46, 17);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-56, 17, 2.2, 0, Math.PI * 2);
    ctx.arc(56, 17, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawForgeGlow(ctx, x, floorY, time) {
    const flicker = 0.86 + Math.sin(time * 14) * 0.08 + Math.sin(time * 29) * 0.04;
    ctx.save();
    ctx.globalAlpha = flicker;
    ctx.fillStyle = 'rgba(217, 134, 66, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x + 45, floorY - 70, 155, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPipes(ctx, camera, floorY, time) {
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.72)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(360 - camera.x, floorY - 185);
    ctx.lineTo(660 - camera.x, floorY - 185);
    ctx.lineTo(660 - camera.x, floorY - 130);
    ctx.moveTo(880 - camera.x, floorY - 184);
    ctx.lineTo(1120 - camera.x, floorY - 184);
    ctx.stroke();
    ctx.strokeStyle = '#253b4c';
    ctx.lineWidth = 3;
    ctx.stroke();

    const blink = Math.sin(time * 4) > 0.65;
    ctx.fillStyle = blink ? '#66d8e8' : '#2b4557';
    ctx.beginPath();
    ctx.arc(1112 - camera.x, floorY - 184, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  drawInteractables(ctx, interactables, activeInteractable, camera, time) {
    // Placeholder canvas props; swap these draw methods for sprite layers when final station art arrives.
    for (const interactable of interactables) {
      const sx = interactable.x - camera.x;
      if (sx + interactable.width < -180 || sx > camera.viewportWidth + 180) continue;
      if (interactable.id === 'forge') this.drawForge(ctx, sx, interactable.y, interactable, activeInteractable, time);
      if (interactable.id === 'upgrades') this.drawWorkbench(ctx, sx, interactable.y, interactable, activeInteractable);
      if (interactable.id === 'research') this.drawResearch(ctx, sx, interactable.y, interactable, activeInteractable, time);
      if (interactable.id === 'navigation') this.drawNavigation(ctx, sx, interactable.y, interactable, activeInteractable, time);
      if (interactable.id === 'shop') this.drawShop(ctx, sx, interactable.y, interactable, activeInteractable, time);
      if (interactable.id === 'launch') this.drawLaunchBay(ctx, sx, interactable.y, interactable, activeInteractable, time);
      this.drawInteractableGlow(ctx, sx, interactable, activeInteractable);
    }
  }

  drawInteractableGlow(ctx, sx, interactable, activeInteractable) {
    if (interactable !== activeInteractable) return;
    ctx.save();
    const y = interactable.y + interactable.height + 8;
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = 'rgba(231, 184, 92, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 20, y);
    ctx.lineTo(sx + interactable.width - 20, y);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = 'rgba(231, 184, 92, 0.9)';
    ctx.beginPath();
    ctx.ellipse(sx + interactable.width / 2, y - 4, interactable.width * 0.38, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawStorage(ctx, x, y) {
    for (let i = 0; i < 5; i += 1) {
      const crateX = x + 16 + (i % 3) * 62;
      const crateY = y + 36 + Math.floor(i / 3) * 47;
      ctx.fillStyle = '#76543a';
      ctx.strokeStyle = 'rgba(236, 231, 216, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(crateX, crateY, 55, 41, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(231, 184, 92, 0.2)';
      ctx.fillRect(crateX + 8, crateY + 9, 39, 6);
    }
  }

  drawForge(ctx, x, y, interactable, activeInteractable, time) {
    const flicker = 0.84 + Math.sin(time * 13) * 0.12;
    ctx.fillStyle = '#101923';
    ctx.beginPath();
    ctx.roundRect(x + 45, y + 28, 112, 112, 18);
    ctx.fill();
    ctx.fillStyle = `rgba(217, 134, 66, ${0.64 * flicker})`;
    ctx.beginPath();
    ctx.roundRect(x + 62, y + 54, 78, 58, 16);
    ctx.fill();
    ctx.fillStyle = '#253b4c';
    ctx.beginPath();
    ctx.roundRect(x + 176, y + 92, 74, 28, 12);
    ctx.fill();
    ctx.fillStyle = '#101923';
    ctx.fillRect(x + 195, y + 120, 16, 42);

    if (interactable === activeInteractable) {
      for (let i = 0; i < 7; i += 1) {
        ctx.fillStyle = i % 2 ? '#e7b85c' : '#d98642';
        ctx.beginPath();
        ctx.arc(x + 86 + i * 10, y + 28 - ((time * 35 + i * 12) % 45), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawWorkbench(ctx, x, y) {
    ctx.fillStyle = '#76543a';
    ctx.strokeStyle = 'rgba(236, 231, 216, 0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(x + 24, y + 86, 210, 30, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#253b4c';
    ctx.beginPath();
    ctx.roundRect(x + 45, y + 36, 62, 50, 12);
    ctx.roundRect(x + 128, y + 44, 84, 42, 12);
    ctx.fill();
    ctx.fillStyle = '#e7b85c';
    ctx.fillRect(x + 68, y + 50, 17, 14);
  }

  drawResearch(ctx, x, y, interactable, activeInteractable, time) {
    ctx.fillStyle = '#101923';
    ctx.beginPath();
    ctx.roundRect(x + 38, y + 32, 122, 96, 18);
    ctx.fill();
    ctx.fillStyle = 'rgba(102, 216, 232, 0.18)';
    ctx.beginPath();
    ctx.roundRect(x + 52, y + 48, 94, 56, 14);
    ctx.fill();
    const pulse = interactable === activeInteractable ? 0.45 + Math.sin(time * 6) * 0.18 : 0.25;
    ctx.fillStyle = `rgba(102, 216, 232, ${pulse})`;
    ctx.beginPath();
    ctx.arc(x + 100, y + 77, 23, 0, Math.PI * 2);
    ctx.fill();
  }

  drawNavigation(ctx, x, y, interactable, activeInteractable, time) {
    const online = activeInteractable === interactable;
    ctx.fillStyle = '#101923';
    ctx.strokeStyle = 'rgba(236, 231, 216, 0.14)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(x + 30, y + 38, 168, 88, 18);
    ctx.fill();
    ctx.fillStyle = online ? 'rgba(102, 216, 232, 0.24)' : 'rgba(37, 59, 76, 0.28)';
    ctx.beginPath();
    ctx.roundRect(x + 44, y + 52, 140, 60, 14);
    ctx.fill();
    ctx.strokeStyle = online ? '#66d8e8' : '#253b4c';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x + 114, y + 82, 24 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
    ctx.moveTo(x + 114, y + 58);
    ctx.lineTo(x + 114, y + 106);
    ctx.moveTo(x + 90, y + 82);
    ctx.lineTo(x + 138, y + 82);
    ctx.stroke();
    ctx.fillStyle = online ? '#e7b85c' : '#6b8296';
    ctx.beginPath();
    ctx.arc(x + 114 + Math.cos(time * 2.2) * 20, y + 82 + Math.sin(time * 2.2) * 20, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#76543a';
    ctx.strokeStyle = 'rgba(236, 231, 216, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x + 16, y + 122, 198, 26, 10);
    ctx.fill();
    ctx.stroke();
  }

  drawShop(ctx, x, y, interactable, activeInteractable, time) {
    ctx.fillStyle = '#76543a';
    ctx.strokeStyle = 'rgba(236, 231, 216, 0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(x + 44, y + 90, 210, 58, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = activeInteractable === interactable ? '#e7b85c' : '#9c4a44';
    ctx.beginPath();
    ctx.roundRect(x + 82, y + 48, 132, 38, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#101923';
    ctx.font = '720 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(activeInteractable === interactable ? 'OPEN?' : 'SHOP', x + 148, y + 73);
    ctx.fillStyle = 'rgba(102, 216, 232, 0.16)';
    ctx.beginPath();
    ctx.ellipse(x + 288, y + 38 + Math.sin(time * 2) * 3, 42, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLaunchBay(ctx, x, y, interactable, activeInteractable, time) {
    const bob = Math.sin(time * 2.5) * 5;
    ctx.fillStyle = '#101923';
    ctx.beginPath();
    ctx.roundRect(x + 18, y + 98, 278, 36, 14);
    ctx.fill();
    ctx.save();
    ctx.translate(x + 135, y + 50 + bob);
    ctx.fillStyle = activeInteractable === interactable ? '#e7b85c' : '#dce6ec';
    ctx.strokeStyle = 'rgba(8, 17, 26, 0.56)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(84, 18);
    ctx.lineTo(36, -20);
    ctx.lineTo(-58, -16);
    ctx.lineTo(-88, 18);
    ctx.lineTo(-54, 42);
    ctx.lineTo(34, 36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#66d8e8';
    ctx.beginPath();
    ctx.ellipse(8, 3, 23, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(217, 134, 66, 0.58)';
    ctx.beginPath();
    ctx.moveTo(-88, 18);
    ctx.lineTo(-124 - Math.sin(time * 12) * 10, 28);
    ctx.lineTo(-88, 36);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawForeground(ctx, viewport, world, camera, time) {
    ctx.fillStyle = 'rgba(236, 231, 216, 0.045)';
    for (let x = -((camera.x * 0.8) % 140); x < viewport.width; x += 140) {
      ctx.fillRect(x, world.floorY + 28, 80, 5);
    }
    ctx.fillStyle = 'rgba(217, 134, 66, 0.08)';
    ctx.fillRect(0, world.floorY - 2, viewport.width, 4);
  }

  drawWarmOverlay(ctx, viewport, time) {
    ctx.fillStyle = `rgba(231, 184, 92, ${0.025 + Math.sin(time * 3) * 0.012})`;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }
}
