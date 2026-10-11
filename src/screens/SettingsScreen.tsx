import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { PALETTE } from '../constants/palette';
import { useSettingsStore } from '../state/settingsStore';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const {
    soundEnabled,
    hapticsEnabled,
    floatingJoystick,
    setSoundEnabled,
    setHapticsEnabled,
    setFloatingJoystick,
  } = useSettingsStore();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>CALIBRATION</Text>
          <Text style={styles.subtitle}>ACOUSTIC SENSOR SETTINGS</Text>
        </View>

        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
        {/* Sensory Feedback Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SENSORY FEEDBACK</Text>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.label}>Directional Spatial Audio</Text>
              <Text style={styles.sublabel}>Positional stereo return echoes & Wraith drone</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: '#334155', true: PALETTE.sonarCyan }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.label}>Tactile Micro-Haptics</Text>
              <Text style={styles.sublabel}>Light impact ticks on sonar bursts and wall bumps</Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: '#334155', true: PALETTE.sonarCyan }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Controller Setup Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONTROLLER CALIBRATION</Text>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.label}>Floating Origin Joystick</Text>
              <Text style={styles.sublabel}>Appears dynamically where your thumb touches</Text>
            </View>
            <Switch
              value={floatingJoystick}
              onValueChange={setFloatingJoystick}
              trackColor={{ false: '#334155', true: PALETTE.sonarCyan }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.voidBlack,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  backBtnText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
  },
  headerCenter: {
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: PALETTE.sonarCyan,
    letterSpacing: 1.5,
  },
  scrollList: {
    paddingHorizontal: 20,
    gap: 16,
  },
  section: {
    backgroundColor: 'rgba(8, 13, 22, 0.7)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: PALETTE.sonarCyan,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  sublabel: {
    fontSize: 10,
    color: '#94A3B8',
  },
});
