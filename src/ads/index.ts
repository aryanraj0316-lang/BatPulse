import { saveManager } from '../save';
import { useProgressStore } from '../state/progressStore';
import { AdController, noAdProvider } from './AdController';

/** App-wide ads. Swap `noAdProvider` for a real SDK wrapper when one is integrated and the flag is turned on. */
export const ads = new AdController({
  provider: noAdProvider,
  getUsage: () => saveManager.data.ads,
  setUsage: (u) => saveManager.mutate((d) => (d.ads = u)),
  grant: (amount, source) => useProgressStore.getState().creditShards(amount, source),
});
