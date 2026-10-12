import { useEffect, useRef } from 'react';
import { debugTimeScale, getDebugFlags } from '../debug/debugFlags';
import { GameSim } from '../sim/game';
import { TouchInput } from '../input/TouchInput';
import { FrameBus } from './frameBus';

interface Options {
  sim: GameSim;
  input: TouchInput;
  bus: FrameBus;
  paused: boolean;
  /** Called about twice a second with the measured frame rate (debug FPS counter). */
  onFps?: (fps: number) => void;
}

/**
 * requestAnimationFrame loop: feeds the stick into the sim, steps it, then asks the canvas to redraw.
 * While paused the sim is not stepped (so every timer freezes) and the clock is re-based on resume,
 * so there is never a catch-up jump.
 */
export function useGameLoop({ sim, input, bus, paused, onFps }: Options): void {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const fpsCb = useRef(onFps);
  fpsCb.current = onFps;

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
      const dt = ((t - last) / 1000) * debugTimeScale(getDebugFlags());
      last = t;
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
  }, [sim, input, bus]);
}
