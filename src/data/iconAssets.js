export const ICON_ASSET_BASE = './assets/img/generated/icons';

const ITEM_ICON_FILES = {
  minerTool: 'miner-tool.png',
  swordWeapon: 'sword-weapon.png',
  laserGun: 'laser-gun.png',
  gravityStabilizer: 'gravity-machine.png',
  platformPlacerPp5: 'pp5-platform-placer.png',
  markerFlag: 'marker-flag.png',
  torch: 'cave-torch.png',
  fireCore: 'fire-core.png',
  craftingStationKit: 'crafting-station.png',
  researchStationKit: 'research-station.png',
  starterFurnace: 'starter-furnace.png',
  stoneOre: 'stone-ore.png',
  ironDust: 'iron-dust.png',
  copperShards: 'copper-shards.png',
  ironIngot: 'iron-ingot.png',
  copperIngot: 'copper-ingot.png',
  crystallizedStone: 'crystallized-stone.png',
  redCrystal: 'red-crystal.png',
  moonCrystal: 'moon-crystal.png',
  metalCaseWall: 'metal-case-block.png',
  metalCaseBackWall: 'metal-case-background-wall.png',
  metalDoor: 'metal-door.png',
  thinPlatform: 'thin-platform.png',
  alienGoop: 'alien-goop.png',
  emberstone: 'emberstone.png',
  silverIce: 'silver-ice.png',
  denseNickel: 'dense-nickel.png',
  glassCrystal: 'glass-crystal.png',
  moonsteel: 'moonsteel.png',
  cryoCrystal: 'cryo-crystal.png',
  solarAmber: 'solar-amber.png',
  voidQuartz: 'void-quartz.png',
  starsteel: 'starsteel.png',
  livingMetal: 'living-metal.png',
  ancientAlloy: 'ancient-alloy.png',
  cometCore: 'comet-core.png',
  researchFragment: 'research-fragment.png',
  spaceWood: 'space-wood.png',
  sap: 'sap.png',
  glowberries: 'glowberries.png',
  mushrooms: 'mushrooms.png',
  meat: 'meat.png',
  hide: 'hide.png',
  bones: 'bones.png',
  feathers: 'feathers.png',
  charcoalWood: 'charcoal-wood.png',
  firePepper: 'fire-pepper.png',
  glowMoss: 'glow-moss.png',
  ancientFragment: 'ancient-fragment.png',
};

const GENERATED_API_IMAGE_ITEM_IDS = new Set([
  'minerTool',
  'swordWeapon',
  'laserGun',
  'gravityStabilizer',
  'platformPlacerPp5',
  'markerFlag',
  'torch',
  'fireCore',
  'craftingStationKit',
]);

export function getItemIconUrl(itemId) {
  const file = ITEM_ICON_FILES[itemId];
  if (!file) return '';
  const resolvedFile = GENERATED_API_IMAGE_ITEM_IDS.has(itemId)
    ? file.replace(/\.[^.]+$/, '.jpg')
    : file.replace(/\.[^.]+$/, '.svg');
  return `${ICON_ASSET_BASE}/${resolvedFile}`;
}

export function createItemIconMarkup(itemId, fallback = '?', { className = 'item-icon-img', alt = '' } = {}) {
  const src = getItemIconUrl(itemId);
  if (!src) return fallback || '?';
  const fallbackSrc = src.replace(/\.[^.]+$/, '.svg');
  const label = String(alt || '').replace(/"/g, '&quot;');
  return `
    <span class="item-icon-shell">
      <img class="${className}" src="${src}" data-fallback-src="${fallbackSrc}" alt="${label}" loading="lazy" decoding="async" draggable="false" onerror="if(!this.dataset.fallbackUsed){this.dataset.fallbackUsed='1';this.src=this.dataset.fallbackSrc}else{this.hidden=true;this.nextElementSibling.hidden=false}">
      <span class="item-icon-fallback" hidden>${fallback || '?'}</span>
    </span>
  `;
}

export const itemIconFiles = ITEM_ICON_FILES;
