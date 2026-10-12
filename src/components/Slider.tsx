import React, { useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { PALETTE } from '../constants/palette';

/** Maps a touch x position inside a track of `width` px to a value in [min, max], snapped to `step`. */
export function sliderValueFromX(x: number, width: number, min: number, max: number, step: number): number {
  if (width <= 0) return min;
  const t = Math.min(1, Math.max(0, x / width));
  const raw = min + t * (max - min);
  const snapped = step > 0 ? Math.round(raw / step) * step : raw;
  return Math.min(max, Math.max(min, Math.round(snapped * 1000) / 1000));
}

interface Props {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  /** Fires when the thumb is lifted (e.g. to play a preview sound). */
  onRelease?: () => void;
  testID?: string;
}

/** Minimal touch slider (no extra dependency). */
export const Slider: React.FC<Props> = ({ value, min = 0, max = 1, step = 0.05, onChange, onRelease, testID }) => {
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);
  const t = max > min ? (value - min) / (max - min) : 0;

  const handle = (e: GestureResponderEvent) => {
    const touch = e.nativeEvent.changedTouches?.[0];
    const x = touch ? touch.locationX : e.nativeEvent.locationX;
    onChange(sliderValueFromX(x, width, min, max, step));
  };

  return (
    <View
      testID={testID}
      style={styles.hit}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        dragging.current = true;
        handle(e);
      }}
      onResponderMove={handle}
      onResponderRelease={() => {
        dragging.current = false;
        onRelease?.();
      }}
      onResponderTerminate={() => {
        dragging.current = false;
      }}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${t * 100}%` }]} />
      </View>
      <View style={[styles.thumb, { left: `${t * 100}%` }]} pointerEvents="none" />
    </View>
  );
};

const styles = StyleSheet.create({
  hit: { height: 36, justifyContent: 'center', minWidth: 140, flex: 1, marginLeft: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: PALETTE.sonarCyan },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: PALETTE.sonarCyan,
  },
});
