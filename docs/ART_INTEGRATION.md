# Final art and audio integration

Everything the game draws or plays is requested by a **key** (`src/assets/keys.ts`) from the `AssetRegistry`. Placeholders are
registered at startup; final assets replace them **by key, one at a time**, without touching gameplay code.

## How to add a piece

1. Put the file under `assets/art/` (images) or `assets/audio/` (sounds).
2. Add one line to **`src/assets/finalAssets.ts`** (the only file to edit):

```ts
FINAL_VISUALS.bat_rookie = { frames: [require('../../assets/art/bat_rookie_0.png'), require('../../assets/art/bat_rookie_1.png')] };
FINAL_VISUALS.spike      = { frames: [require('../../assets/art/spike.png')], fit: 'stretch' };
FINAL_SOUNDS.sfx_ping    = require('../../assets/audio/ping.ogg');
```

3. Anything not listed keeps its placeholder. A misspelled key is reported in the log and ignored; it never breaks startup.
4. `npx jest finalAssets assets registryRouting` must stay green.

`frames` has one image, or two for a wing flap (frame 0 / frame 1, identical size and centre). `fit` is `contain` (default, keeps
proportions), `cover` or `stretch` (fills the object's box exactly, for things that are drawn at many sizes).

Images are drawn centred on the object, rotated by its heading, with the sonar glow applied as brightness (an unlit object
is transparent, a freshly pinged one is fully visible). Draw them on a **transparent** background.

## Visual spec (author at about 4x the in-game size for sharp phones)

| Key | In-game size (world units; 1 unit is about 1 px on a 390 px wide phone) | Notes |
|---|---|---|
| `bat_rookie`, `bat_vesper`, `bat_sonarbot`, `bat_phantom`, `bat_turbo` | 34 x 34 | Top-down, nose pointing **up**. Two frames: wings up / wings down. Also shown at 92 px in the shop, so keep detail readable. |
| `key_item` | 24 x 24 | The hidden key. Shown only while a pulse lights it. |
| `locked_door` | same boxes as `door` (40 to 100 x 20 to 80) | A door that needs a key: must look clearly different from `door` (a padlock in the placeholder). `active` = unlocked (open); no countdown ring. |
| `safe_zone` | 60 x 60 (3 x 3 tiles; any size of at least 36 x 36) | Always faintly visible. `active` = the bat is hiding in it, `progress` = share of the stay left (1 to 0), a low `glow` = the zone is resting. |
| `enemy_hunter` | 32 x 32 | Top-down, facing up. Must read as dangerous at a glance; shown for 1 s when a pulse hits it. |
| `wall_normal`, `wall_crystal`, `wall_mossy` | any rectangle (20 to 400 wide) | Stretched to the wall piece. Prefer keeping walls as vector styles (`registerWallStyle`) unless the art is a seamless stretchable edge. |
| `spike` | usually 60 x 20 (some 40 x 20 or 40 x 40), stretched to the hazard | Reads as "touching this kills". |
| `hazard_slider` | 60 x 24 | Moves along a track. |
| `hazard_blade` | 70 to 110 square (mostly 110) | Spins; the game rotates the image. |
| `switch` | 28 x 28 | Two looks are needed in future (off / on): today `active` only changes brightness. |
| `door` | 40 to 100 x 20 to 80 (mostly 100 x 40, 60 x 40 or 40 x 80) | Has a countdown ring in the placeholder; final art can ignore `progress` or fade with it. |
| `pickup_charge` | 20 x 20 | Sonar charge. |
| `finish` | 36 x 36 | The goal ring. |
| `checkpoint` | 34 x 34 | Always faintly visible, bright when reached. |
| `pulse_wave` | scaled to 2x the pulse radius (300 to 900) | **Not drawn right now**: the player only sees the walls it lights up, not the ring. Kept in the registry so art can be shown again by drawing it in `GameView` (see the comment where the wave used to be drawn). |
| `sound_marker` | 56 x 56 | Faint ring showing where a noise was made. |
| `escape_wall` | level width x 1800 | A wall of darkness: soft top edge, solid below. Always visible on escape levels. |

## Audio spec

| Key | Role | Length | Notes |
|---|---|---|---|
| `sfx_ping` | the player's pulse | 0.2 to 0.6 s | Short and clean: the game adds the cave echo itself (3 quieter repeats), so **do not bake reverb into the file**. Plays up to 5 at once. |
| `sfx_hit` | wall bump | under 0.3 s | |
| `sfx_death` | caught or killed | 0.5 to 1 s | |
| `sfx_finish` | level complete (also used when buying a bat) | 0.8 to 1.5 s | |
| `sfx_switch` | switch, checkpoint, pickup, "no charge" | under 0.3 s | Reused for four events today. A dedicated pickup/checkpoint sound is a good first addition: add the key to `keys.ts`, `feedback.ts` and a placeholder. |
| `sfx_door` | door opens / closes | 0.3 to 0.8 s | |
| `sfx_enemy_alert` | a hunter heard you | 0.4 to 1 s | Must be unmistakable. |
| `sfx_heartbeat` | a hunter is near | under 0.8 s | One beat; the game repeats it and raises the volume with the threat. |
| `music_ambient` | background loop | 30 s or longer, seamless loop | Quiet and low in the mix; the game must stay playable with headphones. |

Format: `.ogg`, `.m4a` or `.wav` (44.1 kHz). Mono for effects. Peak at about -3 dBFS and similar loudness across effects;
volumes are set by the player's sliders. Keep the whole audio folder under 10 MB (install size budget: 60 MB).

The mapping from events to sounds and vibrations is one table: `src/game/feedback.ts`.

## Brand images

`assets/icon.png` (1024), `assets/adaptive-icon.png` (1024, transparent, keep the picture inside the central 66 %),
`assets/splash-icon.png` (512) and `assets/favicon.png` (48) are **generated placeholders** (`node tools/makeIcons.js`).
Replace the files with final art using the same names and sizes; `release.test.ts` checks the sizes. After changing them run
`npx expo prebuild --platform android` to refresh the launcher icons in the native project.
