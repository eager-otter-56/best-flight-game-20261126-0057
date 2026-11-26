// missions.js — the three ways to fly Sky Harbor Run: the Ring Runner course,
// the Harbour Landing challenge, and Free Flight over the island. Scoring
// rewards clean gates, gentle touchdowns and fuel left in the tank.

import { RING_COURSE, WORLD } from './terrain.js';

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUNNER',
    brief: 'Fly all 8 gates in order, then land on the runway.',
    detail: 'Arrows steer · Shift/Ctrl throttle · G gear · F flaps',
  },
  {
    id: 'landing',
    name: 'HARBOUR LANDING',
    brief: 'One clean approach: touch down gently on the runway, gear down, under 120 kt.',
    detail: 'A firm arrival bends the airframe. A very firm one ends the flight.',
  },
  {
    id: 'free',
    name: 'FREE FLIGHT',
    brief: 'No clock, no gates. Explore the island, mind the fuel gauge.',
    detail: 'The lighthouse marks the harbour. The peaks bite back.',
  },
];

export function createMissionState(missionId) {
  return {
    missionId,
    nextRing: 0,
    ringsDone: 0,
    score: 0,
    startedAt: 0,
    elapsed: 0,
    finished: false,
    verdict: '',
    gateFlash: 0,
  };
}

export function ringState(state, idx) {
  if (state.missionId !== 'rings') return idx === 0 ? 'next' : 'idle';
  if (idx < state.nextRing) return 'done';
  if (idx === state.nextRing) return 'next';
  return 'idle';
}

export function updateMission(state, plane, dt) {
  if (state.finished) return state;
  state.elapsed += dt;
  if (state.gateFlash > 0) state.gateFlash -= dt;

  if (state.missionId === 'rings' && state.nextRing < RING_COURSE.length) {
    const ring = RING_COURSE[state.nextRing];
    const d = Math.hypot(plane.x - ring.x, plane.z - ring.z);
    const dy = Math.abs(plane.y - ring.y);
    if (d < 46 && dy < ring.r) {
      state.nextRing += 1;
      state.ringsDone += 1;
      state.score += 100 + Math.max(0, 60 - Math.round(dy));
      state.gateFlash = 0.7;
    }
  }

  if (plane.landed) {
    state.finished = true;
    const rw = WORLD.runway;
    const onStrip = Math.abs(plane.x - rw.x) < rw.width && Math.abs(plane.z - rw.z) < rw.length / 2;
    if (state.missionId === 'rings') {
      state.score += state.ringsDone * 25 + Math.round(plane.fuel) * 4;
      state.verdict = state.ringsDone === RING_COURSE.length
        ? 'FULL COURSE — every gate, home and dry.'
        : `Landed with ${state.ringsDone} of ${RING_COURSE.length} gates. The rest are still out there.`;
    } else if (state.missionId === 'landing') {
      state.score = onStrip ? 300 + Math.round(plane.fuel) * 4 - Math.round(plane.damage) * 2 : 40;
      state.verdict = onStrip
        ? 'TEXTBOOK — the harbour crew applauds a gentle arrival.'
        : 'Down, but not on the strip. The logbook will mention it.';
    } else {
      state.score = Math.round(state.elapsed) + Math.round(plane.fuel) * 2;
      state.verdict = 'Back on the ground. The island keeps its secrets.';
    }
  }
  if (plane.crashed) {
    state.finished = true;
    state.verdict = state.missionId === 'free'
      ? 'The island wins this round. Press R to fly again.'
      : 'Airframe lost. Press R to brief again.';
  }
  if (plane.fuel <= 0 && plane.y > 30 && state.missionId !== 'free') {
    // gliding home on fumes is allowed; the score simply stops growing
    state.score = Math.max(0, state.score - dt * 2);
  }
  return state;
}

export function nextTarget(state, plane) {
  if (state.missionId === 'rings' && state.nextRing < RING_COURSE.length) {
    const r = RING_COURSE[state.nextRing];
    return { x: r.x, y: r.y, z: r.z, label: `GATE ${state.nextRing + 1}` };
  }
  const rw = WORLD.runway;
  return { x: rw.x, y: rw.elevation + 6, z: rw.z, label: 'RUNWAY' };
}
