// shots.js — deterministic posed scenes for the maker's screenshots.
// Open the game with ?shot=cover|approach|rings|sunset and it renders that
// exact moment, frozen, so screenshots are real renders of the game's code.

import { createPlane } from './physics.js';
import { createMissionState } from './missions.js';

export function parseShotMode() {
  const q = new URLSearchParams(window.location.search);
  const name = q.get('shot');
  if (!name) return null;
  return name;
}

export function poseForShot(name) {
  const plane = createPlane();
  const state = createMissionState('rings');
  state.startedAt = 1;
  let timeOfDay = 'day';

  if (name === 'cover') {
    Object.assign(plane, { x: 90, y: 150, z: 1080, heading: 0.06, pitch: 0.03, roll: -0.10, speed: 58, throttle: 0.72, fuel: 86 });
    state.nextRing = 0;
    state.score = 0;
  } else if (name === 'approach') {
    Object.assign(plane, { x: 20, y: 52, z: 2680, heading: -0.01, pitch: -0.045, roll: 0.03, speed: 41, throttle: 0.34, fuel: 64, gearDown: true, flaps: 1 });
    state.nextRing = 8;
    state.ringsDone = 8;
    state.score = 1180;
  } else if (name === 'rings') {
    Object.assign(plane, { x: -110, y: 468, z: -720, heading: 0.22, pitch: 0.04, roll: -0.38, speed: 66, throttle: 0.8, fuel: 71 });
    state.nextRing = 3;
    state.ringsDone = 3;
    state.score = 465;
  } else if (name === 'sunset') {
    Object.assign(plane, { x: 1250, y: 330, z: 1500, heading: 2.35, pitch: 0.02, roll: 0.28, speed: 61, throttle: 0.66, fuel: 58 });
    state.missionId = 'free';
    state.score = 210;
    timeOfDay = 'sunset';
  } else {
    return null;
  }
  return { plane, state, timeOfDay };
}
