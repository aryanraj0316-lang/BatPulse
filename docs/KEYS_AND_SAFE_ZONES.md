# Hidden keys, locked doors and safe zones

Two features for the higher levels. Both are optional per level: a level without them behaves exactly as before.

## Hidden key and locked door

* A **locked door** (purple, with a padlock) closes the only way to the finish. A pulse does not open it, and neither does a switch.
* The **key** (a small gold key) is hidden: it is only drawn while a pulse is lighting it, but it is picked up by flying over it.
  It lies away from the straight line from the start to the door, so it has to be found.
* Carrying the key shows `KEY` in the HUD. Reaching the door with the key opens it **for good** (it never closes, unlike a switch
  door that stays open for 8 seconds). The bat unlocks the door just before touching it, so it never bumps into it.
* Checkpoints remember the key and the unlocked door: a death returns the bat with them. A checkpoint reached before the key does not give the key.
* Hunters cannot walk through a locked door.

Levels: **Echo 36, 39 and 41**. The first, Echo 36, explains it with a hint.

## Safe zones

* A **safe zone** (green, always faintly visible so it can be found in the dark) is a refuge from hunters.
* While the bat is inside (its centre in the zone), it is **hidden**: hunters cannot see, hear or catch it. A hunter that was chasing
  gives up and searches the place where it last saw the bat, then goes back to its route. It never learns the bat is inside.
  Hiding is not a new alert, so a Ghost Run is not affected by it.
* The bat is drawn faint while hidden, the HUD shows `HIDDEN <seconds left>`, and the zone shows a shrinking bar and flashes when time is nearly up.
* **The sonar refills** while hiding: one charge about every 2.5 seconds, in fixed-charge and recharging levels alike, never above the maximum.
  Leaving early loses the half-filled charge.
* Pulses still work inside a zone and are **not heard** by hunters.
* A stay lasts at most **8 seconds**. Then the bat is visible again and the zone rests for **12 seconds**. Leaving a zone yourself
  rests it for 2 seconds (stops in-and-out flicker). So one visit refills at most 3 charges, and hiding is a pause, not a way to skip a hunter.
* Respawning (checkpoint) or restarting puts every zone back to ready.

Levels: **Echo 33, 35, 37, 41, 42, 44 and 45** (all have hunters). The first, Echo 33, explains it with a hint. Zones sit in side areas at
least 100 units from every patrol lane, so a hunter walking its route does not see into them.

## Tuning (all in `ECHO_CONFIG`)

| Value | Default | Meaning |
|---|---|---|
| `key.radius` | 12 | how close the bat must get to pick a key up |
| `key.unlockMargin` | 6 | how near the door the bat unlocks it |
| `safeZone.maxHideSec` | 8 | longest stay |
| `safeZone.expireCooldownSec` | 12 | rest after the time runs out |
| `safeZone.leaveCooldownSec` | 2 | rest after leaving by yourself |
| `safeZone.refillSecPerCharge` | 2.5 | seconds inside per sonar charge |
| `safeZone.warnFraction` | 0.75 | the zone starts flashing after this share of the stay |

## Adding them to a level (`levels-src/echo_NN.txt`)

* `K` marks the key (at most one per level), `L` the locked door (one rectangle of `L` cells, and the level needs a `K`), `Z` a safe zone
  (every rectangle of `Z` cells is one zone, at least 2 x 2 cells). `npm run levels` builds the JSON and checks these rules.
* Put the key **before** the door along the route (lower on the map), in the same room or an earlier one.
* If a level has hunters, check that a loud solution exists after changing it (`LOUD_SEARCH=<id> npx jest --testMatch "**/loudSearch.tool.ts"`):
  hunters in the key's room, plus a long detour for the key, can make an alerted run impossible for the solver bot.

## Sound and art

The new events (`key`, `unlock`, `hide`, `expose`) reuse existing sounds for now (see `src/game/feedback.ts`). The three new visuals
(`key_item`, `locked_door`, `safe_zone`) are placeholders registered like every other one: specs in `docs/ART_INTEGRATION.md`.
