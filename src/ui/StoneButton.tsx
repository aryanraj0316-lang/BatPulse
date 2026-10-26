import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, Text, StyleSheet, Animated, Easing, LayoutChangeEvent, ViewStyle } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { UI } from './theme';

interface StoneButtonProps {
  label: string;
  onPress?: () => void;
  /** 'primary' = glowing cyan call to action; 'stone' = carved slate; 'gold' = reward/purchase */
  variant?: 'primary' | 'stone' | 'gold';
  /** small icon component (lucide) shown on the left */
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  /** smaller muted text after the label, e.g. "(100 shards)" */
  note?: string;
  height?: number;
  disabled?: boolean;
  style?: ViewStyle;
  trailing?: string;
}

/** Angled, carved-stone menu button. Shape and bevels are drawn in SVG to fit any width. */
export const StoneButton: React.FC<StoneButtonProps> = ({
  label,
  onPress,
  variant = 'stone',
  icon: Icon,
  note,
  height,
  disabled,
  style,
  trailing,
}) => {
  const h = height ?? (variant === 'primary' ? 58 : 50);
  const [w, setW] = useState(0);
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (variant !== 'primary') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [variant, glow]);

  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const a = h * 0.34; // angled end depth
  const shape = (inset: number) =>
    `M${a + inset},${inset}H${w - a - inset}L${w - inset},${h / 2}L${w - a - inset},${h - inset}H${a + inset}L${inset},${h / 2}Z`;

  const isPrimary = variant === 'primary';
  const isGold = variant === 'gold';
  const accent = isPrimary ? UI.color.cyan : isGold ? UI.color.gold : UI.color.stoneEdge;
  const labelColor = disabled ? UI.color.textFaint : isPrimary ? '#E8FBFF' : isGold ? '#FFE9B8' : UI.color.text;
  const iconColor = disabled ? UI.color.textFaint : isPrimary ? UI.color.cyan : isGold ? UI.color.gold : UI.color.textDim;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={[{ height: h, opacity: disabled ? 0.55 : 1 }, style]} onLayout={onLayout}>
      {({ pressed }) => (
        <View style={[StyleSheet.absoluteFill, { transform: [{ scale: pressed ? 0.975 : 1 }] }]}>
          {w > 0 && (
            <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="sbFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={isPrimary ? '#0E3443' : isGold ? '#3A2C12' : UI.color.stoneTop} />
                  <Stop offset="1" stopColor={isPrimary ? '#051419' : isGold ? '#160F05' : UI.color.stoneBottom} />
                </LinearGradient>
                <LinearGradient id="sbSheen" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.1} />
                  <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {/* drop shadow */}
              <G transform="translate(0,3)">
                <Path d={shape(1)} fill="#000000" opacity={0.55} />
              </G>
              <Path d={shape(1)} fill="url(#sbFill)" />
              <Path d={shape(1)} fill="url(#sbSheen)" />
              {/* chiselled double edge */}
              <Path d={shape(1)} fill="none" stroke={UI.color.stoneEdgeDark} strokeWidth={2} />
              <Path d={shape(2.5)} fill="none" stroke={accent} strokeWidth={isPrimary ? 1.6 : 1} strokeOpacity={isPrimary ? 0.95 : 0.8} />
              <Path d={shape(6)} fill="none" stroke={isPrimary ? UI.color.cyan : '#000000'} strokeWidth={1} strokeOpacity={isPrimary ? 0.35 : 0.45} />
              {/* top bevel highlight */}
              <Path d={`M${a + 3},3.5H${w - a - 3}`} stroke="#FFFFFF" strokeWidth={0.8} strokeOpacity={isPrimary ? 0.3 : 0.16} />
              {/* end-cap diamonds */}
              {(isPrimary || isGold) && (
                <>
                  <Path d={`M${3},${h / 2}l${a * 0.45},-${a * 0.45}l${a * 0.45},${a * 0.45}l-${a * 0.45},${a * 0.45}Z`} fill="none" stroke={accent} strokeWidth={1.2} />
                  <Path d={`M${w - 3},${h / 2}l-${a * 0.45},-${a * 0.45}l-${a * 0.45},${a * 0.45}l${a * 0.45},${a * 0.45}Z`} fill="none" stroke={accent} strokeWidth={1.2} />
                </>
              )}
            </Svg>
          )}
          {/* breathing outer glow for the main call to action */}
          {isPrimary && w > 0 && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }) }]}>
              <Svg width={w} height={h}>
                <Path d={shape(1)} fill="none" stroke={UI.color.cyan} strokeWidth={5} strokeOpacity={0.35} />
                <Path d={shape(-1)} fill="none" stroke={UI.color.cyan} strokeWidth={2} strokeOpacity={0.5} />
              </Svg>
            </Animated.View>
          )}
          <View style={[styles.content, { paddingHorizontal: a + 10 }]}>
            {Icon && (
              <View style={styles.iconSlot}>
                <Icon size={isPrimary ? 20 : 18} color={iconColor} strokeWidth={1.8} />
              </View>
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  color: labelColor,
                  fontSize: isPrimary ? 17 : 13.5,
                  letterSpacing: isPrimary ? 4 : 2.6,
                  textAlign: Icon ? 'left' : 'center',
                  flex: Icon ? 1 : undefined,
                },
                isPrimary && { textShadowColor: UI.color.cyan, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
              ]}
            >
              {label}
              {note ? <Text style={styles.note}>{`  ${note}`}</Text> : null}
            </Text>
            {(isPrimary || trailing) && <Text style={[styles.trailing, { color: isPrimary ? UI.color.cyan : UI.color.textDim }]}>{trailing ?? '▶'}</Text>}
          </View>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  content: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    width: 30,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: UI.font.label,
  },
  note: {
    fontFamily: UI.font.tech,
    fontSize: 12,
    letterSpacing: 1,
    color: UI.color.textDim,
  },
  trailing: {
    fontSize: 13,
    marginLeft: 12,
  },
});
