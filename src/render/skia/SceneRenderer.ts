import { PixelRatio } from 'react-native';
import { Skia, BlendMode, type SkCanvas, type SkImage, type SkPicture } from '@shopify/react-native-skia';
import {
  PlayerEntity,
  WraithEntity,
  EnvObject,
  Vec2,
  RevealZone,
  ImpactSpark,
  AmbientDust,
  GhostPoint,
} from '../../types/game';
import { GAME_CONFIG } from '../../constants/gameConfig';
import { HunterAI } from '../../engine/HunterAI';
import { LevelDecor } from '../art/decor';
import { ART, clamp, easeOutQuart } from '../art/kit';
import { fill, stroke, shaded, glow, linear, rect, svgPathOnce, G, beginAlpha, radial, radialAt } from './sk';
import { bake, paintBush, paintVine, drawSprite, drawKeyGlint, type Sprite } from './sprites';
import { bakeFloor, bakeBorder } from './layers/FloorLayer';
import { bakeWalls } from './layers/WallLayer';
import { drawFlatHazards, drawRaisedHazards } from './layers/HazardLayer';
import { drawLanternFixture, drawLanternLight, drawLanternWallTint, drawLanternFlicker, drawSonarFloorLight, drawVignette, drawBatAura } from './layers/LightingLayer';
import { drawGrateHQ } from './layers/HazardLayer';
import { drawVisionCone, drawSonarRings, drawSparksAndDust } from './layers/EntityLayer';
import { drawBatRig, type BatReactions } from './layers/bat';

export interface JoystickState {
  center: Vec2;
  knob: Vec2;
  active: boolean;
  radius: number;
}

/** Timestamps / levels that make the player bat react (visual only). */
export interface BatFx {
  pingAt: number;
  bumpAt: number;
  pickupAt: number;
  /** 0..1 how close an awake wraith is */
  fear: number;
}

export interface FrameState {
  now: number;
  player: PlayerEntity;
  wraiths: WraithEntity[];
  objects: EnvObject[];
  goal: Vec2 & { radius: number };
  revealZones: RevealZone[];
  sparks: ImpactSpark[];
  dust: AmbientDust[];
  ghostTrack?: GhostPoint[];
  isHunting: boolean;
  joystick: JoystickState | null;
  revealAll?: boolean;
  batFx?: BatFx;
}

/** How much of a reveal zone is open right now: radius + strength (0..1). */
export function zoneState(z: RevealZone, now: number) {
  const age = now - z.createdAt;
  const expand = GAME_CONFIG.SONAR_EXPAND_DURATION * 1000;
  const hold = GAME_CONFIG.REVEAL_HOLD_MS;
  const fade = GAME_CONFIG.REVEAL_FADE_MS;
  if (age < expand) return { r: z.maxRadius * easeOutQuart(age / expand), s: z.intensity, age };
  if (age < expand + hold) return { r: z.maxRadius, s: z.intensity, age };
  const k = clamp((age - expand - hold) / fade, 0, 1);
  return { r: z.maxRadius * (1 - 0.3 * k), s: z.intensity * Math.pow(1 - k, 1.3), age };
}

// Per-entity flight state: wingbeat phase, smoothed heading, banking, gliding.
type Motion = { phase: number; last: number; deg: number; bank: number; glide: number; fastFor: number; amp: number };
const motion = new WeakMap<object, Motion>();

/**
 * Advances one bat's flight animation.
 * `speedNorm` 0..1 = how fast it flies, `targetDeg` = where it is heading (null = keep facing).
 * Hovering: quick shallow beats. Flying: deeper, faster beats. Sustained top speed: short glides.
 * `excite` (0..1, e.g. fear) speeds the wingbeat up.
 */
function advance(obj: object, now: number, speedNorm: number, targetDeg: number | null, frenzy = false, excite = 0): Motion {
  let m = motion.get(obj);
  if (!m) {
    m = { phase: Math.random() * 6, last: now, deg: targetDeg ?? 0, bank: 0, glide: 0, fastFor: 0, amp: 0.6 };
    motion.set(obj, m);
  }
  const dt = clamp((now - m.last) / 1000, 0, 0.05);
  m.last = now;
  const v = clamp(speedNorm, 0, 1);

  let turnRate = 0;
  if (targetDeg !== null && dt > 0) {
    let diff = targetDeg - m.deg;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    const step = diff * (1 - Math.exp(-dt * 10));
    m.deg += step;
    turnRate = step / dt;
  }
  const bankTarget = clamp(turnRate / 260, -1, 1) * Math.min(1, v * 2);
  m.bank += (bankTarget - m.bank) * (1 - Math.exp(-dt * 8));

  m.fastFor = v > 0.85 && !frenzy ? m.fastFor + dt : 0;
  const glideOn = m.fastFor > 0.6 && (now / 1000) % 2.4 < 0.8 ? 1 : 0;
  m.glide += (glideOn - m.glide) * (1 - Math.exp(-dt * 6));

  // still: a slow, lazy wingbeat; flying: faster and deeper with speed
  const hz = (frenzy ? 8 : v < 0.08 ? 1.8 : 3.0 + 2.2 * v) * (1 + 0.3 * excite);
  const ampTarget = frenzy ? 1 : v < 0.08 ? 0.5 : 0.82 + 0.18 * v;
  m.amp += (ampTarget - m.amp) * (1 - Math.exp(-dt * 6));
  m.phase += dt * hz * Math.PI * 2 * (1 - 0.85 * m.glide);
  return m;
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/**
 * Renders the whole game scene with Skia, in this order:
 *   floor → water/border → flat hazards → wall shadows/facets/caps → moss/ivy → raised props
 *   → pickups/lasers → lantern + sonar light (additive) → vignette → darkness
 *   → (above the dark) sonar rings, sparks, enemy cones + bats, player aura + bat, joystick.
 * Static layers are baked once per level into two images (floor, walls).
 */
export class SceneRenderer {
  private floorImage: SkImage | null = null;
  private wallImage: SkImage | null = null;
  private bushSprites: (Sprite | null)[] = [];
  private vineSprites: (Sprite | null)[] = [];
  private recorder = Skia.PictureRecorder();
  private bounds;
  private holePaint = Skia.Paint();
  private darkPaint = Skia.Paint();
  private imagePaint = Skia.Paint();
  private ghostSrc: GhostPoint[] | null = null;
  private ghostPath: ReturnType<typeof svgPathOnce> = null;

  constructor(private decor: LevelDecor, private w: number, private h: number, seed = 1) {
    this.bounds = Skia.XYWHRect(0, 0, w, h);
    this.holePaint.setAntiAlias(true);
    this.holePaint.setBlendMode(BlendMode.DstOut);
    this.holePaint.setShader(G.hole());
    this.darkPaint.setColor(Skia.Color('#010205'));
    this.darkPaint.setAlphaf(GAME_CONFIG.DARKNESS_OPACITY);

    const scale = Math.min(2.5, Math.max(1, PixelRatio.get()));
    this.floorImage = this.bakeLayer(scale, false, (c) => {
      bakeFloor(c, decor, w, h, scale, seed);
      bakeBorder(c, decor, w, h);
      for (const pr of decor.props) if (pr.kind === 'grate') drawGrateHQ(c, pr.x, pr.y, pr.s, 0, pr.seed);
      drawLanternLight(c, decor, 0, 1); // warm pools on the floor (walls' shadows fall over them)
    });
    this.wallImage = this.bakeLayer(scale, true, (c) => {
      bakeWalls(c, decor, scale, seed);
      drawLanternWallTint(c, decor); // warm light on the stone, only where walls are
      for (const l of decor.lanterns) drawLanternFixture(c, l, 0);
    });
    this.bushSprites = decor.bushes.map((b) => bake(b.r * 1.35 + 4, scale, (c) => paintBush(c, b)));
    this.vineSprites = decor.vines.map((v) => bake(22, scale, (c) => paintVine(c, v)));
  }

  /** Paints a full-screen static layer once into an image (transparent background if asked). */
  private bakeLayer(scale: number, transparent: boolean, draw: (c: SkCanvas) => void): SkImage | null {
    const surface = Skia.Surface.Make(Math.ceil(this.w * scale), Math.ceil(this.h * scale));
    if (!surface) return null;
    const c = surface.getCanvas();
    c.clear(transparent ? Skia.Color('transparent') : Skia.Color('#06090D'));
    c.scale(scale, scale);
    draw(c);
    surface.flush();
    return surface.makeImageSnapshot();
  }

  private blit(c: SkCanvas, img: SkImage | null) {
    if (img) c.drawImageRect(img, rect(0, 0, img.width(), img.height()), this.bounds, this.imagePaint);
  }

  render(fs: FrameState): SkPicture {
    const c = this.recorder.beginRecording(this.bounds);
    const zones = fs.revealZones.map((z) => ({ z, ...zoneState(z, fs.now) }));
    this.drawWorld(c, fs, zones);
    if (!fs.revealAll) this.drawDarkness(c, fs, zones);
    this.drawAboveDark(c, fs, zones);
    if (fs.joystick) drawJoystick(c, fs.joystick);
    return this.recorder.finishRecordingAsPicture();
  }

  private drawWorld(c: SkCanvas, fs: FrameState, zones: { z: RevealZone; r: number; s: number; age: number }[]) {
    const { decor } = this;
    const t = fs.now;
    // 1–3: floor + border (baked), then flat hazards: water, grates, exit pad
    this.blit(c, this.floorImage);
    drawFlatHazards(c, decor, fs.objects, fs.goal, t);
    // 4–7: walls with shadows, facets, caps, moss, ivy, raised props, lanterns (baked)
    this.blit(c, this.wallImage);
    // 8: pickups + laser barriers
    drawRaisedHazards(c, fs.objects, t);
    // swaying corner shrubs / vines (baked sprites)
    decor.vines.forEach((v, i) => {
      const s = this.vineSprites[i];
      if (s) drawSprite(c, s, v.x, v.y, Math.sin(t * 0.0014 + v.phase) * 5);
    });
    decor.bushes.forEach((b, i) => {
      const s = this.bushSprites[i];
      if (s) drawSprite(c, s, b.x, b.y, Math.sin(t * 0.0011 + b.phase) * 2.4);
    });
    // 10: live light — a small flickering glow at each lantern + the sonar wash on the floor
    drawLanternFlicker(c, decor, t);
    drawSonarFloorLight(c, zones.map((q) => ({ z: q.z, r: q.r, a: q.s })), t);
    // 11: player-centred vignette
    drawVignette(c, fs.player.pos, this.w, this.h);
  }

  /** Darkness layer with soft holes punched out on the GPU (DstOut blend). */
  private drawDarkness(c: SkCanvas, fs: FrameState, zones: { z: RevealZone; r: number; s: number }[]) {
    const t = fs.now;
    c.saveLayer();
    c.drawRect(this.bounds, this.darkPaint);
    const hole = (x: number, y: number, r: number, a: number) => {
      if (r <= 1 || a <= 0.01) return;
      this.holePaint.setAlphaf(Math.min(1, a));
      c.save();
      c.translate(x, y);
      c.scale(r, r);
      c.drawCircle(0, 0, 1, this.holePaint);
      c.restore();
    };
    hole(fs.player.pos.x, fs.player.pos.y, GAME_CONFIG.PLAYER_AURA_RADIUS, GAME_CONFIG.PLAYER_AURA_STRENGTH * (0.92 + 0.08 * Math.sin(t * 0.003)));
    for (const q of zones) hole(q.z.x, q.z.y, q.r * 1.3, q.s);
    c.restore();
  }

  private drawAboveDark(c: SkCanvas, fs: FrameState, zones: { z: RevealZone; r: number; age: number }[]) {
    const t = fs.now;
    const { player } = fs;

    // Ghost of your best run (path built once per recorded track, not every frame)
    if (fs.ghostTrack && fs.ghostTrack.length > 1) {
      if (this.ghostSrc !== fs.ghostTrack) {
        this.ghostSrc = fs.ghostTrack;
        let d = '';
        for (let i = 0; i < fs.ghostTrack.length; i += 3) {
          const g = fs.ghostTrack[i];
          d += `${i === 0 ? 'M' : 'L'}${g.x.toFixed(1)},${g.y.toFixed(1)}`;
        }
        this.ghostPath = svgPathOnce(d);
      }
      if (this.ghostPath) c.drawPath(this.ghostPath, stroke(ART.cyanSoft, 1.2, 0.25, false, [2, 5]));
    }

    // a faint gold twinkle where the key lies, so it can be found in the dark
    if (!fs.revealAll) {
      const key = fs.objects.find((o) => o.type === 'key' && !o.collected);
      if (key) drawKeyGlint(c, key.x + key.width / 2, key.y + key.height / 2, t);
    }

    // Sonar rings
    drawSonarRings(
      c,
      zones.map((q) => ({ z: q.z, r: q.r, life: clamp(1 - q.age / (GAME_CONFIG.SONAR_EXPAND_DURATION * 1000 + 700), 0, 1) ** 1.3 })),
      t
    );
    drawSparksAndDust(c, fs.sparks, fs.dust);

    // Enemies: only visible right after a pulse reveals them
    for (const w of fs.wraiths) {
      const wsp = Math.hypot(w.velocity.x, w.velocity.y);
      const frenzy = w.state === 'FRENZY';
      // the AI owns where the enemy looks; cone + body are drawn exactly along it
      const look = (w.facing * 180) / Math.PI + 90;
      const m = advance(w, fs.now, wsp / 150, look, frenzy);
      const age = fs.now - (w.revealedAt || 0);
      const pingVis = !w.revealedAt || age > GAME_CONFIG.WRAITH_VISIBLE_MS ? 0 : age < 220 ? 1 : 1 - (age - 220) / (GAME_CONFIG.WRAITH_VISIBLE_MS - 220);
      // fades in out of the dark as the bat approaches (smooth, gets stronger the closer it is)
      const near = clamp(
        (GAME_CONFIG.WRAITH_FADE_START - Math.hypot(w.pos.x - player.pos.x, w.pos.y - player.pos.y)) /
          (GAME_CONFIG.WRAITH_FADE_START - GAME_CONFIG.WRAITH_FADE_FULL),
        0,
        1
      );
      const nearVis = near * near * (3 - 2 * near) * GAME_CONFIG.WRAITH_FADE_MAX;
      const vis = fs.revealAll ? 1 : Math.max(pingVis, nearVis);
      if (vis <= 0.01) continue;
      beginAlpha(c, vis);
      drawVisionCone(c, w.pos.x, w.pos.y, look, 1, t, frenzy);
      glow(c, G.red(), w.pos.x, w.pos.y, w.radius * 1.9, 0.6);
      drawBatRig(c, {
        key: w,
        x: w.pos.x,
        y: w.pos.y,
        deg: look,
        k: 0.82,
        phase: m.phase,
        t,
        variant: 'wraith',
        frenzy,
        bank: m.bank,
        amp: m.amp,
        glide: m.glide,
        speed: wsp / 150,
      });
      c.restore();
    }

    // Player: cyan aura on the floor + detailed reactive bat
    const fx = fs.batFx;
    const react: BatReactions = {
      pingK: fx ? easeOut(clamp(1 - (t - fx.pingAt) / 320, 0, 1)) : 0,
      bumpK: fx ? clamp(1 - (t - fx.bumpAt) / 300, 0, 1) : 0,
      pickupK: fx ? clamp(1 - (t - fx.pickupAt) / 700, 0, 1) : 0,
      fear: fx ? fx.fear : 0,
    };
    const speed = Math.hypot(player.velocity.x, player.velocity.y) / GAME_CONFIG.PLAYER_SPEED;
    const pm = advance(player, fs.now, speed, (player.rotation * 180) / Math.PI + 90, false, react.fear);
    drawBatAura(c, player.pos, t);
    drawBatRig(c, {
      key: player,
      x: player.pos.x,
      y: player.pos.y,
      deg: pm.deg,
      k: 0.92,
      phase: pm.phase,
      t,
      variant: 'player',
      bank: pm.bank,
      amp: pm.amp,
      glide: pm.glide,
      speed,
      react,
    });

    // Threat flare at the screen edge toward a nearby wraith
    for (const w of fs.wraiths) {
      const info = HunterAI.getDistortionInfo(w, player.pos, this.w, this.h);
      if (!info.active) continue;
      glow(c, G.red(), info.edgeX, info.edgeY, 30 + 50 * info.intensity, info.intensity * (0.6 + 0.25 * Math.sin(t * 0.012)));
    }

    // Being hunted: pulsing red vignette
    if (fs.isHunting) {
      const a = 0.55 + 0.35 * Math.sin(t * 0.008);
      const edge = (key: string, x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) =>
        c.drawRect(rect(rx, ry, rw, rh), shaded(linear(key, x0, y0, x1, y1, [[0, ART.wraithRed, 0.45], [1, ART.wraithRed, 0]]), a));
      const { w, h } = this;
      edge(`vT${w}`, 0, 0, 0, 70, 0, 0, w, 70);
      edge(`vB${h}`, 0, h, 0, h - 70, 0, h - 70, w, 70);
      edge('vL', 0, 0, 50, 0, 0, 0, 50, h);
      edge(`vR${w}`, w, 0, w - 50, 0, w - 50, 0, 50, h);
    }
  }
}

/** Metallic thumbstick in a dark glass ring with four direction chevrons. */
export function drawJoystick(c: SkCanvas, j: JoystickState) {
  const { center, knob, active } = j;
  const R = j.radius + 6;
  const mag = Math.hypot(knob.x, knob.y) / j.radius;
  const dirAngle = Math.atan2(knob.y, knob.x);
  beginAlpha(c, active ? 1 : 0.8);
  if (active) glow(c, G.cyan(), center.x, center.y, R * 1.35, 0.45);
  c.save();
  c.translate(center.x, center.y);
  c.scale(R, R);
  c.drawCircle(
    0,
    0,
    1,
    shaded(
      radialAt_('joyBase', [
        [0, '#1A2433', 0.55],
        [0.8, '#0A0F18', 0.75],
        [1, '#05080D', 0.85],
      ])
    )
  );
  c.restore();
  c.drawCircle(center.x, center.y, R, stroke(active ? ART.cyan : '#9FB2C6', 1.4, active ? 0.8 : 0.45));
  c.drawCircle(center.x, center.y, R - 5, stroke('#FFFFFF', 0.6, 0.12));
  const arrows = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  for (const a of arrows) {
    let diff = Math.abs(a - dirAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const lit = active && mag > 0.25 && diff < Math.PI / 4;
    const ax = center.x + Math.cos(a) * (R - 11);
    const ay = center.y + Math.sin(a) * (R - 11);
    const tri = svgPathOnce('M-4.5,2.2L0,-2.6L4.5,2.2Z');
    if (!tri) continue;
    c.save();
    c.translate(ax, ay);
    c.rotate((a * 180) / Math.PI + 90, 0, 0);
    c.drawPath(tri, fill(lit ? ART.cyan : '#C9D3DD', lit ? 1 : 0.55));
    c.restore();
  }
  const kx = center.x + knob.x;
  const ky = center.y + knob.y;
  c.drawCircle(kx + 2, ky + 4, 21, fill('#000000', 0.45));
  c.save();
  c.translate(kx, ky);
  c.drawCircle(0, 0, 21, shaded(linearKnob()));
  c.restore();
  c.drawCircle(kx, ky, 15, stroke('#2A2F36', 0.8, 0.5));
  c.drawCircle(kx, ky, 21, stroke(active ? ART.cyan : '#D7DEE5', 1, active ? 0.7 : 0.4));
  c.save();
  c.translate(kx - 6, ky - 7);
  c.rotate(-30, 0, 0);
  c.drawOval(rect(-6, -3.5, 12, 7), fill('#FFFFFF', 0.35));
  c.restore();
  c.restore();
}

const radialAt_ = (key: string, stops: [number, string, number][]) => radial(key, stops);
const linearKnob = () =>
  radialAt('joyKnob', -8, -7, 30, [
    [0, '#F1F4F7', 1],
    [0.45, '#8A939D', 1],
    [1, '#2A2F36', 1],
  ]);

