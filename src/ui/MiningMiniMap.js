export class MiningMiniMap {
  constructor({ zones, ringSize = 20000, maxDistance = 100000 } = {}) {
    this.zones = zones || [];
    this.ringSize = ringSize;
    this.maxDistance = maxDistance;
    this.expanded = false;
    this.element = document.createElement('div');
    this.element.className = 'mining-minimap';
    this.element.innerHTML = `
      <canvas class="mining-minimap-canvas" data-minimap-canvas></canvas>
      <div class="mining-minimap-info">
        <strong data-minimap-zone></strong>
        <span data-minimap-distance></span>
      </div>
      <button class="mining-minimap-toggle" type="button" data-minimap-toggle>Rings</button>
    `;
    this.canvas = this.element.querySelector('[data-minimap-canvas]');
    this.ctx = this.canvas.getContext('2d');
    this.zoneLabel = this.element.querySelector('[data-minimap-zone]');
    this.distanceLabel = this.element.querySelector('[data-minimap-distance]');
    this.toggleButton = this.element.querySelector('[data-minimap-toggle]');
    this.toggleButton.addEventListener('click', () => {
      this.expanded = !this.expanded;
      this.element.classList.toggle('is-expanded', this.expanded);
      this.toggleButton.textContent = this.expanded ? 'Local' : 'Rings';
      this.lastDraw = null;
    });
  }

  draw({ ship, distance, zone }) {
    if (!this.ctx || !ship) return;
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const drawKey = `${Math.round(ship.x)}:${Math.round(ship.y)}:${zone?.id}:${this.expanded}:${width}:${height}`;
    if (this.lastDraw === drawKey) return;
    this.lastDraw = drawKey;

    this.zoneLabel.textContent = zone?.name || 'Unknown Ring';
    this.distanceLabel.textContent = `${Math.round(distance)}m`;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(scale, scale);
    this.drawMap(ctx, rect.width, rect.height, ship, distance);
    ctx.restore();
  }

  drawMap(ctx, width, height, ship, distance) {
    const centerX = width / 2;
    const centerY = height / 2;
    const viewRadius = this.expanded
      ? this.maxDistance
      : Math.max(this.ringSize * 0.72, Math.min(this.ringSize * 1.25, distance + this.ringSize * 0.24));
    const mapRadius = Math.min(width, height) * 0.42;
    const worldToMap = mapRadius / Math.max(1, viewRadius);

    const gradient = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, mapRadius);
    gradient.addColorStop(0, 'rgba(70, 132, 185, 0.72)');
    gradient.addColorStop(0.34, 'rgba(13, 33, 65, 0.7)');
    gradient.addColorStop(0.62, 'rgba(109, 50, 35, 0.62)');
    gradient.addColorStop(0.82, 'rgba(58, 32, 98, 0.64)');
    gradient.addColorStop(1, 'rgba(2, 5, 13, 0.82)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, mapRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(236, 231, 216, 0.18)';
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= Math.ceil(this.maxDistance / this.ringSize); ring += 1) {
      const radius = ring * this.ringSize * worldToMap;
      if (radius > mapRadius + 2) break;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (this.expanded && this.zones[ring - 1]) {
        ctx.fillStyle = 'rgba(236, 231, 216, 0.54)';
        ctx.font = '700 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round((ring * this.ringSize) / 1000)}k`, centerX, centerY - radius + 12);
      }
    }

    ctx.fillStyle = '#66d8e8';
    ctx.shadowColor = '#66d8e8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();

    const clampedDistance = Math.min(viewRadius, Math.hypot(ship.x, ship.y));
    const angle = Math.atan2(ship.y, ship.x);
    const shipX = centerX + Math.cos(angle) * clampedDistance * worldToMap;
    const shipY = centerY + Math.sin(angle) * clampedDistance * worldToMap;
    ctx.fillStyle = '#ffd36b';
    ctx.shadowColor = '#ffd36b';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(shipX, shipY, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
