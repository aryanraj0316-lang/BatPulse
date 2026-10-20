# Echolocation Game

Portrait, top-down sonar game. You are a bat; pulses reveal walls, hazards and enemies for a moment, then
they fade back to darkness. Expo / React Native / TypeScript.

## Commands

```
npm install              # clean install, no flags needed
npm test                 # unit tests (pure logic + every level solved by bots)
npm run typecheck        # tsc --noEmit
npm run levels           # build levels-src/*.txt -> src/levels/data/*.json
npm run web              # quick browser run (dev tools enabled)
npm run android          # build and run on a device / emulator
npm run e2e:phase1       # browser end-to-end (needs `npm run web` running + Edge/Chrome)
npm run e2e:phase2
WRITE_DOCS=1 npx jest solutions   # regenerate docs/LEVEL_SOLUTIONS.md (reuses recorded loud variants)
LOUD_SEARCH=44 npx jest --testMatch "**/loudSearch.tool.ts"   # search a loud solution for given levels
```

## Layout

| Path | Purpose |
|------|---------|
| `src/constants/gameConfig.ts` | **All** tunables (`ECHO_CONFIG`) |
| `src/sim/` | Pure game rules: movement, collision, pulses, momentum, hazards, doors, scoring. No React. |
| `src/levels/` | Level schema, validator, loader, chapters, `data/*.json` |
| `levels-src/` | ASCII level sources (the files designers edit) |
| `src/assets/` | `AssetRegistry`, keys, placeholder visuals, synthesized sounds |
| `src/audio/` | Audio service (volume, pooling, pause) + expo-audio backend |
| `src/input/` | Multi-touch joystick / SONAR handling |
| `src/render/`, `src/screens/`, `src/components/` | UI and drawing (everything drawn comes from the registry) |
| `src/save/` | Versioned save (v3), identical backup copy, corruption recovery, shard ledger |
| `src/cloud/`, `src/leaderboard/`, `src/ads/` | Cloud-save merge and sync, per-bat leaderboards, optional rewarded ads. All behind flags that are **off** until a backend exists |
| `src/diagnostics/` | Crash recording and the recovery screen's error handling |
| `src/game/feedback.ts` | The one table that maps gameplay events to sounds and vibrations |
| `src/analytics/`, `src/debug/` | Event hooks; debug-only tools (dev builds) |
| `tools/` | Level build tool and the browser end-to-end harness |
| `docs/` | `TEST_DEVICES.md` (tiers, budget), `LEVEL_SOLUTIONS.md` (generated), `ECONOMY.md`, `ONLINE_BACKEND.md` (server contract), `ART_INTEGRATION.md` (final art/audio specs), `RELEASE_CHECKLIST.md` (beta and release), `KEYS_AND_SAFE_ZONES.md` (keys, locked doors, safe zones) |

## Adding a level

Write an ASCII map in `levels-src/echo_NN.txt` (legend in `tools/buildLevels.js`), run `npm run levels`, list the
JSON in `src/levels/loader.ts`. The tests then prove it is completable and fair. Malformed files throw a
descriptive error in debug builds and are skipped in release builds.

## Replacing placeholder art / sound

Add one line per asset to `src/assets/finalAssets.ts`; anything not listed keeps its placeholder. Specs for every key: `docs/ART_INTEGRATION.md`.

## Android build

`npx expo prebuild --platform android` generates `android/` from `app.json` (permissions, icons, version). Then, from `android/`:
`./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`. Release signing and the Play bundle are in `docs/RELEASE_CHECKLIST.md`.

### On a network that re-signs HTTPS (some antivirus "web shield" products)

Gradle's Java cannot verify such certificates. Use the Windows trust store: add
`systemProp.javax.net.ssl.trustStoreType=WINDOWS-ROOT` (on its own line) and
`-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` to `org.gradle.jvmargs` in `android/gradle.properties`.
Regenerating `android/` removes both lines: add them back.
