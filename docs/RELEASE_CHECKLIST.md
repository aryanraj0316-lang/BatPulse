# Beta and release checklist

Legend: **Done** = built and checked in this repo. **You** = needs a decision, an account or a file only the owner has.
**Device** = needs a physical phone (nothing here can be verified without one). **Backend** = needs a server that does not exist yet.

## 1. Build and signing

| Item | Status | Notes |
|---|---|---|
| Release APK builds (arm64) | Done | `builds/echolocation-game-release-arm64.apk`, about 34 MB. Sideloading and testers only. |
| Release signing key | **You** | The APK is signed with the **debug key**. Create an upload keystore, keep it and its passwords safe (losing it blocks updates), and configure `android/app/build.gradle` signing (or EAS credentials). |
| Play Store bundle (AAB) | **You** | Google Play needs an `.aab` (`./gradlew bundleRelease`), not an APK. Same steps, plus a signed upload. |
| 32-bit Android | **You** | The build is arm64 only (all current phones). Adding `armeabi-v7a` grows the install by about 15 MB and only helps very old devices. |
| iOS build | **You** | Cannot be built on Windows. Needs a Mac with Xcode or EAS Build, an Apple developer account, and a device or TestFlight run. The iOS-specific config (bundle id, build number, no microphone prompt, no background audio) is already in `app.json`. |
| Version bump process | Done | Edit `version` and `android.versionCode` / `ios.buildNumber` in `app.json` and `version` in `package.json`; `release.test.ts` fails if they disagree. The home screen shows the real version. |
| Native project regenerated from `app.json` | Done | `npx expo prebuild --platform android` rewrites `android/`. **It wipes the network setting in `android/gradle.properties` on this machine** (see the note at the end). |

## 2. Permissions and size

| Item | Status |
|---|---|
| Only INTERNET, VIBRATE, network state, audio settings and wake lock remain; microphone, screen overlay, storage and background-audio service are removed | Done (`release.test.ts`, merged manifest checked) |
| Install size under 60 MB | Done (34 MB) |
| Memory under 250 MB, Low-tier floor 350 MB | **Device** |

## 3. Store listing (not started: needs your content)

* **You:** app name, short and long description, category, age rating questionnaire, contact email, support URL.
* **You:** screenshots (portrait, from a real device), feature graphic (Play 1024 x 500), final icon (placeholder in `assets/`).
* **You:** privacy policy URL (required by both stores, see section 4).

## 4. Privacy and compliance

What the game does today, so the policy and the store forms can be filled in truthfully:

| Data | Collected? | Detail |
|---|---|---|
| Analytics events | Not sent anywhere | Events are typed and buffered in memory (`src/analytics`); only printed in development builds. No analytics provider is integrated. If one is added, update this table, the policy and the store forms. |
| Crash reports | Not sent anywhere | Recorded in memory and sent to the analytics sink (`src/diagnostics/crash.ts`). |
| Network calls | Daily reward only | `worldtimeapi.org` and `timeapi.io` receive the player's IP address to answer "what time is it". Replace them with your own endpoint before launch (`docs/ONLINE_BACKEND.md`). |
| Cloud save, leaderboards | Off | Would send the save / best times and an anonymous id (`Bat-XXXX`). |
| Ads | Off | An ad SDK collects an advertising id and needs a consent flow before it is turned on. |
| Account, name, email, location, contacts, microphone, photos | Never | |

* **You:** write the privacy policy and complete the Play "Data safety" and Apple "App privacy" forms from the table above.
* **Done:** `ITSAppUsesNonExemptEncryption: false` (no export-compliance question for iOS).
* **You:** if the game is offered to children, the stores add requirements (ads and analytics rules). Decide the target age first.

## 5. Quality gates (all must pass before a build goes to testers)

| Gate | Status |
|---|---|
| `npx tsc --noEmit` clean | Done |
| `npx jest`: all unit tests pass (levels, simulation, economy, save and cloud merge, leaderboards, ads, release config) | Done |
| All 50 levels completed by the solver bots as The Rookie, with zero deaths | Done (`docs/LEVEL_SOLUTIONS.md`) |
| Browser end-to-end runs for every phase (real touch input, 60 FPS check) | Done (`npm run e2e:phase1` to `e2e:phase6`) |
| 60 FPS on the **Low**, **Mid** and **High** device tiers (`docs/TEST_DEVICES.md`) | **Device** (browser run only: about 60 FPS) |
| Native audio (all sounds, cave echo, music loop, pause on background) | **Device** |
| Haptics (pulse, bump, alert, death, victory, heartbeat) | **Device** |
| Safe areas on a notch phone and a Dynamic Island phone | **Device** |
| Multi-touch (thumb on SONAR while steering) on a real screen | **Device** |
| Interrupts: incoming call, notification shade, app switch, screen lock, rotate | **Device** |
| Star times and ghost limits feel fair (they are derived from solver bots) | **Device** (needs human playtesters) |
| Install over the previous build keeps the save (v2 to v3 migration is unit-tested) | **Device** |

## 6. Beta plan

1. Build a signed release APK / AAB (section 1) and distribute through Play internal testing (up to 100 testers) or direct APK to a small group.
2. Test devices: at least one per tier in `docs/TEST_DEVICES.md`, plus one iPhone once an iOS build exists.
3. Ask testers to play Echo 01 to 05 cold, then to finish a chapter, and answer: could you tell what the sonar did, was any level unfair, did anything stutter?
4. Watch for: crashes (the recovery screen "SIGNAL LOST" appears instead of a white screen), levels where many players fail, Echo 46 to 50 (escape levels) fairness, and the Sonar-Bot trade-off (louder to hunters, by design).
5. Exit criteria: no crash in 20 sessions, average FPS at or above the floor on the Low tier, no save loss, every Chapter 3 level cleared by at least one tester without the debug tools.
6. Turn on one online feature at a time (cloud save, then leaderboards, then ads), each with its own beta round.

## 7. Known limitations (not defects, decided and documented)

* Sonar-Bot is heard by hunters at 1.5x the range (hearing follows pulse size). Decided: keep as a trade-off.
* Shards: a perfect first run earns about 3,700 and the roster costs 21,000, so the top bats need replays and the daily reward. Replay pay (25 %) is in `ECHO_CONFIG.rewards`.
* If two devices each buy a different bat while offline, both bats are kept when the saves merge and both are paid for (the balance never goes below zero). If two devices both claim the same chapter-mastery bonus offline, both bonuses count (each really earned it).
* Restoring an Android backup onto a second phone while keeping the first can make two phones share one device id; their earnings then merge by maximum instead of by sum. This only happens with auto-backup restore and loses at most one device's offline earnings.
* Placeholder art, sounds and brand images (`docs/ART_INTEGRATION.md`).

## 8. Note for whoever builds on Windows behind antivirus HTTPS scanning

Gradle needs `-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` (both in `org.gradle.jvmargs` and as
`systemProp.javax.net.ssl.trustStoreType=WINDOWS-ROOT` in `android/gradle.properties`) when a web shield re-signs HTTPS. These
lines live in the generated `android/` folder and are lost whenever it is regenerated; add them back afterwards. Certificate
checks are never disabled.
