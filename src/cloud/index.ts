import { saveManager } from '../save';
import { useProgressStore } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';
import { CloudSync } from './CloudSync';
import { createCloudProvider } from './CloudSave';

/**
 * App-wide cloud sync. The auth token comes from the sign-in method the backend uses (not decided yet):
 * until then the provider is null (feature off) and every call is a no-op.
 */
export const cloudSync = new CloudSync({
  provider: createCloudProvider(),
  getLocal: () => saveManager.data,
  adopt: (merged) => {
    saveManager.adopt(merged);
    useProgressStore.getState().hydrate();
    useSettingsStore.getState().hydrate();
  },
});
