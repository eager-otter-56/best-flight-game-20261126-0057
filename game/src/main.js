// main.js — Sky Harbor Run: boot, the game loop and the screen state machine
// (title -> briefing -> flying -> debrief), wiring physics, rendering, the
// cockpit, the HUD, missions and sound together.

import { createInput } from './input.js';
import { createPlane, stepPlane } from './physics.js';
import { groundHeight, RING_COURSE, buildTrees, buildTown, buildClouds } from './terrain.js';
import { makeCamera, project, drawSky, drawTerrain, drawRunway, drawRing, drawScenery, drawClouds } from './render3d.js';
import { drawAircraft, drawPropWash } from './aircraft.js';
import { drawCockpit } from './cockpit.js';
import { drawHUD, drawTargetMarker, drawMinimap, drawBanner } from './hud.js';
import { MISSIONS, createMissionState, updateMission, ringState, nextTarget } from './missions.js';
import { createAudio } from './audio.js';
import { parseShotMode, poseForShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const input = createInput(canvas);
const audio = createAudio();
const trees = buildTrees();
const town = buildTown();
const clouds = buildClouds();

let screen = 'title'; // title | flying | debrief
let plane = createPlane();
let state = createMissionState('rings');
let timeOfDay = 'day';
let last = performance.now();
let elapsed = 0;
let paused = false;
let wasAirborne = false;

const groundAt = (x, z) => groundHeight(x, z);

function startMission(id) {
  plane = createPlane();
  if (id === 'rings') Object.assign(plane, { x: -1400, y: 260, z: 1500, heading: 0.5, speed: 56 });
  if (id === 'free') Object.assign(plane, { x: 1800, y: 380, z: -400, heading: 2.6, speed: 60 });
  state = createMissionState(id);
  screen = 'flying';
  paused = false;
  audio.start();
}

function render(t) {
  const cam = makeCamera(plane, true);
  if (plane.stall) {
    // buffet: the whole airframe shudders as the wing lets go
    cam.x += Math.sin(t * 43) * 0.55;
    cam.y += Math.cos(t * 37) * 0.45;
  }
  drawSky(ctx, W, H, cam, timeOfDay);
  drawTerrain(ctx, W, H, cam, timeOfDay);
  drawScenery(ctx, W, H, cam, trees, town);
  drawRunway(ctx, W, H, cam, t);
  RING_COURSE.forEach((ring, i) => drawRing(ctx, W, H, cam, ring, ringState(state, i), t));
  drawClouds(ctx, W, H, cam, clouds, timeOfDay);
  drawPropWash(ctx, W, H, plane);
  drawAircraft(ctx, W, H, plane, input, t, groundHeight(plane.x, plane.z));
  const target = nextTarget(state, plane);
  drawTargetMarker(ctx, W, H, (x, y, z, out) => project(cam, W, H, x, y, z, out), target, plane);
  drawHUD(ctx, W, H, plane, state, target, t);
  drawMinimap(ctx, W, H, plane, state);
  drawCockpit(ctx, W, H, plane, t);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  input.poll();

  if (screen === 'title') {
    // the attract view actually flies: forward over the island on a wide,
    // gentle circuit, high enough to clear the peaks
    plane.heading += dt * 0.055;
    plane.x += Math.sin(plane.heading) * 55 * dt;
    plane.z += -Math.cos(plane.heading) * 55 * dt;
    plane.y = 560 + Math.sin(elapsed * 0.3) * 30;
    plane.roll = -0.32;
    plane.speed = 55;
    render(elapsed);
    drawBanner(ctx, W, H, 'SKY HARBOR RUN', [
      'An original island flight game — gates, landings and one careful fuel gauge.',
      '',
      'Press 1 · RING RUNNER      2 · HARBOUR LANDING      3 · FREE FLIGHT',
      'Arrows steer · mouse drags the stick · Shift/Ctrl throttle · G gear · F flaps · R restart',
    ]);
    if (input.missionPick) startMission(MISSIONS[input.missionPick - 1].id);
    else if (input.startRequested || input.pitch !== 0 || input.roll !== 0) startMission('rings');
  } else if (screen === 'flying') {
    if (input.pause) paused = !paused;
    if (input.restart) startMission(state.missionId);
    if (input.toggleGear) plane.gearDown = !plane.gearDown;
    if (input.toggleFlaps) plane.flaps = plane.flaps ? 0 : 1;
    if (!paused) {
      const before = state.nextRing;
      stepPlane(plane, input, dt, groundAt);
      updateMission(state, plane, dt);
      if (state.nextRing > before) audio.gate();
      if (wasAirborne && plane.onGround) audio.touchdown();
      if (plane.crashed) audio.crash();
      wasAirborne = plane.airborne;
      audio.update(plane);
      if (state.finished) screen = 'debrief';
    }
    render(elapsed);
    if (paused) drawBanner(ctx, W, H, 'PAUSED', ['Press P to resume · R to restart the sortie']);
  } else if (screen === 'debrief') {
    render(elapsed);
    drawBanner(ctx, W, H, plane.crashed ? 'FLIGHT ENDED' : 'DEBRIEF', [
      state.verdict,
      `Score ${Math.round(state.score)} · Time ${Math.round(state.elapsed)}s · Fuel left ${Math.round(plane.fuel)}% · Hull ${Math.max(0, Math.round(100 - plane.damage))}%`,
      '',
      'Press R to fly again · 1 / 2 / 3 to change mission',
    ], plane.crashed ? '#ff5e4d' : '#57e389');
    if (input.restart) startMission(state.missionId);
    if (input.missionPick) startMission(MISSIONS[input.missionPick - 1].id);
  }
  input.consume();
  requestAnimationFrame(frame);
}

// Screenshot mode: pose one frozen, fully-instrumented moment and hold it.
const shotName = parseShotMode();
if (shotName) {
  const pose = poseForShot(shotName);
  if (pose) {
    plane = pose.plane;
    state = pose.state;
    timeOfDay = pose.timeOfDay;
    screen = 'flying';
    render(2.4);
    document.body.dataset.shotReady = '1';
  } else {
    requestAnimationFrame(frame);
  }
} else {
  requestAnimationFrame(frame);
}
