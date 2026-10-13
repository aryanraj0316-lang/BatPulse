import React from 'react';
import { G, Image as SvgImage } from 'react-native-svg';
import type { ImageSourcePropType } from 'react-native';
import type { VisualComponent, VisualProps } from './AssetRegistry';

export interface ImageVisualSpec {
  /** One image, or two for a wing-flap (frame 0, frame 1). Same size, centred on the object. */
  frames: ImageSourcePropType[];
  /** contain = keep proportions (default), cover = fill and crop, stretch = fill exactly. */
  fit?: 'contain' | 'cover' | 'stretch';
}

/** Which image to show: the second one only when there is one and the object asks for frame 1. */
export const frameIndex = (frameCount: number, frame: 0 | 1 | undefined): number => (frame === 1 && frameCount > 1 ? 1 : 0);

const ASPECT = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', stretch: 'none' } as const;

/**
 * Turns artwork into a registry visual with the same props contract as the placeholders (centre position,
 * size, rotation, glow as brightness, wing frame), so a drawn asset replaces a placeholder without touching gameplay code.
 */
export function imageVisual(spec: ImageVisualSpec, name = 'ImageVisual'): VisualComponent {
  if (!spec.frames.length) throw new Error('imageVisual: at least one image is required');
  const aspect = ASPECT[spec.fit ?? 'contain'];
  const Visual: React.FC<VisualProps> = ({ x, y, width, height, rotation = 0, frame, glow }) => (
    <G transform={`translate(${x} ${y}) rotate(${rotation})`} opacity={glow === undefined ? 1 : Math.min(1, Math.max(0, glow))}>
      <SvgImage href={spec.frames[frameIndex(spec.frames.length, frame)]} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio={aspect} />
    </G>
  );
  Visual.displayName = name;
  return Visual;
}
