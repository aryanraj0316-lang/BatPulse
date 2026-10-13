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

  static heartbeat(enabled: boolean = true) {
    if (!enabled || Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    } catch {}
  }

  /** One entry point for the feedback table (game/feedback.ts). */
  static play(kind: 'ping' | 'bump' | 'pickup' | 'alert' | 'death' | 'victory' | 'heartbeat', enabled: boolean = true) {
    switch (kind) {
      case 'ping': return HapticEngine.ping(enabled);
      case 'bump': return HapticEngine.wallBump(enabled);
      case 'pickup': return HapticEngine.shardPickup(enabled);
      case 'alert': return HapticEngine.wraithAlert(enabled);
      case 'death': return HapticEngine.death(enabled);
      case 'victory': return HapticEngine.victory(enabled);
      case 'heartbeat': return HapticEngine.heartbeat(enabled);
    }
  }
}
