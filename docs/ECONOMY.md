# Economy and characters (Phase 5)

Everything below lives in `ECHO_CONFIG` (`src/constants/gameConfig.ts`); nothing is hard-coded elsewhere.
The numbers are asserted by `src/__tests__/economy.test.ts` and `characters.test.ts`.

## Bats

| Bat | Price | Ability | Numbers |
|---|---|---|---|
| The Rookie | free | none (the baseline every level is solved with) | pulse radius x1, glow 1.5 s, hearing x1, momentum cap x2.0 |
| Vesper | 1,500 | walls and spikes stay lit longer | +2 s glow on walls and spikes only |
| Sonar-Bot | 3,500 | bigger pulse | pulse radius x1.5 |
| Phantom | 6,000 | quiet pulses | hunter hearing radius x0.5 (own pulse unchanged) |
| Turbo Moth | 10,000 | momentum | builds 2x faster, cap x4.0 |

Abilities turn into numbers in exactly one place: `simParamsFor()` in `src/game/characters.ts`.
No level requires a bat; every level is solved by the Rookie.

Design note: hunters hear a pulse at 1.2 x the pulse radius, so Sonar-Bot's bigger pulse is also louder to
hunters. That is a deliberate trade-off (see/hear more vs. be heard more), not a bug.

## Earning shards

| Source | Amount |
|---|---|
| First clear | 20 / 35 / 50 for 1 / 2 / 3 stars, multiplied by the momentum at the finish |
| Replay | 25 % of that (at least 1) |
| Ghost Run (hunter levels only) | +25, once per level |
| Chapter mastery | +20 at 25 %, +30 at 50 %, +50 at 75 %, +100 at 100 % of the chapter's stars (once each) |
| Daily login | 50 on day 1, ramping to 100 on day 7, plus a +100 streak bonus on day 7 |

Daily reward uses **trusted network time** (UTC day boundaries), never the phone clock. Offline it shows
"Connect to the internet to claim" and stays claimable. Missing a day restarts the streak at day 1.

## Pacing (all 50 levels, asserted in tests)

| Playthrough | Shards |
|---|---|
| Every level at 1 star | 1,060 |
| Every level at 3 stars | 3,100 (incl. mastery) |
| 3 stars + every Ghost Run (25 hunter levels) | 3,725 |
| Whole roster | 21,000 |

A perfect first run buys Vesper or Sonar-Bot, not both. Phantom and Turbo Moth need replays, the daily reward
and momentum. This is intentional so the shop stays a long-term goal; the prices are the spec's.

## Data kept per player

* `unlockedCharacters`, `selectedCharacter` (only an owned bat can be equipped; unknown ids fall back to the Rookie)
* `claimedMilestones` (`"chapter:percent"` keys, so a milestone never pays twice)
* `daily` (`lastClaimDay` as a UTC day number, `streak`)
* per level `bestTimes` per character, which keeps leaderboards fair (per character, or Rookie-only) in Phase 6
