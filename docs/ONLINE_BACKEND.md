# Online backend contract

The game is fully playable offline. Three online features exist in code, each **off** until a backend address is set in
`ECHO_CONFIG.online` (`src/constants/gameConfig.ts`). No server exists yet: everything below is what the client expects,
implemented and unit-tested against fakes (`cloud.test.ts`, `leaderboard.test.ts`), and **not yet verified against a real server**.

Enable a feature by setting `enabled: true` and a `https://` `baseUrl`. `release.test.ts` fails if a feature is on without an
HTTPS address.

All requests send `Authorization: Bearer <token>` when the app has a token (sign-in is not decided yet: Google Play Games,
Sign in with Apple, or an anonymous account issued by the backend). Wire it in `src/cloud/index.ts` and
`src/leaderboard/index.ts` (`getToken`).

## Cloud save

| Call | Request | Response |
|---|---|---|
| `GET {base}/save` | none | `200 {"blob": string, "version": string}`, or `404` when the player has no save yet |
| `PUT {base}/save` | `{"blob": string, "expectedVersion": string \| null}` | `200 {...}` stored; `409` or `412` when `expectedVersion` is not the server's current version |

* `blob` is the save envelope produced by `encodeEnvelope()` (JSON with `saveVersion`, `checksum`, `body`). The server stores it
  opaquely; it must not modify it. It is a few KB.
* `version` is any string the server changes on every successful write (a counter or an ETag).
* **Optimistic concurrency:** the client downloads, merges (`src/cloud/merge.ts`), and uploads with the version it merged
  against. On 409/412 it downloads and merges again, up to 3 times.
* The server should keep the previous blob (one backup) so a bad write can be rolled back.
* Rate limit per account (the client syncs at launch, when backgrounded, after progress changes at most once per
  `minIntervalSec`, and on demand).

How devices are merged (so the backend never has to): progress only improves (stars, best times, ghost runs, owned bats,
milestones); shards are tracked per device and summed, minus the price of owned bats, so nothing is lost or spent twice; the
daily reward cannot be claimed once per device; settings come from whichever save changed last. A cloud save written by a
**newer** game version is never touched by an older client.

## Leaderboards

| Call | Request | Response |
|---|---|---|
| `POST {base}/scores` | `{"levelId": number, "character": string, "timeSec": number, "name": string}` | `200` accepted; `400` or `422` refused for good (the client drops it); anything else is retried later |
| `GET {base}/scores?levelId=&character=&limit=` | none | `200 {"rows": [{"rank": number, "name": string, "timeSec": number, "isYou": boolean}]}`, fastest first |

* A board is **one level and one bat** (`levelId` + `character`). The app shows "Rookie only" by default so times are compared fairly.
* `name` is an anonymous label (`Bat-4F2A`). If real names are ever added, they need moderation.
* The client only submits a time that beat the player's own best for that bat, after a plausibility check (not faster than a straight
  line to the finish at top speed, not slower than an hour). **The client cannot be trusted.**

### What the server must do (anti-cheat)

1. Re-run the same checks (finite number, level exists, known bat, `minPossibleTimeSec`).
2. Rate-limit per account and per IP, and ignore a time that is not better than the stored one.
3. The simulation is deterministic (`src/sim`, fixed inputs give the same run), so a stronger option is to have the client send
   the recorded input log and the server replay it with the same simulation code to confirm the time. The client does not record
   inputs yet; adding it is a contained change if cheating becomes a problem.

## Rewarded ads

`ECHO_CONFIG.online.ads.enabled` is `false` and no ad SDK is installed. To turn the feature on:

1. Install the ad network's React Native SDK and write a small `AdProvider` (`isReady()`, `show()` returning `'rewarded'`,
   `'dismissed'` or `'failed'`) in `src/ads/`.
2. Use it instead of `noAdProvider` in `src/ads/index.ts`.
3. Set `enabled: true`. Reward size and the daily soft cap are `rewardShards` and `maxPerDay`.

Rules already enforced and tested: opt-in button on the result card only, one per result, reward paid only when the ad was
completed, never needed to progress, no interstitials. Add the SDK's consent flow (GDPR/UMP, App Tracking Transparency) before
enabling, and update the privacy notes in `docs/RELEASE_CHECKLIST.md`.

## Trusted time (daily reward)

The daily reward uses network time, never the phone clock. Today it calls two public services
(`ECHO_CONFIG.trustedTime.sources`); neither is under any agreement with this project. Before launch, point it at your own
endpoint (any HTTPS `GET` returning `{"unixtime": <seconds>}`, or add a parser in `src/state/trustedTime.ts`).
