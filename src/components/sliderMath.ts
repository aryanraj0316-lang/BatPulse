/** Maps a touch x position inside a track of `width` px to a value in [min, max], snapped to `step`. */
export function sliderValueFromX(x: number, width: number, min: number, max: number, step: number): number {
  if (width <= 0) return min;
  const t = Math.min(1, Math.max(0, x / width));
  const raw = min + t * (max - min);
  const snapped = step > 0 ? Math.round(raw / step) * step : raw;
  return Math.min(max, Math.max(min, Math.round(snapped * 1000) / 1000));
}
