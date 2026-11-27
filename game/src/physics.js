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
    rollRate: 0, yawRate: 0, // body rates from the lateral-directional model
    slip: 0, aoa: 0, loadFactor: 1, verticalAir: 0, t: 0,
    gearSpring: 0, gearSpringVel: 0, flapTransient: 0, flapsPrev: 0,
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

  // --- lateral-directional dynamics, after JSBSim's coefficient build-up ---
  // State: sideslip beta (kept in p.slip), roll rate, yaw rate, bank. The
  // aileron commands roll RATE, not bank angle: centre the stick and the
  // rolling stops, but the bank STAYS — only the slow spiral mode coaxes
  // it back, over a minute or more. Sideslip couples everything: a banked
  // aeroplane slides toward its low wing, the fin weathercocks the nose
  // into the relative wind, dihedral rolls against the slip — and the
  // lightly damped weave that falls out of the loop is the Dutch roll.
  // The derivatives below are dimensional (per radian), taken from the
  // classic light-aeroplane data sets JSBSim ships, scaled from the
  // 52 m/s trim by dynamic pressure: stiffness and control power with
  // v^2, damping with v. Measured on this airframe: roll subsidence
  // tau ~0.12 s, steady roll ~65 deg/s, Dutch roll period ~2 s damped
  // in a couple of cycles, and a spiral mode so slow the bank is still
  // within a few degrees after 30 s hands-off — it settles into a
  // gentle sustained turn rather than levelling itself.
  const vRef = Math.max(p.speed, 18) / TRIM_SPEED;
  const s1 = vRef;            // damping derivatives scale ~ v
  const s2 = vRef * vRef;     // stiffness / control derivatives ~ v^2
  const Yb = -0.14 * s1;      // side-force damping
  const Lb = -7.5 * s2;       // dihedral effect: roll due to sideslip
  const Lp = -8.7 * s1;       // roll damping (roll subsidence)
  const Lr = 2.2 * s1;        // roll due to yaw rate
  const Lda = 13.0 * s2;      // aileron power, per unit stick
  const Nb = 7.3 * s2;        // weathercock stability (the fin)
  const Np = -0.36 * s1;      // yaw due to roll rate
  const Nr = -1.9 * s1;       // yaw damping (the fin again)
  const Nda = -0.84 * s2;     // adverse yaw, per unit stick
  // engine torque as a rolling moment, and P-factor as a yawing moment:
  // both fight through the same damping as everything else now
  const torque = p.airborne ? -(p.throttle - 0.55) * 0.38 * (42 / Math.max(p.speed, 26)) : 0;
  const pFactor = -(p.throttle - 0.35) * 0.05 * (56 / Math.max(p.speed, 28));
  const steps = Math.max(1, Math.ceil(t / 0.0167));
  const h = t / steps;
  for (let i = 0; i < steps; i++) {
    const beta = p.slip;
    const pr = p.rollRate;
    const rr = p.yawRate;
    const sinR = Math.sin(p.roll);
    const betaDot = Yb * beta + (G / Math.max(p.speed, 18)) * sinR * (1 + 0.35 * sinR * sinR) - rr;
    let pDot = Lb * beta + Lp * pr + Lr * rr + Lda * input.roll + torque;
    if (p.stall) pDot += Math.sin(p.t * 1.9) * 2.0; // a wing drops at the break
    const rDot = Nb * beta + Np * pr + Nr * rr + Nda * input.roll + pFactor;
    p.slip = clamp(beta + betaDot * h, -0.5, 0.5);
    p.rollRate = pr + pDot * h;
    p.yawRate = rr + rDot * h;
    if (p.onGround) {
      p.rollRate *= Math.exp(-6 * h);
      p.yawRate *= Math.exp(-4 * h);
      p.slip *= Math.exp(-4 * h);
    }
    p.roll = clamp(p.roll + p.rollRate * h, -1.25, 1.25);
    if (p.onGround) p.roll *= Math.exp(-3 * h); // the gear settles wings-level
    p.heading += p.yawRate * h;
  }

  // flaps travel: deploying them balloons the aeroplane upward for a
  // moment (and pitches the nose), retracting lets it sink back
  if (p.flaps !== p.flapsPrev) {
    p.flapTransient = p.flaps ? 1 : -0.7;
    p.flapsPrev = p.flaps;
  }
  p.flapTransient *= Math.exp(-1.7 * t);

  // the elevator's bite scales with dynamic pressure too: mushy when slow
  const effP = clamp(0.55 + 0.45 * s2, 0.55, 1.3);
  p.attVel += ((input.pitch * 0.8 * effP) - p.attVel) * Math.min(1, 5.2 * t);
  p.att += p.attVel * t;
  // longitudinal stability: left alone the nose settles back toward the path
  p.attVel += (p.pitch - p.att) * 0.55 * t;
  p.att = clamp(p.att, -0.55, 0.6);

  // --- angle of attack, lift, load factor ---
  const aoa = p.att - p.pitch;
  p.aoa = aoa;
  let liftN = (p.speed * p.speed) / (TRIM_SPEED * TRIM_SPEED)
    * clamp(1 + aoa * 4.2 + (p.flaps ? 0.48 : 0) + p.flapTransient * 0.30, 0.3, 2.6);
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

  // --- the turn itself falls out of the lateral model above: heading was
  // integrated from the yaw rate the fin, the slip and the bank produce,
  // which settles within a few percent of the coordinated g·tan(bank)/v ---

  // --- energy: thrust against drag, gravity taxing every climb ---
  const thrust = p.throttle * 33 * (p.fuel > 0 ? 1 : 0);
  const parasite = 2.1 + 0.0068 * p.speed * p.speed;
  const induced = 3.1 * liftN * liftN * (42 / Math.max(p.speed, 24));
  const gearDrag = p.gearDown ? 1.5 : 0;
  const flapDrag = p.flaps ? 1.15 : 0;
  const accel = thrust - parasite - induced - gearDrag - flapDrag - G * Math.sin(p.pitch) * 0.92;
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
  // weight on wheels: once she has settled, gusts and ground-effect lift
  // cannot pluck her off the runway again — she stays pinned until the
  // wing is genuinely flying (lift well past weight)
  const floor = ground + 3.2;
  const touching = p.y <= floor || (p.onGround && p.y <= floor + 0.6 && liftN < 1.3);
  if (touching) {
    p.y = floor;
    const hard = -p.vy;
    const onRunwayBench = Math.abs(p.x) < 60 && Math.abs(p.z - 1750) < 640 && ground < 20;
    if (onRunwayBench && p.gearDown && hard < 7.5 && p.speed < 62 && Math.abs(p.roll) < 0.22) {
      if (p.airborne) p.gearSpringVel -= Math.min(hard, 9) * 0.30; // the oleo takes the arrival
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
      p.gearSpringVel -= Math.min(hard, 9) * 0.18;
      p.vy = Math.abs(p.vy) * 0.25;
      p.y = floor + 0.5;
      if (p.damage >= 100) p.crashed = true;
    }
  } else {
    p.onGround = false;
    p.airborne = true;
  }

  // landing-gear oleo spring: compresses on arrival, settles with a wobble
  p.gearSpringVel += (-26 * p.gearSpring - 5.2 * p.gearSpringVel) * t;
  p.gearSpring = clamp(p.gearSpring + p.gearSpringVel * t, -0.6, 0.3);
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
