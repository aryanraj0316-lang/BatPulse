# Test devices and performance budget

Budget values live in `ECHO_CONFIG.perf` (`src/constants/gameConfig.ts`).

| Tier | Reference device (class) | Purpose | Status |
|------|--------------------------|---------|--------|
| Low-end | Android, 3 GB RAM, Snapdragon 4-series / Helio G-series, 720p, Android 10-12 (e.g. Redmi 9A / Galaxy A03 class) | Hard FPS floor, memory and battery | **Device not yet assigned - owner to supply** |
| Mid | Android, 6 GB RAM, Snapdragon 6/7-series, 1080p (e.g. Pixel 6a / Galaxy A54 class) | Primary design target | **Not yet assigned** |
| High | Current flagship Android + iPhone 13 or newer with notch/Dynamic Island | Safe-area, high-refresh behaviour | **Not yet assigned** |

## Budget

- Target: **60 FPS** (frame budget 16.7 ms).
- Low-end floor: **>= 50 FPS** average, no frame > 50 ms during a pulse.
- Level load / restart: **< 1 s** (`ECHO_CONFIG.level.loadBudgetMs`).
- No per-frame allocations in hot paths (enforced from Phase 1 onward).

## How to measure

Debug build: Home screen -> tap the footer 5 times -> Engine Tuning Panel -> enable **FPS counter**,
then play. Use **Show hitboxes** / **Show enemy hearing radius** to debug collisions and AI.
FPS has to be measured on real devices; browser numbers are not representative.
