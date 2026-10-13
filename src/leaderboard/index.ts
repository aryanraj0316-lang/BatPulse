import { loadAuthoredLevel } from '../levels/loader';
import { saveManager } from '../save';
import { Leaderboards } from './Leaderboards';
import { createLeaderboardProvider } from './providers';
import { displayNameFor } from './rules';

/** App-wide leaderboards. The provider is null (feature off, nothing queued) until a backend address is configured. */
export const leaderboards = new Leaderboards({
  provider: createLeaderboardProvider(),
  getQueue: () => saveManager.data.scoreQueue,
  setQueue: (q) => saveManager.mutate((d) => (d.scoreQueue = q)),
  getName: () => displayNameFor(saveManager.data.ledger.deviceId),
  loadLevel: (id) => loadAuthoredLevel(id, true) ?? null,
});
