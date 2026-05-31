# Moonrock Crafter

Moonrock Crafter is now a PC-first HTML/CSS/JavaScript game about mining asteroid fields, unloading ore at a station, upgrading a ship, and pushing toward a very distant planet. Active gameplay uses canvas, while menus, HUD, dialogue, and debug tools use HTML/CSS overlays.

The project still keeps a mobile-landscape compatibility layer active while PC development continues, so future UI should be built once and checked against both desktop keyboard/mouse and mobile landscape touch layouts.

## Run Locally

From the project root:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:5177/
```

If port `5177` is already in use, the local server will try the next available port and print the URL.

You can also use any static web server from the project root:

```bash
python -m http.server 5177
```

Then open:

```text
http://127.0.0.1:5177/
```

The game uses ES modules, so opening `index.html` directly from the filesystem is not recommended.

## Platform Direction

- Primary target: PC browser, keyboard/mouse first.
- Secondary maintained target: mobile landscape, touch controls and safe-area support preserved.
- Desktop should keep the playfield clean: virtual joysticks and big touch buttons are hidden by default.
- Mobile landscape should remain functional: touch controls appear on coarse-pointer landscape devices or after touch input.
- Portrait rotate messaging is limited to coarse-pointer devices so desktop windows are not blocked.

Runtime platform attributes are set in `src/core/Game.js` on `document.documentElement`:

- `data-platform-target="pc"`
- `data-layout-profile="pc"` or `"mobile-landscape"`
- `data-input-mode="keyboard-mouse"` or `"touch"`
- `data-mobile-port="ready"`

When adding UI, default to PC sizing first, then add mobile-landscape overrides using these attributes or landscape/coarse-pointer media queries.

## File Structure

- `index.html` boots the canvas, UI root, and CSS.
- `src/main.js` creates the game instance.
- `src/core/` owns engine-level services: game loop, scenes, input, save, audio, and events.
- `src/scenes/` owns scene-specific orchestration and rendering.
- `src/entities/` owns canvas gameplay objects such as the ship, asteroids, pickups, rock islands, and station/island players.
- `src/effects/` owns visual effects and effect renderers, including ship smoke, burst particles, floating text, cargo-transfer icons, and mining laser reticles.
- `src/systems/` owns saveable game logic: inventory, materials, economy, dialogue, upgrades, research, navigation, islands, objectives, and achievements.
- `src/ui/` owns reusable DOM UI components and overlays.
- `src/data/` owns balance and content.
- `src/styles/` owns screen and component CSS.
- `assets/` is where final image and audio files should be swapped in later.

## Editing Content

- Materials: edit `src/data/materials.js`.
- Asteroids and drop tables: edit `src/data/asteroids.js`.
- Dialogue: edit `src/data/dialogue.js`.
- Upgrades: edit `src/data/upgrades.js`.
- GPS locations and scanner upgrades: edit `src/data/locations.js` and `src/data/scannerUpgrades.js`.
- Rock islands, island resources, and animals: edit `src/data/islands.js`, `src/data/islandResources.js`, and `src/data/animals.js`.
- Progression, zones, starter stats, and tuning: edit `src/data/gameBalance.js`.

Keep tuning in data files when possible. Systems should read data and apply rules; scenes should avoid hardcoded balance values.

## Visual Effects

Effects are split so visual tuning stays targeted:

- Ship smoke: `src/effects/ShipSmokeSimulation.js`.
- Generic burst particles: `src/effects/ParticleBurstSystem.js`.
- Floating reward/damage text: `src/effects/FloatingTextSystem.js`.
- Cargo dump icon arcs: `src/effects/CargoTransferEffectSystem.js`.
- Mining laser beam and PC aim reticle: `src/effects/MiningLaserRenderer.js`.
- Asteroid splitting rules: `src/systems/AsteroidFragmentationSystem.js`.

When changing VFX, prefer editing the matching effect module first. Scenes should call effect modules and avoid owning low-level particle, smoke, or reticle behavior.

## Progression Loop

The current prototype loop is:

1. Launch from the station.
2. Mine asteroids and collect minerals into run cargo.
3. Glide through the station beam to dump cargo into permanent storage and earn assay credits.
4. Spend credits, materials, and research on ship, mining, utility, and route upgrades.
5. Use the stronger and larger ship to reach farther distance rings and eventually the far planet signal.

## Placeholder Audio

`src/core/AudioManager.js` currently generates short WebAudio placeholder sounds. To replace them later:

1. Put sound effects in `assets/audio/sfx/`.
2. Put music or ambience in `assets/audio/music/`.
3. Register files through `AudioManager.registerSoundFile()`.
4. Replace generated tone calls with file playback behind the same public methods.

Keep public methods like `playButtonClick()`, `playMineralPickup()`, and `playPurchase()` stable so scenes do not care whether audio is generated or loaded from files.

## Placeholder Art

Most visuals are procedural canvas drawings or CSS shapes. Replace them gradually by domain:

- Station background and props: `src/scenes/station/StationSideScrollerRenderer.js`.
- Island backgrounds and props: `src/scenes/IslandScene.js` and island data files.
- Mining entities: `src/entities/Ship.js`, `src/entities/Asteroid.js`, and `src/entities/MineralPickup.js`.
- UI skins: `src/styles/ui.css` plus screen-specific CSS files.

Keep asset keys stable in data and systems so art can be swapped without rewriting gameplay logic.

## Debug Tools

Press `F2` or backtick, or tap the small `DEV` button, to open the debug panel. It can add resources, refill the ship, toggle invincibility, spawn rare asteroids during mining, jump home, unlock upgrades, and clear the save.

Debug state is saved with the game so test sessions can stay consistent.

## Save Data

Save data is stored in localStorage with a versioned envelope through `src/core/SaveManager.js`. Meaningful events trigger saves:

- docking after mining
- buying upgrades
- completing tutorial/objective steps
- changing settings
- manual saves

The current expedition prototype uses a fresh `moonrock-crafter-save-v3` key because the old shop/crafting save shape is no longer compatible with the new mining-and-upgrades loop.

## Performance Notes

- The main loop is centralized in `src/core/Game.js` and uses `requestAnimationFrame`.
- Mining uses object pools for pickups, particles, floating text, and asteroids.
- Mining despawns far-away objects and caps active asteroids/particles through `src/data/gameBalance.js`.
- HUD and dialogue DOM writes are cached so they update only when values change.
- Avoid saving or rebuilding UI inside frame loops.
