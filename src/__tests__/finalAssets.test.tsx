import React from 'react';
import { SOUND_KEYS, VISUAL_KEYS } from '../assets/keys';
import { AssetRegistry, VisualProps } from '../assets/AssetRegistry';
import { FINAL_SOUNDS, FINAL_VISUALS, registerFinalAssets } from '../assets/finalAssets';
import { frameIndex, imageVisual } from '../assets/imageVisual';

jest.mock('react-native-svg', () => {
  const stub = () => null;
  return new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : stub) });
});

// eslint-disable-next-line import/first
import { registerPlaceholderAssets } from '../assets/placeholders/visuals';

const props = (over: Partial<VisualProps> = {}): VisualProps => ({ x: 100, y: 200, width: 40, height: 30, ...over });
/** Calls a visual as a function and returns the element it draws. */
const draw = (C: React.ComponentType<VisualProps>, p: VisualProps) => (C as unknown as (p: VisualProps) => React.ReactElement<any>)(p);

describe('imageVisual', () => {
  it('draws the image centred on the object, rotated, with glow as brightness', () => {
    const V = imageVisual({ frames: [1] });
    const el = draw(V, props({ rotation: 30, glow: 0.4 }));
    expect(el.props.transform).toBe('translate(100 200) rotate(30)');
    expect(el.props.opacity).toBe(0.4);
    const img = (el.props.children as React.ReactElement<any>).props;
    expect(img).toMatchObject({ href: 1, x: -20, y: -15, width: 40, height: 30, preserveAspectRatio: 'xMidYMid meet' });
  });

  it('is fully visible when glow is not given, and glow is clamped to 0..1', () => {
    const V = imageVisual({ frames: [1] });
    expect(draw(V, props()).props.opacity).toBe(1);
    expect(draw(V, props({ glow: 5 })).props.opacity).toBe(1);
    expect(draw(V, props({ glow: -2 })).props.opacity).toBe(0);
  });

  it('wing flap picks the second image only when there is one', () => {
    expect(frameIndex(2, 1)).toBe(1);
    expect(frameIndex(2, 0)).toBe(0);
    expect(frameIndex(2, undefined)).toBe(0);
    expect(frameIndex(1, 1)).toBe(0); // one image: always that one
    const V = imageVisual({ frames: [10, 20] });
    expect((draw(V, props({ frame: 1 })).props.children as React.ReactElement<any>).props.href).toBe(20);
    expect((draw(V, props({ frame: 0 })).props.children as React.ReactElement<any>).props.href).toBe(10);
  });

  it('fit modes map to the SVG aspect settings', () => {
    const aspect = (fit?: 'contain' | 'cover' | 'stretch') => (draw(imageVisual({ frames: [1], fit }), props()).props.children as React.ReactElement<any>).props.preserveAspectRatio;
    expect(aspect()).toBe('xMidYMid meet');
    expect(aspect('cover')).toBe('xMidYMid slice');
    expect(aspect('stretch')).toBe('none');
  });

  it('refuses an empty list of images and names the component for debugging', () => {
    expect(() => imageVisual({ frames: [] })).toThrow(/at least one image/);
    expect(imageVisual({ frames: [1] }, 'Final(spike)').displayName).toBe('Final(spike)');
  });
});

describe('registerFinalAssets', () => {
  beforeEach(() => {
    AssetRegistry.clear();
    registerPlaceholderAssets();
  });

  it('ships with nothing to replace: the placeholders stay', () => {
    expect(Object.keys(FINAL_VISUALS)).toEqual([]);
    expect(Object.keys(FINAL_SOUNDS)).toEqual([]);
    const before = AssetRegistry.getVisual('spike');
    expect(registerFinalAssets()).toEqual({ visuals: [], sounds: [], unknown: [] });
    expect(AssetRegistry.getVisual('spike')).toBe(before);
    expect(AssetRegistry.missing()).toEqual([]);
  });

  it('a delivered visual replaces only its own placeholder', () => {
    const placeholderBat = AssetRegistry.getVisual('bat_rookie');
    const placeholderSpike = AssetRegistry.getVisual('spike');
    const report = registerFinalAssets({ spike: { frames: [7] } }, {});
    expect(report.visuals).toEqual(['spike']);
    expect(AssetRegistry.getVisual('spike')).not.toBe(placeholderSpike);
    expect(AssetRegistry.getVisual('spike').displayName).toBe('Final(spike)');
    expect(AssetRegistry.getVisual('bat_rookie')).toBe(placeholderBat);
    expect(AssetRegistry.missing()).toEqual([]);
  });

  it('a delivered sound file replaces the synthesized placeholder', () => {
    expect(AssetRegistry.getSound('sfx_ping').kind).toBe('synth');
    const report = registerFinalAssets({}, { sfx_ping: 42, music_ambient: { uri: 'https://x/m.ogg' } });
    expect(report.sounds).toEqual(['sfx_ping', 'music_ambient']);
    expect(AssetRegistry.getSound('sfx_ping')).toEqual({ kind: 'file', source: 42 });
    expect(AssetRegistry.getSound('music_ambient')).toEqual({ kind: 'file', source: { uri: 'https://x/m.ogg' } });
    expect(AssetRegistry.getSound('sfx_hit').kind).toBe('synth');
  });

  it('an unknown key is reported and ignored, never fatal', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const report = registerFinalAssets({ spikee: { frames: [1] } }, { sfx_pingg: 1 });
    expect(report).toEqual({ visuals: [], sounds: [], unknown: ['spikee', 'sfx_pingg'] });
    expect(warn).toHaveBeenCalled();
    expect(AssetRegistry.missing()).toEqual([]);
    warn.mockRestore();
  });

  it('every key in the game can be replaced (all visuals and sounds)', () => {
    const visuals = Object.fromEntries(VISUAL_KEYS.map((k) => [k, { frames: [1] }]));
    const sounds = Object.fromEntries(SOUND_KEYS.map((k) => [k, 1]));
    const report = registerFinalAssets(visuals, sounds);
    expect(report.visuals).toHaveLength(VISUAL_KEYS.length);
    expect(report.sounds).toHaveLength(SOUND_KEYS.length);
    expect(report.unknown).toEqual([]);
    expect(AssetRegistry.missing()).toEqual([]);
  });
});
