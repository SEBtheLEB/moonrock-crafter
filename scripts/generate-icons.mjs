import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materials } from '../src/data/materials.js';
import { itemIconFiles } from '../src/data/iconAssets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'assets', 'img', 'generated', 'icons');

const ENDPOINT = process.env.POLLINATIONS_IMAGE_API || 'https://image.pollinations.ai/prompt';
const WIDTH = Number(process.env.ICON_SIZE || 256);
const HEIGHT = Number(process.env.ICON_SIZE || 256);
const RAW_MODEL = (process.env.POLLINATIONS_MODEL || '').trim();
const MODEL = normalizePollinationsModel(RAW_MODEL, ENDPOINT);
const CONCURRENCY = Math.max(1, Number(process.env.ICON_CONCURRENCY || 2));
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.ICON_REQUEST_TIMEOUT_MS || 45000));

function isPollinationsEndpoint(endpoint) {
  try {
    return new URL(endpoint).hostname.endsWith('pollinations.ai');
  } catch {
    return String(endpoint || '').includes('pollinations.ai');
  }
}

function isOpenAiImageModelSlug(model) {
  return /^(gpt-image-|dall-e-|chatgpt-image-)/i.test(model);
}

function normalizePollinationsModel(model, endpoint) {
  if (!model) return '';
  if (isPollinationsEndpoint(endpoint) && isOpenAiImageModelSlug(model)) {
    console.warn(
      `Ignoring POLLINATIONS_MODEL="${model}" because the free Pollinations endpoint does not support OpenAI image model IDs.`,
    );
    return '';
  }
  return model;
}

const promptOverrides = {
  minerTool: 'compact handheld blue laser mining tool with small glowing lens and orange grip',
  swordWeapon: 'compact orange energy field sword with simple sci fi handle',
  laserGun: 'small fire-core powered laser pistol with blue barrel and copper accents',
  gravityStabilizer: 'portable gravity machine cube with glowing blue core and tiny black panels',
  platformPlacerPp5: 'small platform placer tool labeled by shape only, no text, five tiny floating platform segments',
  markerFlag: 'yellow explorer marker flag on a white pole with tiny metal base',
  torch: 'small cave torch with warm orange flame and dark metal clamp',
  craftingStationKit: 'folded sci fi crafting station kit with blue glowing panel',
  researchStationKit: 'compact research terminal kit with violet scanner screen',
  starterFurnace: 'small starter furnace machine with orange glowing inner chamber',
  metalCaseWall: 'single smooth gray metal construction block with beveled edges',
  metalCaseBackWall: 'thin gray sci fi background wall panel plate',
  metalDoor: 'four tile tall compact sci fi metal door icon',
  thinPlatform: 'thin jump-through metal platform plank, one block wide',
  alienGoop: 'green alien slime blob droplet with glossy highlights',
  fireCore: 'red orange molten crystal core orb with contained forge glow',
  moonCrystal: 'dark moonrock chunk with purple and blue crystal flecks',
};

function parseArgs(argv) {
  const options = { force: false, all: false, items: [], limit: 0, localFallbacks: false, skipApi: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') options.force = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--local-fallbacks') options.localFallbacks = true;
    else if (arg === '--skip-api') options.skipApi = true;
    else if (arg === '--limit') options.limit = Number(argv[++index] || 0);
    else if (arg === '--item') options.items.push(argv[++index]);
  }
  return options;
}

function kebab(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function getFileName(material) {
  return (itemIconFiles[material.id] || `${kebab(material.id)}.png`).replace(/\.[^.]+$/, '.jpg');
}

function getFallbackFileName(material) {
  return getFileName(material).replace(/\.[^.]+$/, '.svg');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hexToRgb(hex = '#fff2cf') {
  const clean = String(hex).replace('#', '').trim();
  const value = clean.length === 3
    ? clean.split('').map((part) => part + part).join('')
    : clean.padEnd(6, 'f').slice(0, 6);
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex, target = '#ffffff', amount = 0.5) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function getFallbackGlyph(material) {
  if (material.id === 'minerTool') return 'M';
  if (material.id === 'swordWeapon') return 'S';
  if (material.id === 'laserGun') return 'L';
  if (material.id === 'gravityStabilizer') return 'G';
  if (material.id === 'platformPlacerPp5') return 'P5';
  if (material.id === 'markerFlag') return 'F';
  if (material.id === 'torch') return 'T';
  if (material.id === 'metalDoor') return 'D';
  return material.icon || material.name?.slice(0, 2) || '?';
}

function getFallbackShape(material) {
  if (material.id.includes('Tool') || material.id.includes('Gun') || material.id.includes('Weapon')) return 'tool';
  if (material.id.includes('Station') || material.id.includes('Furnace') || material.id.includes('Machine')) return 'machine';
  if (material.itemType === 'door') return 'door';
  if (material.itemType === 'platform') return 'platform';
  if (material.itemType === 'wall' || material.id.includes('Wall')) return 'panel';
  if (material.id.includes('Core') || material.id.includes('Crystal') || material.rarity === 'rare' || material.rarity === 'epic') return 'crystal';
  if (material.id.includes('Ingot')) return 'ingot';
  return 'chunk';
}

function getFallbackSvg(material) {
  const color = material.color || '#76f3ff';
  const dark = mix(color, '#06101c', 0.72);
  const mid = mix(color, '#253344', 0.44);
  const light = mix(color, '#ffffff', 0.38);
  const glow = mix(color, '#ffffff', 0.16);
  const glyph = escapeXml(getFallbackGlyph(material));
  const shape = getFallbackShape(material);
  const common = `
    <defs>
      <radialGradient id="bg" cx="50%" cy="44%" r="62%">
        <stop offset="0" stop-color="${glow}" stop-opacity=".36"/>
        <stop offset=".62" stop-color="#081422" stop-opacity=".84"/>
        <stop offset="1" stop-color="#020812"/>
      </radialGradient>
      <linearGradient id="item" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${light}"/>
        <stop offset=".48" stop-color="${color}"/>
        <stop offset="1" stop-color="${dark}"/>
      </linearGradient>
      <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000814" flood-opacity=".55"/>
      </filter>
    </defs>
    <rect width="256" height="256" rx="44" fill="url(#bg)"/>
  `;
  const label = `<text x="128" y="212" text-anchor="middle" font-family="Arial, sans-serif" font-size="${glyph.length > 2 ? 28 : 34}" font-weight="900" fill="#f6fbff" opacity=".82">${glyph}</text>`;
  const drawings = {
    tool: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">
        <path d="M54 143 L152 84 L181 113 L82 170 Z" fill="url(#item)"/>
        <path d="M151 82 L204 52 L220 70 L184 116 Z" fill="${light}"/>
        <path d="M69 154 L101 187 L79 209 L48 176 Z" fill="${mid}"/>
        <circle cx="177" cy="91" r="18" fill="${glow}" stroke="#08121e"/>
      </g>
    `,
    machine: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="9" stroke-linejoin="round">
        <path d="M58 82 H188 L207 104 V178 L184 199 H72 L49 176 V105 Z" fill="${dark}"/>
        <path d="M76 101 H176 V180 H76 Z" fill="url(#item)"/>
        <circle cx="128" cy="140" r="29" fill="${glow}"/>
        <path d="M88 72 V49 H111 V72 M145 72 V49 H168 V72" fill="${mid}"/>
      </g>
    `,
    door: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="9" stroke-linejoin="round">
        <path d="M87 47 H169 Q184 47 184 63 V204 H72 V63 Q72 47 87 47 Z" fill="url(#item)"/>
        <path d="M96 72 H160 V110 H96 Z" fill="${dark}" opacity=".72"/>
        <circle cx="160" cy="139" r="8" fill="${light}"/>
      </g>
    `,
    platform: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="9" stroke-linejoin="round">
        <path d="M45 112 H211 V146 H45 Z" fill="url(#item)"/>
        <path d="M64 147 L52 190 M100 147 L92 190 M156 147 L164 190 M193 147 L205 190" stroke="${mid}" fill="none"/>
      </g>
    `,
    panel: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="9" stroke-linejoin="round">
        <path d="M63 58 H193 V198 H63 Z" fill="url(#item)"/>
        <path d="M82 80 H174 V176 H82 Z" fill="${dark}" opacity=".34"/>
        <path d="M63 104 H193 M63 151 H193 M107 58 V198 M151 58 V198" stroke="${light}" stroke-width="4" opacity=".34"/>
      </g>
    `,
    crystal: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="8" stroke-linejoin="round">
        <path d="M128 37 L178 105 L154 211 H96 L72 104 Z" fill="url(#item)"/>
        <path d="M128 37 L128 211 M72 104 H178 M96 211 L128 104 L154 211" stroke="${light}" stroke-width="5" opacity=".42" fill="none"/>
        <circle cx="171" cy="70" r="8" fill="${light}"/>
      </g>
    `,
    ingot: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="9" stroke-linejoin="round">
        <path d="M55 132 L86 84 H171 L202 132 L176 183 H80 Z" fill="url(#item)"/>
        <path d="M86 84 L112 132 H202 M112 132 L80 183" stroke="${light}" stroke-width="5" opacity=".3" fill="none"/>
      </g>
    `,
    chunk: `
      <g filter="url(#softShadow)" stroke="#08121e" stroke-width="8" stroke-linejoin="round">
        <path d="M70 77 L128 43 L189 72 L213 130 L178 196 L105 205 L48 157 Z" fill="url(#item)"/>
        <path d="M70 77 L111 122 L48 157 M111 122 L128 43 M111 122 L178 196 M111 122 L213 130" stroke="${light}" stroke-width="5" opacity=".25" fill="none"/>
        <circle cx="159" cy="91" r="7" fill="${light}" opacity=".7"/>
      </g>
    `,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${escapeXml(material.name)}">${common}${drawings[shape] || drawings.chunk}${label}</svg>`;
}

async function writeLocalFallback(material, { force = false } = {}) {
  const fileName = getFallbackFileName(material);
  const outFile = path.join(outDir, fileName);
  if (!force && await exists(outFile)) return { id: material.id, fileName, skipped: true };
  await writeFile(outFile, getFallbackSvg(material), 'utf8');
  return { id: material.id, fileName, localFallback: true };
}

function getPrompt(material) {
  const subject = promptOverrides[material.id] || material.description || material.name;
  return [
    `single 2D game inventory icon of ${subject}`,
    `main accent color ${material.color || 'item color'}`,
    'centered object, dark navy radial background, crisp stylized sci fi survival craft icon',
    'readable at tiny size, no text, no letters, no numbers, no watermark, no UI frame',
  ].join(', ');
}

function seedFor(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function buildUrl(prompt, seed) {
  const params = new URLSearchParams({
    width: String(WIDTH),
    height: String(HEIGHT),
    nologo: 'true',
    seed: String(seed),
  });
  if (MODEL) params.set('model', MODEL);
  return `${ENDPOINT.replace(/\/$/, '')}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

async function generateIcon(material, { force = false } = {}) {
  if (force) await writeLocalFallback(material, { force: true });
  const fileName = getFileName(material);
  const outFile = path.join(outDir, fileName);
  if (!force && await exists(outFile)) {
    console.log(`skip ${material.id} -> ${fileName}`);
    return { id: material.id, fileName, skipped: true };
  }
  const prompt = getPrompt(material);
  const url = buildUrl(prompt, seedFor(material.id));
  console.log(`generate ${material.id} -> ${fileName}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      Accept: 'image/png,image/*;q=0.8,*/*;q=0.1',
      'User-Agent': 'Moonrock-Crafter-icon-generator/0.1',
    },
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`${material.id}: HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    const text = await response.text();
    throw new Error(`${material.id}: expected image, got ${contentType}: ${text.slice(0, 120)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 2048) throw new Error(`${material.id}: image response was too small`);
  await writeFile(outFile, buffer);
  return { id: material.id, fileName, bytes: buffer.length };
}

async function runQueue(items, options) {
  let cursor = 0;
  const results = [];
  async function worker() {
    while (cursor < items.length) {
      const material = items[cursor++];
      try {
        if (options.localFallbacks) await writeLocalFallback(material, options);
        if (options.skipApi) {
          results.push({ id: material.id, fileName: getFallbackFileName(material), localFallback: true });
          continue;
        }
        results.push(await generateIcon(material, options));
      } catch (error) {
        console.error(`failed ${material.id}: ${error.message}`);
        if (options.localFallbacks) await writeLocalFallback(material, options);
        results.push({ id: material.id, error: error.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(outDir, { recursive: true });
  let selected = materials.filter((material) => itemIconFiles[material.id]);
  if (options.items.length) {
    const requested = new Set(options.items.filter(Boolean));
    selected = materials.filter((material) => requested.has(material.id));
  } else if (options.all) {
    selected = materials;
  }
  if (options.limit > 0) selected = selected.slice(0, options.limit);
  if (!selected.length) {
    console.log('No matching icon materials selected.');
    return;
  }
  const results = await runQueue(selected, options);
  const failed = results.filter((result) => result.error);
  console.log(`\nDone: ${results.length - failed.length}/${results.length} icons ready in ${path.relative(root, outDir)}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
