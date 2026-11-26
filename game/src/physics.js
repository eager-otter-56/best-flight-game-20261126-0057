// physics.js — a flight model with weight: control inertia, angle of attack,
// load factor, an energy balance that settles into the phugoid, ground effect,
// ridge lift, and a stall that breaks like the real thing.
//
// The aeroplane carries two pitch angles:
//   att   — where the nose points, driven by the stick through a spring
//   pitch — where the aeroplane actually goes (the flight-path angle)
// Their difference is the angle of attack, and lift follows from it. Pull the
// nose up and the path bends only as fast as lift can bend it; hold the nose
// up while slow and lift collapses — the nose drops on its own.

export function createPlane() {
  return {
    x: 0, y: 90, z: 3050, // starts on final-approach line south of the runway
    heading: 0, // radians, 0 = north (-z), clockwise positive
    pitch: 0, roll: 0,
    att: 0, attVel: 0, // nose attitude and its rate
    slip: 0, aoa: 0, loadFactor: 1, verticalAir: 0, t: 0,
    speed: 52, // m/s
    throttle: 0.62,
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
const G = 9.81;
const TRIM_SPEED = 52;

export function stepPlane(p, input, dt, groundAt) {
  if (p.crashed || p.landed) return p;
  const t = dt;
  p.t += t;
  const ground = groundAt(p.x, p.z);
  const agl = p.y - ground;

  if (input.throttleUp) p.throttle = clamp(p.throttle + 0.55 * t, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - 0.55 * t, 0, 1);

  // --- control response with inertia: the airframe takes time to answer ---
  const rollTarget = input.roll * 1.02;
  const rollBefore = p.roll;
  p.roll += (rollTarget - p.roll) * (1 - Math.exp(-3.4 * t));
  const rollRate = (p.roll - rollBefore) / Math.max(t, 0.001);

  p.attVel += ((input.pitch * 0.8) - p.attVel) * Math.min(1, 5.2 * t);
  p.att += p.attVel * t;
  // longitudinal stability: left alone the nose settles back toward the path
  p.attVel += (p.pitch - p.att) * 0.55 * t;
  p.att = clamp(p.att, -0.55, 0.6);

  // --- angle of attack, lift, load factor ---
  const aoa = p.att - p.pitch;
  p.aoa = aoa;
  let liftN = (p.speed * p.speed) / (TRIM_SPEED * TRIM_SPEED)
    * clamp(1 + aoa * 4.2 + (p.flaps ? 0.48 : 0), 0.3, 2.6);
  if (agl < 15 && p.airborne) liftN += (1 - agl / 15) * 0.14; // ground-effect cushion
  p.loadFactor = liftN / Math.max(0.35, Math.cos(p.roll));

  const critAoa = p.flaps ? 0.36 : 0.30;
  p.stall = p.airborne && aoa > critAoa && p.speed < 66;
  if (aoa > critAoa) {
    liftN *= Math.max(0.45, 1 - (aoa - critAoa) * 3.4);
    // the nose drops through the break, harder than the stick can hold it up
    p.attVel -= (aoa - critAoa) * 7.0 * t;
    p.att -= (aoa - critAoa) * 1.6 * t;
  }

  // the flight path bends toward where lift points — slowly when slow,
  // which is exactly why a heavy aeroplane feels heavy
  const gammaRate = (G / Math.max(p.speed, 20)) * (liftN * Math.cos(p.roll) - Math.cos(p.pitch));
  p.pitch += clamp(gammaRate, -1.4, 1.4) * t;
  p.pitch = clamp(p.pitch, -1.05, 0.8);

  // --- the turn: g·tan(bank)/v, plus adverse yaw and a touch of P-factor ---
  // heading is a true bearing: forward = (sin h, -cos h), so a right bank
  // (roll > 0) must INCREASE it. (A minus here mirrors the whole world
  // against the compass the pilot is steering by.)
  const yawRate = (G * Math.tan(p.roll) / Math.max(p.speed, 24)) * 1.45;
  p.heading += yawRate * t;
  p.heading -= rollRate * 0.055 * t; // adverse yaw drags the nose out of the roll
  p.heading -= (p.throttle - 0.35) * 0.012 * t * (56 / Math.max(p.speed, 28));
  const slipTarget = clamp((rollTarget - p.roll) * 1.1, -1, 1);
  p.slip += (slipTarget - p.slip) * (1 - Math.exp(-2.6 * t));

  // --- energy: thrust against drag, gravity taxing every climb ---
  const thrust = p.throttle * 33 * (p.fuel > 0 ? 1 : 0);
  const parasite = 2.1 + 0.0068 * p.speed * p.speed;
  const induced = 3.1 * liftN * liftN * (42 / Math.max(p.speed, 24));
  const gearDrag = p.gearDown ? 1.5 : 0;
  const accel = thrust - parasite - induced - gearDrag - G * Math.sin(p.pitch) * 0.92;
  p.speed = clamp(p.speed + accel * t, 0, 118);

  // --- the air itself moves: ridge lift on windward slopes, gentle gusts ---
  let verticalAir = 0;
  if (agl < 240 && p.airborne) {
    const slopeWind = (groundAt(p.x + 46, p.z) - groundAt(p.x - 46, p.z)) / 92;
    verticalAir += clamp(slopeWind * p.speed * 0.11, -3.4, 3.4);
  }
  verticalAir += Math.sin(p.t * 0.9 + p.x * 0.008) * Math.cos(p.t * 0.63 + p.z * 0.011)
    * (agl < 320 ? 0.85 : 0.25);
  p.verticalAir = verticalAir;

  // --- integrate the path ---
  const fx = Math.sin(p.heading) * Math.cos(p.pitch);
  const fz = -Math.cos(p.heading) * Math.cos(p.pitch);
  p.x += fx * p.speed * t;
  p.z += fz * p.speed * t;
  let vy = Math.sin(p.pitch) * p.speed + verticalAir;
  if (vy < 0 && agl < 15 && p.airborne) vy *= 0.45 + (agl / 15) * 0.55; // the flare floats
  p.vy = vy;
  p.y += vy * t;

  p.fuel = Math.max(0, p.fuel - (0.16 + p.throttle * 0.85) * t);

  // --- ground contact (same strip rules as always) ---
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
      p.att = Math.max(0, p.att - t);
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
  const d = ((p.heading * 180 / Math.PI) % 360 + 360) % 360;
  return d;
}

export function speedKnots(p) {
  return p.speed * 1.944;
}

export function altitudeFeet(p) {
  return p.y * 3.281;
}
