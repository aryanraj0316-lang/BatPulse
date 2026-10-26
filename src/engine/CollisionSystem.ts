import { Vec2, Rect, EnvObject, PlayerEntity } from '../types/game';

export class CollisionSystem {
  /**
   * Resolves player movement against walls, glass walls, closed gates, and moving walls,
   * using penetration-depth projection for smooth, frictionless sliding.
   */
  static resolvePlayerMovement(
    playerPos: Vec2,
    delta: Vec2,
    radius: number,
    walls: Rect[],
    objects: EnvObject[],
    worldWidth: number,
    worldHeight: number
  ): { newPos: Vec2; collided: boolean } {
    let newX = playerPos.x + delta.x;
    let newY = playerPos.y + delta.y;
    let collided = false;

    // Solid obstacle filters (walls, closed gates, moving walls)
    const solidObstacles: Rect[] = [
      ...walls,
      ...objects.filter((obj) => {
        if (obj.type === 'glass_wall') return obj.state !== 'open';
        if (obj.type === 'wall' || obj.type === 'moving_wall') return true;
        if (obj.type === 'resonance_gate' && obj.state !== 'open') return true;
        return false;
      }),
    ];

    // Iterative pushout resolution (2 passes for corner multi-wall sliding)
    for (let pass = 0; pass < 2; pass++) {
      for (const obs of solidObstacles) {
        // Find closest point on obstacle rectangle to circle center
        const closestX = Math.max(obs.x, Math.min(newX, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(newY, obs.y + obs.height));

        const dx = newX - closestX;
        const dy = newY - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          collided = true;
          const dist = Math.sqrt(distSq);

          if (dist > 0.001) {
            // Push out along collision normal
            const penetration = radius - dist;
            newX += (dx / dist) * penetration;
            newY += (dy / dist) * penetration;
          } else {
            // Circle center is inside or exactly on the edge of the box
            const leftDist = Math.abs(newX - obs.x);
            const rightDist = Math.abs(obs.x + obs.width - newX);
            const topDist = Math.abs(newY - obs.y);
            const bottomDist = Math.abs(obs.y + obs.height - newY);

            const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
            if (minDist === leftDist) {
              newX = obs.x - radius;
            } else if (minDist === rightDist) {
              newX = obs.x + obs.width + radius;
            } else if (minDist === topDist) {
              newY = obs.y - radius;
            } else {
              newY = obs.y + obs.height + radius;
            }
          }
        }
      }
    }

    // Boundary Clamping
    const minX = radius + 2;
    const maxX = worldWidth - radius - 2;
    const minY = radius + 2;
    const maxY = worldHeight - radius - 2;

    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));

    return {
      newPos: { x: newX, y: newY },
      collided,
    };
  }

  /**
   * Circle-to-AABB Box intersection test
   */
  static checkCircleAABB(circle: Vec2, radius: number, box: Rect): boolean {
    const closestX = Math.max(box.x, Math.min(circle.x, box.x + box.width));
    const closestY = Math.max(box.y, Math.min(circle.y, box.y + box.height));

    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    return dx * dx + dy * dy < radius * radius;
  }

  /**
   * Checks if player stepped into a silent Chasm (instant restart).
   */
  static checkChasmFall(playerPos: Vec2, radius: number, objects: EnvObject[]): boolean {
    for (const obj of objects) {
      if (obj.type === 'chasm') {
        if (this.checkCircleAABB(playerPos, radius * 0.6, obj)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Checks if player collected a Sonar Shard (+1 pulse).
   */
  static checkShardCollection(playerPos: Vec2, radius: number, objects: EnvObject[]): EnvObject | null {
    for (const obj of objects) {
      if (obj.type === 'sonar_shard' && !obj.collected) {
        if (this.checkCircleAABB(playerPos, radius + 8, obj)) {
          obj.collected = true;
          return obj;
        }
      }
    }
    return null;
  }

  /**
   * Checks if the bat picked up the key (opens every locked laser barrier).
   */
  static checkKeyCollection(playerPos: Vec2, radius: number, objects: EnvObject[]): boolean {
    for (const obj of objects) {
      if (obj.type === 'key' && !obj.collected && this.checkCircleAABB(playerPos, radius + 6, obj)) {
        obj.collected = true;
        for (const o of objects) if (o.type === 'glass_wall' && o.locked) o.state = 'open';
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if player stepped on a pressure plate (triggers loud noise lure).
   */
  static checkPressurePlate(playerPos: Vec2, radius: number, objects: EnvObject[], now: number): EnvObject | null {
    for (const obj of objects) {
      if (obj.type === 'pressure_plate') {
        const lastHit = obj.lastHitTime || 0;
        if (now - lastHit > 2500 && this.checkCircleAABB(playerPos, radius, obj)) {
          obj.lastHitTime = now;
          obj.state = 'triggered';
          return obj;
        }
      }
    }
    return null;
  }

  /**
   * Checks if player reached the Goal beacon
   */
  static checkGoal(playerPos: Vec2, playerRadius: number, goal: Vec2 & { radius: number }): boolean {
    const dx = playerPos.x - goal.x;
    const dy = playerPos.y - goal.y;
    const minDist = playerRadius + goal.radius;
    return dx * dx + dy * dy <= minDist * minDist;
  }

  /**
   * Updates moving wall positions along their cyclic axis
   */
  static updateMovingWalls(objects: EnvObject[], now: number): void {
    for (const obj of objects) {
      if (obj.type === 'moving_wall' && obj.initialPos && obj.travelDistance && obj.cycleDuration) {
        const t = (now % obj.cycleDuration) / obj.cycleDuration;
        const pingPong = Math.sin(t * Math.PI * 2) * 0.5 + 0.5; // 0 to 1
        const offset = pingPong * obj.travelDistance;

        if (obj.axis === 'vertical') {
          obj.y = obj.initialPos.y + offset;
        } else {
          obj.x = obj.initialPos.x + offset;
        }
      }
    }
  }
}
