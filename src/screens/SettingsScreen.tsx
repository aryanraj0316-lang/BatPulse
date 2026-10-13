import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { PALETTE } from '../constants/palette';
import { useSettingsStore } from '../state/settingsStore';
import { Slider } from '../components/Slider';
import { audio } from '../audio';
import { GRAPHICS_SETTINGS } from '../render/quality';
import { cloudSync } from '../cloud';
import { syncStatusText } from '../cloud/CloudSync';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const st = useSettingsStore();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7} testID="btn-settings-back">
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>SETTINGS</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AUDIO</Text>
          <View style={styles.settingRow}>
            <Text style={styles.label}>Effects volume</Text>
            <Slider
              testID="slider-sfx"
              value={st.sfxVolume}
              onChange={st.setSfxVolume}
              onRelease={() => audio.play('sfx_ping')}
            />
            <Text style={styles.value}>{Math.round(st.sfxVolume * 100)}%</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.label}>Music volume</Text>
            <Slider
              testID="slider-music"
              value={st.musicVolume}
              onChange={(v) => {
                st.setMusicVolume(v);
                audio.refreshVolumes();
              }}
            />
            <Text style={styles.value}>{Math.round(st.musicVolume * 100)}%</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DISPLAY</Text>
          <View style={styles.settingRow}>
            <Text style={styles.label}>Brightness</Text>
            <Slider testID="slider-brightness" value={st.brightness} min={0.5} max={1.5} step={0.05} onChange={st.setBrightness} />
            <Text style={styles.value}>{Math.round(st.brightness * 100)}%</Text>
          </View>
          <Text style={styles.sublabel}>Scales how brightly pulses light up the world.</Text>
        </View>

        <CloudSaveSection />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FEEDBACK & CONTROLS</Text>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Haptics</Text>
              <Text style={styles.sublabel}>Vibration on pulses, wall hits and deaths</Text>
            </View>
            <Switch
              testID="switch-haptics"
              value={st.hapticsEnabled}
              onValueChange={st.setHapticsEnabled}
              trackColor={{ false: '#334155', true: PALETTE.sonarCyan }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Cave echo</Text>
              <Text style={styles.sublabel}>Your pulse echoes through the cave (off = dry ping)</Text>
            </View>
            <Switch
              testID="switch-reverb"
              value={st.reverb}
              onValueChange={st.setReverb}
              trackColor={{ false: '#334155', true: PALETTE.sonarCyan }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Graphics</Text>
              <Text style={styles.sublabel}>Auto lowers detail by itself if the game runs slowly</Text>
            </View>
            <TouchableOpacity
              testID="btn-graphics"
              onPress={() => st.setGraphics(GRAPHICS_SETTINGS[(GRAPHICS_SETTINGS.indexOf(st.graphics) + 1) % GRAPHICS_SETTINGS.length])}
              style={styles.cycleBtn}
            >
              <Text style={styles.cycleText}>{st.graphics.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Floating joystick</Text>
              <Text style={styles.sublabel}>Appears where your thumb lands (off = fixed bottom-right)</Text>
            </View>
            <Switch
              testID="switch-floating"
              value={st.floatingJoystick}
              onValueChange={st.setFloatingJoystick}
              trackColor={{ false: '#334155', true: PALETTE.sonarCyan }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

/** Cloud save status and a manual sync button. Hidden-by-text when the build has no backend. */
const CloudSaveSection: React.FC = () => {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => cloudSync.subscribe(bump), []);
  const sync = async () => {
    setBusy(true);
    await cloudSync.request('manual');
    setBusy(false);
  };
  return (
    <View style={styles.section} testID="cloud-section">
      <Text style={styles.sectionTitle}>CLOUD SAVE</Text>
      <Text style={styles.sublabel} testID="cloud-status">
        {syncStatusText(cloudSync.status, cloudSync.enabled)}
      </Text>
      {cloudSync.enabled && (
        <TouchableOpacity style={styles.cycleBtn} onPress={sync} disabled={busy} testID="btn-cloud-sync">
          <Text style={styles.cycleText}>{busy ? 'SYNCING…' : 'SYNC NOW'}</Text>
        </TouchableOpacity>
      )}
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
  cycleBtn: { minWidth: 64, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: PALETTE.sonarCyan },
  cycleText: { color: PALETTE.sonarCyan, fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
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
  value: {
    width: 44,
    textAlign: 'right',
    color: '#CBD5E1',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
