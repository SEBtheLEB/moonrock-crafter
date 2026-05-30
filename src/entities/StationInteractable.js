export class StationInteractable {
  constructor({
    id,
    label,
    prompt,
    x,
    y,
    width,
    height,
    icon = '',
    station = '',
    triggerPadding = 70,
  }) {
    this.id = id;
    this.label = label;
    this.prompt = prompt || `Use ${label}`;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.icon = icon;
    this.station = station;
    this.triggerPadding = triggerPadding;
  }

  get centerX() {
    return this.x + this.width / 2;
  }

  get centerY() {
    return this.y + this.height / 2;
  }

  get triggerRect() {
    return {
      left: this.x - this.triggerPadding,
      right: this.x + this.width + this.triggerPadding,
      top: this.y - this.triggerPadding,
      bottom: this.y + this.height + this.triggerPadding,
    };
  }

  containsPlayer(player) {
    const trigger = this.triggerRect;
    const bounds = player.bounds;
    return bounds.right >= trigger.left
      && bounds.left <= trigger.right
      && bounds.bottom >= trigger.top
      && bounds.top <= trigger.bottom;
  }

  distanceScore(player) {
    const dx = player.centerX - this.centerX;
    const dy = player.centerY - this.centerY;
    return dx * dx + dy * dy;
  }
}
