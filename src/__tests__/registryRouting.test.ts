import * as fs from 'fs';
import * as path from 'path';

/**
 * Enforces the AssetRegistry rule: all game art and sound is fetched BY KEY. Gameplay and rendering code
 * must never draw shapes or build sounds itself, so that final assets can replace placeholders with
 * zero code changes elsewhere.
 */
const SRC = path.join(__dirname, '..');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');
const files = walk(SRC);

describe('AssetRegistry routing', () => {
  // The only files allowed to draw primitives are the placeholder art itself and menu/debug UI that is not game art.
  const MAY_USE_SVG = ['assets/placeholders/visuals.tsx', 'render/GameView.tsx', 'debug/DebugOverlay.tsx', 'screens/HomeScreen.tsx'];

  it('gameplay rendering does not import svg primitives directly', () => {
    const offenders = files
      .filter((f) => /^(render|sim|screens\/GameScreen|components\/(Controls|Overlays|HUD))/.test(rel(f)))
      .filter((f) => !MAY_USE_SVG.includes(rel(f)))
      .filter((f) => /from 'react-native-svg'/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('GameView draws only through AssetRegistry (no raw shapes of its own)', () => {
    const src = fs.readFileSync(path.join(SRC, 'render/GameView.tsx'), 'utf8');
    expect(src).toMatch(/AssetRegistry\.getVisual/);
    // only the container primitives (Svg, G) and the 1px keep-alive Rect are allowed
    expect(src).not.toMatch(/<(Circle|Path|Polygon|Line|Ellipse)\b/);
  });

  it('every world visual used by the renderer is a registered key', () => {
    const { VISUAL_KEYS } = require('../assets/keys');
    const src = fs.readFileSync(path.join(SRC, 'render/GameView.tsx'), 'utf8');
    for (const k of src.match(/'(wall_\w+|spike|finish|pulse_wave|bat_\w+)'/g) ?? []) {
      expect(VISUAL_KEYS).toContain(k.replace(/'/g, ''));
    }
  });

  it('sound is only played by key through the audio service (no raw Audio/AudioContext in game code)', () => {
    const offenders = files
      .filter((f) => !['audio/ExpoAudioBackend.ts', 'assets/sound/synth.ts'].includes(rel(f)))
      .filter((f) => /new Audio\(|AudioContext|createAudioPlayer\(/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map(rel)).toEqual([]);
  });
});
