import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export class HapticEngine {
  static ping(enabled: boolean = true) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }

  static wallBump(enabled: boolean = true) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }

  static shardPickup(enabled: boolean = true) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }

  static wraithAlert(enabled: boolean = true) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
  }

  static death(enabled: boolean = true) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  }

  static victory(enabled: boolean = true) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }
}
