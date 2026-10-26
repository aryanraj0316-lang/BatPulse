import { Vec2, SonarWaveEntity, EnvObject, ImpactSpark, Rect, WraithEntity } from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';
import { PALETTE } from '../constants/palette';
import { SpatialHashGrid } from '../maze/mesher';

// Precomputed Sin/Cos lookup tables for 144 rays
const RAY_COUNT = GAME_CONFIG.SONAR_RAY_COUNT;
const SIN_TABLE = new Float32Array(RAY_COUNT);
const COS_TABLE = new Float32Array(RAY_COUNT);

for (let i = 0; i < RAY_COUNT; i++) {
  const angle = (i * 2 * Math.PI) / RAY_COUNT;
  SIN_TABLE[i] = Math.sin(angle);
  COS_TABLE[i] = Math.cos(angle);
}

export class SonarSystem {
  /**
   * Raycasts radially from the sonar origin to find all intersecting surfaces.
   */
  static castRays(
    origin: Vec2,
    maxRadius: number,
    spatialGrid: SpatialHashGrid,
    objects: EnvObject[],
    isPiercing: boolean = false
  ): {
    hitDistances: Float32Array;
    hitObjects: Set<string>;
  } {
    const hitDistances = new Float32Array(RAY_COUNT);
    const hitObjects = new Set<string>();

    const candidateWalls = spatialGrid.queryRadius(origin, maxRadius);
    const allObstacles = [
      ...candidateWalls,
      ...objects.filter((o) => o.type !== 'dust_field' && o.type !== 'sonar_shard'),
    ];

    const stepSize = 7.0;
    const maxSteps = Math.ceil(maxRadius / stepSize);

    for (let r = 0; r < RAY_COUNT; r++) {
      const cos = COS_TABLE[r];
      const sin = SIN_TABLE[r];
      let rayDist = maxRadius;
      let piercedCount = 0;

      for (let s = 1; s <= maxSteps; s++) {
        const curDist = s * stepSize;
        if (curDist > maxRadius) break;

        const checkX = origin.x + cos * curDist;
        const checkY = origin.y + sin * curDist;

        let hitFound = false;

        for (const obj of allObstacles) {
          if (
            checkX >= obj.x &&
            checkX <= obj.x + obj.width &&
            checkY >= obj.y &&
            checkY <= obj.y + obj.height
          ) {
            const isGlass = 'type' in obj && obj.type === 'glass_wall';
            hitObjects.add(obj.id);

            if (!isGlass) {
              if (isPiercing && piercedCount === 0) {
                piercedCount++;
              } else {
                rayDist = curDist;
                hitFound = true;
                break;
              }
            }
          }
        }

        if (hitFound) break;
      }

      hitDistances[r] = rayDist;
    }

    return { hitDistances, hitObjects };
  }

  /**
   * Updates an expanding wave entity and illuminates walls, obstacles,
   * goal, and wraiths as the wave sweeps past them.
   */
  static updateWave(
    wave: SonarWaveEntity,
    deltaTime: number,
    now: number,
    walls: Rect[],
    objects: EnvObject[],
    wraiths: WraithEntity[],
    goal: Vec2 & { radius: number; revealedAt: number; revealStrength: number },
    onEchoAudio?: (impactPos: Vec2, distance: number) => void
  ): {
    isAlive: boolean;
    updatedObjects: EnvObject[];
    newSparks: ImpactSpark[];
    secondaryPings: Vec2[];
  } {
    const elapsedSeconds = (now - wave.createdAt) / 1000;
    const t = Math.min(1.0, elapsedSeconds / GAME_CONFIG.SONAR_EXPAND_DURATION);

    // easeOutQuart: fast punchy start, natural falloff
    const easeProgress = 1 - Math.pow(1 - t, 4);
    const prevRadius = wave.currentRadius;
    const newRadius = wave.maxRadius * easeProgress;
    wave.currentRadius = newRadius;
    wave.intensity = Math.max(0, 1.0 - t * t);

    const isAlive = t < 1.0;
    const newSparks: ImpactSpark[] = [];
    const secondaryPings: Vec2[] = [];
    const updatedObjects = [...objects];

    // 1. Check intersection with all WALL obstacles
    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      const closestX = Math.max(wall.x, Math.min(wave.origin.x, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(wave.origin.y, wall.y + wall.height));
      const dist = Math.hypot(wave.origin.x - closestX, wave.origin.y - closestY);

      // If the wave swept across this wall
      if (dist >= prevRadius - 10 && dist <= newRadius + 10) {
        const revealStrength = Math.max(
          0.4,
          1.0 - (dist / wave.maxRadius) * (1 - GAME_CONFIG.DISTANCE_DECAY_FACTOR)
        );
        (wall as any).revealedAt = now;
        (wall as any).revealStrength = revealStrength;
        (wall as any).lastPingDistance = dist;

        // Spawn returning sparks towards the player
        if (Math.random() < 0.45) {
          const dirX = (wave.origin.x - closestX) / (dist || 1);
          const dirY = (wave.origin.y - closestY) / (dist || 1);
          const speed = 70 + Math.random() * 90;
          const spreadAngle = (Math.random() - 0.5) * 0.6;
          const vx = (dirX * Math.cos(spreadAngle) - dirY * Math.sin(spreadAngle)) * speed;
          const vy = (dirX * Math.sin(spreadAngle) + dirY * Math.cos(spreadAngle)) * speed;

          newSparks.push({
            id: `sp_w_${now}_${Math.random()}`,
            x: closestX,
            y: closestY,
            vx,
            vy,
            life: 380,
            maxLife: 380,
            color: PALETTE.sonarCyan,
            size: 2.2,
          });
          // Audio only: walls echo back too (the audio engine rate-limits these)
          if (onEchoAudio) onEchoAudio({ x: closestX, y: closestY }, dist);
        }
      }
    }

    // 2. Check intersection with specialized Environment Objects
    for (let i = 0; i < updatedObjects.length; i++) {
      const obj = updatedObjects[i];
      if (obj.collected) continue;

      const closestX = Math.max(obj.x, Math.min(wave.origin.x, obj.x + obj.width));
      const closestY = Math.max(obj.y, Math.min(wave.origin.y, obj.y + obj.height));
      const dist = Math.hypot(wave.origin.x - closestX, wave.origin.y - closestY);

      if (dist >= prevRadius - 10 && dist <= newRadius + 10) {
        const revealStrength = Math.max(
          0.4,
          1.0 - (dist / wave.maxRadius) * (1 - GAME_CONFIG.DISTANCE_DECAY_FACTOR)
        );
        updatedObjects[i] = {
          ...obj,
          revealedAt: now,
          revealStrength,
          lastPingDistance: dist,
        };

        // Echo crystal trigger: Re-emits a secondary sonar burst!
        if (obj.type === 'echo_crystal' && (!obj.lastHitTime || now - obj.lastHitTime > 1500)) {
          updatedObjects[i].lastHitTime = now;
          secondaryPings.push({ x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 });
        }

        // Resonance gate hit counter
        if (obj.type === 'resonance_gate') {
          const lastHit = obj.lastHitTime || 0;
          if (now - lastHit < 1000) {
            updatedObjects[i].state = 'open';
          }
          updatedObjects[i].lastHitTime = now;
        }

        // Spawn returning impact echo sparks
        const dirX = (wave.origin.x - closestX) / (dist || 1);
        const dirY = (wave.origin.y - closestY) / (dist || 1);

        for (let s = 0; s < 4; s++) {
          const speed = 70 + Math.random() * 110;
          const spreadAngle = (Math.random() - 0.5) * 0.7;
          const vx = (dirX * Math.cos(spreadAngle) - dirY * Math.sin(spreadAngle)) * speed;
          const vy = (dirX * Math.sin(spreadAngle) + dirY * Math.cos(spreadAngle)) * speed;

          newSparks.push({
            id: `sp_${now}_${Math.random()}`,
            x: closestX,
            y: closestY,
            vx,
            vy,
            life: 400,
            maxLife: 400,
            color: PALETTE.sonarCyan,
            size: 2.4,
          });
        }

        if (onEchoAudio) {
          onEchoAudio({ x: closestX, y: closestY }, dist);
        }
      }
    }

    // 3. Check goal illumination
    const goalDist = Math.hypot(wave.origin.x - goal.x, wave.origin.y - goal.y);
    if (goalDist >= prevRadius - 12 && goalDist <= newRadius + goal.radius + 12) {
      goal.revealedAt = now;
      goal.revealStrength = Math.max(0.6, 1.0 - goalDist / wave.maxRadius);
    }

    // 4. Check Wraith illumination
    for (const wraith of wraiths) {
      const wDist = Math.hypot(wave.origin.x - wraith.pos.x, wave.origin.y - wraith.pos.y);
      if (wDist >= prevRadius - 14 && wDist <= newRadius + wraith.radius + 14) {
        wraith.revealedAt = now;
        wraith.revealStrength = 1.0;

        for (let s = 0; s < 6; s++) {
          newSparks.push({
            id: `sp_w_${now}_${s}`,
            x: wraith.pos.x,
            y: wraith.pos.y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            life: 450,
            maxLife: 450,
            color: PALETTE.wraithRed,
            size: 3.0,
          });
        }
      }
    }

    return { isAlive, updatedObjects, newSparks, secondaryPings };
  }
}
