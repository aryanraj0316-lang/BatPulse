import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Play, RotateCcw, House } from 'lucide-react-native';
import { ART } from '../render/art/kit';

interface PauseOverlayProps {
  levelNumber: number;
  levelTitle: string;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

export const PauseOverlay: React.FC<PauseOverlayProps> = ({ levelNumber, levelTitle, onResume, onRestart, onMenu }) => (
  <View style={styles.backdrop}>
    <View style={styles.card}>
      <Text style={styles.kicker}>ECHO {levelNumber}</Text>
      <Text style={styles.title}>PAUSED</Text>
      <Text style={styles.subtitle}>{levelTitle.toUpperCase()}</Text>

      <TouchableOpacity style={[styles.btn, styles.primary]} onPress={onResume} activeOpacity={0.8}>
        <Play size={18} color="#04121A" fill="#04121A" />
        <Text style={[styles.btnText, { color: '#04121A' }]}>RESUME</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={onRestart} activeOpacity={0.8}>
        <RotateCcw size={18} color={ART.cyan} />
        <Text style={styles.btnText}>RESTART</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={onMenu} activeOpacity={0.8}>
        <House size={18} color={ART.cyan} />
        <Text style={styles.btnText}>MENU</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(1, 3, 6, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  card: {
    width: 260,
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: 'rgba(77, 240, 255, 0.5)',
    backgroundColor: 'rgba(6, 12, 20, 0.95)',
    alignItems: 'center',
    shadowColor: ART.cyan,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  kicker: { color: ART.cyan, fontSize: 11, fontWeight: '700', letterSpacing: 3 },
  title: { color: '#F2F7FB', fontSize: 28, fontWeight: '800', letterSpacing: 4, marginTop: 4 },
  subtitle: { color: '#8FA3B8', fontSize: 11, letterSpacing: 2, marginTop: 2, marginBottom: 18 },
  btn: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(77, 240, 255, 0.35)',
    backgroundColor: 'rgba(77, 240, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  primary: { backgroundColor: ART.cyan, borderColor: ART.cyan },
  btnText: { color: ART.cyan, fontSize: 14, fontWeight: '800', letterSpacing: 2.5 },
});
