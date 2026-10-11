import AsyncStorage from '@react-native-async-storage/async-storage';
import { SaveManager } from './SaveManager';

/** App-wide singleton backed by AsyncStorage (works on Android, iOS and web). */
export const saveManager = new SaveManager(AsyncStorage);
