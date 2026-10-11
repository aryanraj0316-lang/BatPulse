import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PALETTE } from '../constants/palette';

interface HUDProps {
  levelTitle: string;
  levelNumber: number;
  sonarRemaining: number;
  maxSonar: number;
  elapsedSeconds: number;
  momentum: number;
  isFrenzy: boolean;
  onPause: () => void;
  onRestart: () => void;
}

export const HUD: React.FC<HUDProps> = React.memo(
  ({
    levelTitle,
    levelNumber,
    sonarRemaining,
    maxSonar,
    elapsedSeconds,
    momentum,
    isFrenzy,
    onPause,
    onRestart,
  }) => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = Math.floor(elapsedSeconds % 60);
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const isInfinite = maxSonar >= 999;

    return (
      <View style={styles.container} pointerEvents="box-none">
        {/* Top Instrumentation Row */}
        <View style={[styles.headerBox, isFrenzy && styles.frenzyHeader]}>
          <View style={styles.titleColumn}>
            <Text style={styles.levelTag}>
              ECHO {levelNumber.toString().padStart(2, '0')}
            </Text>
            <Text style={styles.levelTitle} numberOfLines={1}>
              {levelTitle.toUpperCase()}
            </Text>
          </View>

          {/* Time Odometer */}
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>ELAPSED</Text>
            <Text style={styles.timeValue}>{timeFormatted}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.hudButton}
              onPress={onRestart}
              activeOpacity={0.7}
            >
              <Text style={styles.hudButtonText}>↺</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.hudButton}
              onPress={onPause}
              activeOpacity={0.7}
            >
              <Text style={styles.hudButtonText}>⏸</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Pulse Charge Gauge */}
        <View style={styles.gaugeContainer}>
          <View style={styles.gaugeHeader}>
            <Text style={[styles.gaugeTitle, isFrenzy && { color: PALETTE.wraithRed }]}>
              {isFrenzy ? '⚠ WRAITH IN FRENZY ⚠' : isInfinite ? 'SONAR: UNLIMITED' : `SONAR PULSES: ${sonarRemaining} / ${maxSonar}`}
            </Text>
            {momentum > 0 && (
              <Text style={styles.momentumLabel}>MOMENTUM ×{(1.0 + momentum * 0.1).toFixed(1)}</Text>
            )}
          </View>

          {/* Pulse Charge Nodes */}
          {!isInfinite && (
            <View style={styles.nodeBar}>
              {Array.from({ length: maxSonar }).map((_, i) => {
                const active = i < sonarRemaining;
                return (
                  <View
                    key={i}
                    style={[
                      styles.node,
                      {
                        backgroundColor: active ? PALETTE.sonarCyan : 'rgba(255,255,255,0.08)',
                        borderColor: active ? PALETTE.sonarCyan : 'transparent',
                        opacity: active ? 1.0 : 0.2,
                      },
                    ]}
                  />
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 44,
    left: 14,
    right: 14,
    zIndex: 100,
  },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8, 13, 20, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.15)',
  },
  frenzyHeader: {
    borderColor: PALETTE.wraithRed,
    backgroundColor: 'rgba(25, 4, 8, 0.9)',
  },
  titleColumn: {
    flex: 1,
  },
  levelTag: {
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.sonarCyan,
    letterSpacing: 2,
  },
  levelTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    letterSpacing: 1.5,
    marginTop: 1,
  },
  timeBox: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  timeLabel: {
    fontSize: 8,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  timeValue: {
    fontSize: 14,
    color: '#F8FAFC',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  hudButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudButtonText: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: 'bold',
  },
  gaugeContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(8, 13, 20, 0.75)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  gaugeTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: PALETTE.sonarCyan,
    letterSpacing: 1.5,
  },
  momentumLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: PALETTE.shardGold,
    letterSpacing: 1.2,
  },
  nodeBar: {
    flexDirection: 'row',
    gap: 4,
  },
  node: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    borderWidth: 0.5,
  },
});
