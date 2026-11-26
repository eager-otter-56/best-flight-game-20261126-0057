// physics.js — the flight model: throttle, lift, stall, coordinated turns,
// fuel burn and damage. Tuned so disciplined flying is fast and greedy flying bites.

export function createPlane() {
  return {
    x: 0, y: 90, z: 3050, // starts on final-approach line south of the runway
    heading: 0, // radians, 0 = north (-z), clockwise positive
    pitch: 0, roll: 0,
    speed: 52, // m/s
    throttle: 0.55,
    vy: 0,
    fuel: 100,
    damage: 0,
    gearDown: true,
    flaps: 0, // 0 or 1
    airborne: true,
    crashed: false,
    landed: false,
    stall: false,
    onGround: false,
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function stepPlane(p, input, dt, groundAt) {
  if (p.crashed || p.landed) return p;
  const t = dt;

  // Controls: throttle and surfaces answer at every speed, weaker when slow.
  if (input.throttleUp) p.throttle = clamp(p.throttle + 0.55 * t, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - 0.55 * t, 0, 1);
  const authority = clamp(p.speed / 46, 0.25, 1);
  const pitchRate = input.pitch * 0.85 * authority;
  const rollRate = input.roll * 1.9 * authority;
  p.roll = clamp(p.roll + rollRate * t - p.roll * 1.4 * t * (input.roll === 0 ? 1 : 0.25), -1.15, 1.15);
  p.pitch = clamp(p.pitch + pitchRate * t - Math.sin(p.roll) * 0.12 * t, -0.5, 0.62);

  // A banked wing turns the nose; steep banks bleed speed and sink.
  p.heading -= Math.sin(p.roll) * (p.speed / 210) * t * 2.4;
  const enginePower = p.throttle * 15.5 * (p.fuel > 0 ? 1 : 0);
  const drag = 0.0038 * p.speed * p.speed + Math.abs(p.roll) * 2.6 + (p.gearDown ? 1.1 : 0) + p.flaps * 2.2;
  const climbPush = Math.sin(p.pitch) * 9.2;
  p.speed = clamp(p.speed + (enginePower - drag * 0.32 - climbPush) * t * 2.1, 0, 118);

  // Lift versus weight: below the stall speed the nose drops and the sink grows.
  const stallSpeed = p.flaps ? 24 : 31;
  p.stall = p.airborne && p.speed < stallSpeed;
  const lift = clamp(p.speed / stallSpeed, 0, 1.35);
  let climb = Math.sin(p.pitch) * p.speed * 0.72 * lift - (1 - Math.min(1, lift)) * 13;
  climb -= Math.abs(Math.sin(p.roll)) * p.speed * 0.16;
  if (p.stall) p.pitch = clamp(p.pitch - 0.35 * t, -0.5, 0.62);
  p.vy = climb;

  const fx = Math.sin(p.heading) * Math.cos(p.pitch);
  const fz = -Math.cos(p.heading) * Math.cos(p.pitch);
  p.x += fx * p.speed * t;
  p.z += fz * p.speed * t;
  p.y += p.vy * t;

  p.fuel = Math.max(0, p.fuel - (0.16 + p.throttle * 0.85) * t);

  const ground = groundAt(p.x, p.z);
  const floor = ground + 3.2;
  if (p.y <= floor) {
    p.y = floor;
    const hard = -p.vy;
    const onRunwayBench = Math.abs(p.x) < 60 && Math.abs(p.z - 1750) < 640 && ground < 20;
    if (onRunwayBench && p.gearDown && hard < 7.5 && p.speed < 62 && Math.abs(p.roll) < 0.22) {
      p.onGround = true;
      p.airborne = false;
      p.vy = 0;
      p.pitch = Math.max(0, p.pitch - t);
      p.speed = clamp(p.speed - 9 * t, 0, 118);
      if (p.speed < 2) { p.landed = true; p.speed = 0; }
    } else if (hard > 13 || Math.abs(p.roll) > 0.55 || !p.gearDown) {
      p.crashed = true;
      p.damage = 100;
    } else {
      p.damage = Math.min(100, p.damage + hard * 2.4);
      p.vy = Math.abs(p.vy) * 0.25;
      p.y = floor + 0.5;
      if (p.damage >= 100) p.crashed = true;
    }
  } else {
    p.onGround = false;
    p.airborne = true;
  }
  return p;
}

export function headingDegrees(p) {
  const d = ((-p.heading * 180 / Math.PI) % 360 + 360) % 360;
  return d;
}

export function speedKnots(p) {
  return p.speed * 1.944;
}

export function altitudeFeet(p) {
  return p.y * 3.281;
}
