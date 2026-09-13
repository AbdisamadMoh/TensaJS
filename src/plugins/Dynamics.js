/**
 * Tensa Dynamics Plugin - Natural physical motion
 * 
 * Includes:
 *   Dynamics.throwTo       - Inertia, friction, acceleration, and bouncing bounds
 *   Dynamics.applyGravity  - Gravity simulation with floor/ceiling bounce on X or Y axis
 *   Dynamics.springTo      - Hooke's law spring dynamics (stiffness, damping, mass)
 *   Dynamics.trackVelocity - Real-time velocity tracking for drag-and-throw
 *   Dynamics.applySlide    - Trigonometric inclined plane mechanics
 *   Dynamics.applyMagnetic - Hooke's law hover tracking mechanics
 */

import { throwTo } from './physics/ThrowTo.js';
import { applyGravity } from './physics/ApplyGravity.js';
import { springTo } from './physics/SpringTo.js';
import { trackVelocity } from './physics/TrackVelocity.js';
import { applySlide } from './physics/ApplySlide.js';
import { applyMagnetic } from './physics/Magnetic.js';
import { applyPendulum } from './physics/Pendulum.js';
import { applyFollower } from './physics/Follower.js';
import { applyFluidDrag } from './physics/FluidDrag.js';
import { applyRepulsion } from './physics/Repulsion.js';
import { applySwarm } from './physics/Swarm.js';
import { applyTether } from './physics/Tether.js';
import { applyOrbit } from './physics/Orbit.js';
import { applyCollision } from './physics/Collision.js';
import { applySoftBody } from './physics/SoftBody.js';
import { applyExplosion } from './physics/Explosion.js';

export { throwTo, applyGravity, springTo, trackVelocity, applySlide, applyMagnetic, applyPendulum, applyFollower, applyFluidDrag, applyRepulsion, applySwarm, applyTether, applyOrbit, applyCollision, applySoftBody, applyExplosion };

export const Dynamics = { throwTo, applyGravity, springTo, trackVelocity, applySlide, applyMagnetic, applyPendulum, applyFollower, applyFluidDrag, applyRepulsion, applySwarm, applyTether, applyOrbit, applyCollision, applySoftBody, applyExplosion };
export default Dynamics;
