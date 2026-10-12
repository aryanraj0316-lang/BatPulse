# Test devices and performance budget

Budget values live in `ECHO_CONFIG.perf` (`src/constants/gameConfig.ts`). These are the **baseline profiles**
every phase is measured against. A profile is a device class; any real device of that class qualifies.

| Tier | Baseline profile | Representative devices | Purpose |
|------|------------------|------------------------|---------|
| **Low** | Budget Android, 3-4 GB RAM, standard low-tier CPU (Cortex-A53/A55 class, Helio G / Snapdragon 4xx-6xx), 720p, Android 10-12 | Redmi 9A/10A, Galaxy A03/A04, Moto G Play | Hard FPS floor, memory, battery, build size |
| **Mid** | Modern mainstream, 6-8 GB RAM, Snapdragon 7-series / Dimensity 7xx / Tensor G2, 1080p | Pixel 7a, Galaxy A54/A55 | Primary design target |
| **High** | Flagship, 8-12 GB RAM, current top SoC, 120 Hz OLED, notch / Dynamic Island | iPhone 15, Galaxy S24 | Safe-area, high-refresh, thermal behaviour |

## Budget (all tiers)

| Metric | Target | Floor (fail below) |
|--------|--------|--------------------|
| Frame rate | 60 FPS (16.7 ms/frame) | Low tier: average >= 50 FPS, no frame > 50 ms during a pulse |
| Level load / restart | < 1 s | 1 s |
| Simulation step cost | < 1 ms on Mid | 4 ms on Low |
| Memory | < 250 MB RSS | 350 MB on Low |
| Install size | < 60 MB | 100 MB |

## What has actually been measured so far

| Check | Where | Result |
|-------|-------|--------|
| 60 FPS while moving with pulses | Desktop Edge, mobile emulation (no GPU) | 60.1 FPS, worst frame 17 ms (`tools/e2e/phase1.js`) |
| Simulation step cost | Node (see `src/__tests__/perf.test.ts`) | see test output; hard assertion in CI |
| Native device FPS | **not yet measured** (no physical device attached; emulator results are indicative only) | pending |

Real-device numbers must be recorded here per tier as they become available. Browser and emulator numbers are
**indicative**, not a substitute for the Low-tier device.

## How to measure

Debug build: Home screen -> tap the footer 5 times -> Engine Tuning Panel -> enable **FPS counter**, then play.
Use **Show hitboxes** to debug collisions. Automated browser run: `npm run web`, then `node tools/e2e/phase1.js <outDir>`.
