import { Vec2, WraithEntity, WraithState } from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';
import { Pathfinding, NodeCoord } from '../maze/pathfinding';
import { GridCell } from '../maze/generator';

export class HunterAI {
  /**
   * Initializes a Wraith entity at the given anchor position
   */
  static create(anchor: Vec2, speedMultiplier: number = 1.0): WraithEntity {
    return {
      id: `wraith_${Date.now()}_${Math.random()}`,
      pos: { ...anchor },
      velocity: { x: 0, y: 0 },
      radius: GAME_CONFIG.HUNTER_RADIUS,
      speed: GAME_CONFIG.PLAYER_SPEED * GAME_CONFIG.HUNTER_SPEED_RATIO * speedMultiplier,
      state: 'DORMANT',
      targetPos: null,
      patrolAnchor: { ...anchor },
      searchTimer: 0,
      frenzyTimer: 0,
      revealedAt: 0,
      revealStrength: 0,
      lastBreatheTime: Date.now(),
    };
  }

  /**
   * Called when player fires a sonar pulse.
   * Listens to pulse and alerts the Wraith if within hearing radius.
   */
  static onPlayerPing(
    wraith: WraithEntity,
    pingOrigin: Vec2,
    now: number,
    lastPingTime: number
  ): { alerted: boolean; enteredFrenzy: boolean } {
    const distToPing = Math.hypot(wraith.pos.x - pingOrigin.x, wraith.pos.y - pingOrigin.y);

    if (distToPing <= GAME_CONFIG.HUNTER_HEARING_RADIUS) {
      // Check Frenzy trigger: Ping fired within 1.5s while hunting
      if (wraith.state === 'HUNTING' && now - lastPingTime < 1500) {
        wraith.state = 'FRENZY';
        wraith.frenzyTimer = GAME_CONFIG.HUNTER_FRENZY_DURATION;
        wraith.targetPos = { ...pingOrigin };
        return { alerted: true, enteredFrenzy: true };
      }

      wraith.state = 'ALERTED';
      wraith.targetPos = { ...pingOrigin };
      return { alerted: true, enteredFrenzy: false };
    }

    return { alerted: false, enteredFrenzy: false };
  }

  /**
   * Called when player sprints (>70% joystick magnitude).
   * Emits footstep echo that Wraith can hear at close range.
   */
  static onPlayerSprint(wraith: WraithEntity, playerPos: Vec2): boolean {
    const dist = Math.hypot(wraith.pos.x - playerPos.x, wraith.pos.y - playerPos.y);
    if (dist <= GAME_CONFIG.HUNTER_FOOTSTEP_HEARING_RADIUS) {
      if (wraith.state === 'DORMANT' || wraith.state === 'LOSING') {
        wraith.state = 'ALERTED';
        wraith.targetPos = { ...playerPos };
        return true;
      }
    }
    return false;
  }

  /**
   * Called when a pressure plate is triggered by the player as a tactical distraction.
   */
  static onDistraction(wraith: WraithEntity, platePos: Vec2): void {
    wraith.state = 'ALERTED';
    wraith.targetPos = { ...platePos };
  }

  /**
   * Main Wraith AI update step per frame
   */
  static update(
    wraith: WraithEntity,
    grid: GridCell[][],
    cellW: number,
    cellH: number,
    deltaTime: number,
    now: number
  ): void {
    // 1. Manage Frenzy timer
    if (wraith.state === 'FRENZY') {
      wraith.frenzyTimer -= deltaTime * 1000;
      if (wraith.frenzyTimer <= 0) {
        wraith.state = 'HUNTING';
        wraith.searchTimer = GAME_CONFIG.HUNTER_SEARCH_TIME;
      }
    }

    // Determine current speed based on state
    let curSpeed = wraith.speed;
    if (wraith.state === 'FRENZY') {
      curSpeed *= GAME_CONFIG.HUNTER_FRENZY_MULT;
    } else if (wraith.state === 'LOSING') {
      curSpeed *= 0.6;
    }

    // 2. State Machine execution
    switch (wraith.state) {
      case 'DORMANT':
        // Idle breathing drone
        wraith.velocity = { x: 0, y: 0 };
        break;

      case 'ALERTED':
      case 'FRENZY':
      case 'HUNTING': {
        const dest = wraith.targetPos || wraith.patrolAnchor;
        const distToDest = Math.hypot(dest.x - wraith.pos.x, dest.y - wraith.pos.y);

        if (distToDest < 18) {
          // Reached destination! Switch to spiral search / LOSING
          if (wraith.state === 'ALERTED') {
            wraith.state = 'HUNTING';
            wraith.searchTimer = GAME_CONFIG.HUNTER_SEARCH_TIME;
          } else if (wraith.state === 'HUNTING') {
            wraith.searchTimer -= deltaTime * 1000;
            if (wraith.searchTimer <= 0) {
              wraith.state = 'LOSING';
              wraith.targetPos = { ...wraith.patrolAnchor };
            }
          }
        }

        // Steer towards target via grid pathfinding
        this.steerToward(wraith, dest, grid, cellW, cellH, curSpeed, deltaTime);
        break;
      }

      case 'LOSING': {
        const distToAnchor = Math.hypot(wraith.patrolAnchor.x - wraith.pos.x, wraith.patrolAnchor.y - wraith.pos.y);
        if (distToAnchor < 14) {
          wraith.state = 'DORMANT';
          wraith.targetPos = null;
          wraith.velocity = { x: 0, y: 0 };
        } else {
          this.steerToward(wraith, wraith.patrolAnchor, grid, cellW, cellH, curSpeed, deltaTime);
        }
        break;
      }
    }
  }

  private static steerToward(
    wraith: WraithEntity,
    target: Vec2,
    grid: GridCell[][],
    cellW: number,
    cellH: number,
    speed: number,
    deltaTime: number
  ): void {
    const startCoord: NodeCoord = {
      col: Math.floor(Math.max(0, wraith.pos.x) / cellW),
      row: Math.floor(Math.max(0, wraith.pos.y) / cellH),
    };
    const targetCoord: NodeCoord = {
      col: Math.floor(Math.max(0, target.x) / cellW),
      row: Math.floor(Math.max(0, target.y) / cellH),
    };

    const maxC = grid[0].length - 1;
    const maxR = grid.length - 1;
    startCoord.col = Math.min(maxC, startCoord.col);
    startCoord.row = Math.min(maxR, startCoord.row);
    targetCoord.col = Math.min(maxC, targetCoord.col);
    targetCoord.row = Math.min(maxR, targetCoord.row);

    const path = Pathfinding.aStar(grid, startCoord, targetCoord);

    let steerTarget = target;
    if (path.length > 1) {
      const nextCell = path[1];
      steerTarget = {
        x: nextCell.col * cellW + cellW / 2,
        y: nextCell.row * cellH + cellH / 2,
      };
    }

    const dx = steerTarget.x - wraith.pos.x;
    const dy = steerTarget.y - wraith.pos.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 1) {
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      wraith.pos.x += vx * deltaTime;
      wraith.pos.y += vy * deltaTime;
      wraith.velocity = { x: vx, y: vy };
    }
  }

  /**
   * Calculate edge screen red distortion position and intensity
   * so the player feels the threat without seeing the Wraith directly.
   */
  static getDistortionInfo(
    wraith: WraithEntity,
    playerPos: Vec2,
    screenWidth: number,
    screenHeight: number
  ): {
    active: boolean;
    intensity: number;
    angleRad: number;
    edgeX: number;
    edgeY: number;
  } {
    const dist = Math.hypot(wraith.pos.x - playerPos.x, wraith.pos.y - playerPos.y);
    const maxDist = 320;

    if (dist > maxDist) {
      return { active: false, intensity: 0, angleRad: 0, edgeX: 0, edgeY: 0 };
    }

    const intensity = Math.pow(1.0 - dist / maxDist, 1.5) * (wraith.state === 'FRENZY' ? 1.4 : 1.0);
    const angleRad = Math.atan2(wraith.pos.y - playerPos.y, wraith.pos.x - playerPos.x);

    // Compute edge screen coordinate for directional red flare
    const cx = screenWidth / 2;
    const cy = screenHeight / 2;
    const edgeX = cx + Math.cos(angleRad) * (cx - 16);
    const edgeY = cy + Math.sin(angleRad) * (cy - 24);

    return {
      active: true,
      intensity: Math.min(1.0, intensity),
      angleRad,
      edgeX,
      edgeY,
    };
  }
}
