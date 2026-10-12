import { AudioBackend, AudioService, PlayerHandle } from '../audio/AudioService';
import { SoundKey } from '../assets/keys';

class FakePlayer implements PlayerHandle {
  volume = 1;
  loop = false;
  playing = false;
  restarts = 0;
  released = false;
  setVolume(v: number) {
    this.volume = v;
  }
  setLoop(l: boolean) {
    this.loop = l;
  }
  restart() {
    this.restarts++;
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  resume() {
    this.playing = true;
  }
  stop() {
    this.playing = false;
  }
  release() {
    this.released = true;
  }
}

const setup = (vol = { sfx: 0.8, music: 0.5 }) => {
  const players = new Map<SoundKey, FakePlayer[]>();
  const backend: AudioBackend = {
    async load(key, copies) {
      if (key === 'sfx_death') throw new Error('decode failed');
      const list = Array.from({ length: copies }, () => new FakePlayer());
      players.set(key, list);
      return list;
    },
  };
  let t = 1000;
  const volumes = { ...vol };
  const svc = new AudioService(backend, () => volumes, () => t);
  return { svc, players, volumes, advance: (ms: number) => (t += ms) };
};

describe('AudioService', () => {
  it('plays with sfx volume x gain', async () => {
    const { svc, players } = setup();
    await svc.preload(['sfx_ping']);
    expect(svc.play('sfx_ping', 0.5)).toBe(true);
    const p = players.get('sfx_ping')![0];
    expect(p.volume).toBeCloseTo(0.4);
    expect(p.restarts).toBe(1);
  });

  it('round-robins the pool so overlapping plays use different players', async () => {
    const { svc, players, advance } = setup();
    await svc.preload(['sfx_finish']);
    for (let i = 0; i < 3; i++) {
      svc.play('sfx_finish');
      advance(100);
    }
    expect(players.get('sfx_finish')!.map((p) => p.restarts)).toEqual([1, 1, 1]);
  });

  it('throttles very fast repeats of the same sound', async () => {
    const { svc, players, advance } = setup();
    await svc.preload(['sfx_ping']);
    expect(svc.play('sfx_ping')).toBe(true);
    advance(10);
    expect(svc.play('sfx_ping')).toBe(false);
    advance(100);
    expect(svc.play('sfx_ping')).toBe(true);
    expect(players.get('sfx_ping')!.reduce((n, p) => n + p.restarts, 0)).toBe(2);
  });

  it('is silent at zero volume', async () => {
    const { svc, volumes } = setup();
    await svc.preload(['sfx_ping']);
    volumes.sfx = 0;
    expect(svc.play('sfx_ping')).toBe(false);
  });

  it('a sound that fails to load is skipped, others still work', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { svc } = setup();
    await svc.preload(['sfx_death', 'sfx_hit']);
    expect(svc.isLoaded('sfx_death')).toBe(false);
    expect(svc.play('sfx_death')).toBe(false);
    expect(svc.play('sfx_hit')).toBe(true);
    warn.mockRestore();
  });

  it('a player that throws never propagates', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { svc, players } = setup();
    await svc.preload(['sfx_hit']);
    players.get('sfx_hit')![0].restart = () => {
      throw new Error('native crash');
    };
    expect(() => svc.play('sfx_hit')).not.toThrow();
    warn.mockRestore();
  });

  it('music loops, follows the music volume and respects pause/resume', async () => {
    const { svc, players, volumes } = setup();
    await svc.preload(['music_ambient'], 'music_ambient');
    const m = players.get('music_ambient')![0];
    expect(m.loop).toBe(true);
    svc.startMusic();
    expect(m.playing).toBe(true);
    expect(m.volume).toBe(0.5);
    volumes.music = 0.2;
    svc.refreshVolumes();
    expect(m.volume).toBe(0.2);
    svc.pauseAll();
    expect(m.playing).toBe(false);
    svc.resumeAll();
    expect(m.playing).toBe(true);
    svc.stopMusic();
    expect(m.playing).toBe(false);
  });

  it('nothing plays while paused (backgrounded)', async () => {
    const { svc } = setup();
    await svc.preload(['sfx_hit']);
    svc.pauseAll();
    expect(svc.play('sfx_hit')).toBe(false);
    svc.resumeAll();
    expect(svc.play('sfx_hit')).toBe(true);
  });

  it('music at zero volume stays paused', async () => {
    const { svc, players } = setup({ sfx: 1, music: 0 });
    await svc.preload(['music_ambient'], 'music_ambient');
    svc.startMusic();
    expect(players.get('music_ambient')![0].playing).toBe(false);
  });

  it('release frees every player', async () => {
    const { svc, players } = setup();
    await svc.preload(['sfx_ping']);
    svc.release();
    expect(players.get('sfx_ping')!.every((p) => p.released)).toBe(true);
    expect(svc.isLoaded('sfx_ping')).toBe(false);
  });
});

describe('AudioService.nudge (web autoplay unlock)', () => {
  it('re-applies music when it should be playing, and is a no-op otherwise', async () => {
    const { svc, players } = setup();
    await svc.preload(['music_ambient'], 'music_ambient');
    const m = players.get('music_ambient')![0];
    svc.nudge(); // music not requested yet
    expect(m.playing).toBe(false);
    svc.startMusic();
    m.playing = false; // the browser blocked it
    svc.nudge();
    expect(m.playing).toBe(true);
    svc.pauseAll();
    svc.nudge(); // paused: stays silent
    expect(m.playing).toBe(false);
  });
});
