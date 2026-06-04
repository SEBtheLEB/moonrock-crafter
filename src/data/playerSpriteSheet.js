const PLAYER_SPRITE_SHEET_URL = './assets/img/generated/player/templateforchar.png';
const FRAME_SIZE = 32;

const PLAYER_SPRITE_ANIMATIONS = {
  idle: {
    fps: 1,
    sourceFacesLeft: false,
    frames: [
      { row: 0, col: 0 },
    ],
  },
  run: {
    fps: 10,
    sourceFacesLeft: true,
    frames: [
      { row: 4, col: 0 },
      { row: 4, col: 1 },
      { row: 4, col: 2 },
      { row: 4, col: 3 },
      { row: 4, col: 4 },
      { row: 4, col: 3 },
      { row: 4, col: 2 },
      { row: 4, col: 1 },
    ],
  },
  jump: {
    fps: 7,
    sourceFacesLeft: false,
    frames: [
      { row: 7, col: 0 },
      { row: 7, col: 5 },
      { row: 7, col: 7 },
    ],
  },
};

let playerSpriteSheet = null;

export function getPlayerSpriteSheet() {
  if (typeof Image === 'undefined') return null;
  if (playerSpriteSheet) return playerSpriteSheet;
  playerSpriteSheet = new Image();
  playerSpriteSheet.decoding = 'async';
  playerSpriteSheet.loading = 'eager';
  playerSpriteSheet.src = PLAYER_SPRITE_SHEET_URL;
  return playerSpriteSheet;
}

export function isPlayerSpriteSheetReady() {
  const image = getPlayerSpriteSheet();
  return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

function getAnimationFrame(animation, time = 0, velocityY = 0) {
  if (animation === PLAYER_SPRITE_ANIMATIONS.jump) {
    if (velocityY < -90) return animation.frames[0];
    if (velocityY > 120) return animation.frames[2];
    return animation.frames[1];
  }
  const frameIndex = Math.floor(Math.max(0, time) * animation.fps) % animation.frames.length;
  return animation.frames[frameIndex];
}

export function drawPlayerSpriteAnimation(ctx, {
  state = 'idle',
  time = 0,
  width = 34,
  height = 58,
  facing = 1,
  velocityY = 0,
  alpha = 1,
} = {}) {
  const animation = PLAYER_SPRITE_ANIMATIONS[state];
  const image = getPlayerSpriteSheet();
  if (!animation || !isPlayerSpriteSheetReady()) return false;

  const frame = getAnimationFrame(animation, time, velocityY);
  const drawHeight = height * (state === 'jump' ? 1.14 : 1.1);
  const drawWidth = drawHeight;
  const drawX = (width - drawWidth) * 0.5;
  const drawY = height - drawHeight + height * 0.035;
  const shouldFlip = animation.sourceFacesLeft ? facing > 0 : facing < 0;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  if (shouldFlip) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(
    image,
    frame.col * FRAME_SIZE,
    frame.row * FRAME_SIZE,
    FRAME_SIZE,
    FRAME_SIZE,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
  ctx.restore();
  return true;
}
