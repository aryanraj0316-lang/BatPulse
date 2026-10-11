import { Vec2, PlayerEntity } from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';

export class MovementSystem {
  /**
   * Updates player physics: acceleration, friction, rotation heading,
   * momentum accumulation, and sprint footstep echo checks.
   */
  static updatePlayer(
    player: PlayerEntity,
    input: Vec2, // Joystick input (-1 to 1)
    whisperStepEquipped: boolean,
    deltaTime: number,
    now: number
  ): {
    deltaPos: Vec2;
    isSprinting: boolean;
    emittedFootstep: boolean;
  } {
    const magnitude = Math.hypot(input.x, input.y);
    let isSprinting = false;
    let emittedFootstep = false;

    // Effective sprint threshold (reduced if Whisper Step ability equipped)
    const sprintThreshold = whisperStepEquipped
      ? GAME_CONFIG.MOVEMENT_NOISE_THRESHOLD * 1.35
      : GAME_CONFIG.MOVEMENT_NOISE_THRESHOLD;

    if (magnitude > 0.08) {
      player.isMoving = true;
      const dirX = input.x / magnitude;
      const dirY = input.y / magnitude;

      // Target velocity
      const targetSpeed = GAME_CONFIG.PLAYER_SPEED * Math.min(1.0, magnitude);
      const targetVx = dirX * targetSpeed;
      const targetVy = dirY * targetSpeed;

      // Smooth acceleration lerp
      player.velocity.x += (targetVx - player.velocity.x) * GAME_CONFIG.PLAYER_ACCEL * deltaTime;
      player.velocity.y += (targetVy - player.velocity.y) * GAME_CONFIG.PLAYER_ACCEL * deltaTime;

      // Rotate smoothly towards movement direction
      const targetRotation = Math.atan2(dirY, dirX);
      let diff = targetRotation - player.rotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      player.rotation += diff * 0.25;

      // Check sprint noise
      if (magnitude > sprintThreshold) {
        isSprinting = true;
        player.footstepTimer += deltaTime * 1000;
        if (player.footstepTimer > 320) {
          player.footstepTimer = 0;
          emittedFootstep = true;
        }
      } else {
        player.footstepTimer = 0;
      }

      // Build Momentum (+1 per 0.5s movement, capped at 20)
      player.momentumTimer += deltaTime * 1000;
      if (player.momentumTimer >= GAME_CONFIG.MOMENTUM_TICK) {
        player.momentumTimer = 0;
        if (player.momentum < GAME_CONFIG.MOMENTUM_CAP) {
          player.momentum += 1;
        }
      }
    } else {
      player.isMoving = false;
      player.footstepTimer = 0;
      // Damping / friction when idle
      player.velocity.x += (0 - player.velocity.x) * GAME_CONFIG.PLAYER_FRICTION * deltaTime;
      player.velocity.y += (0 - player.velocity.y) * GAME_CONFIG.PLAYER_FRICTION * deltaTime;
    }

    const deltaPos: Vec2 = {
      x: player.velocity.x * deltaTime,
      y: player.velocity.y * deltaTime,
    };

    return { deltaPos, isSprinting, emittedFootstep };
  }
}
