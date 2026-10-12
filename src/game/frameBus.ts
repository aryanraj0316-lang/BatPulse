/**
 * Tiny publish/subscribe used to redraw the canvas every frame without re-rendering the whole screen.
 * The game loop emits once per frame; only components that subscribed update.
 */
export class FrameBus {
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}
