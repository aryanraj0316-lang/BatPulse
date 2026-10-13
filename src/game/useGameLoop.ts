import { useEffect, useRef } from 'react';
import { debugTimeScale, getDebugFlags } from '../debug/debugFlags';
import { GameSim } from '../sim/game';
import { TouchInput } from '../input/TouchInput';
import { FrameBus } from './frameBus';
import { Quality, QualityGovernor } from '../render/quality';

interface Options {
  sim: GameSim;
  input: TouchInput;
  bus: FrameBus;
  paused: boolean;
  /** Called about twice a second with the measured frame rate (debug FPS counter). */
  onFps?: (fps: number) => void;
  /** Watches frame times; `onQuality` fires once when it decides to drop to low quality. */
  governor?: QualityGovernor;
  onQuality?: (q: Quality) => void;
}

/**
 * requestAnimationFrame loop: feeds the stick into the sim, steps it, then asks the canvas to redraw.
 * While paused the sim is not stepped (so every timer freezes) and the clock is re-based on resume,
 * so there is never a catch-up jump.
 */
export function useGameLoop({ sim, input, bus, paused, onFps, governor, onQuality }: Options): void {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const fpsCb = useRef(onFps);
  fpsCb.current = onFps;
  const qualityCb = useRef(onQuality);
  qualityCb.current = onQuality;

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let frames = 0;
    let fpsSince = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (pausedRef.current) {
        last = null; // re-base after resume
        return;
      }
      if (last === null) {
        last = t;
        fpsSince = t;
        frames = 0;
        return;
      }
      const frameMs = t - last;
      const dt = (frameMs / 1000) * debugTimeScale(getDebugFlags());
      last = t;
      const dropped = governor?.sample(frameMs);
      if (dropped) qualityCb.current?.(dropped);
      sim.setInput(input.stick.x, input.stick.y);
      sim.step(dt);
      bus.emit();

      frames++;
      if (t - fpsSince >= 500) {
        fpsCb.current?.(Math.round((frames * 1000) / (t - fpsSince)));
        frames = 0;
        fpsSince = t;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim, input, bus, governor]);
}
