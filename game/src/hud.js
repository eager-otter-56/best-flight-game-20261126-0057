// hud.js — the head-up display: altitude, speed and heading readouts, the
// target marker and distance tape, mission banners, and the island minimap.

import { headingDegrees, speedKnots, altitudeFeet } from './physics.js';
import { RING_COURSE, WORLD } from './terrain.js';

export function drawHUD(ctx, w, h, plane, state, target, t) {
  // top instrument tape
  ctx.fillStyle = 'rgba(8,14,22,0.86)';
  ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = 'rgba(255,200,110,0.35)';
  ctx.fillRect(0, 54, w, 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aee2ff';
  ctx.font = '700 24px ui-monospace, monospace';
  ctx.fillText(`ALT ${String(Math.round(altitudeFeet(plane))).padStart(4, ' ')} FT`, 22, 37);
  ctx.fillStyle = '#ffe1a1';
  ctx.fillText(`SPD ${String(Math.round(speedKnots(plane))).padStart(3, ' ')} KT`, 268, 37);
  ctx.fillStyle = '#b8ffc9';
  ctx.fillText(`HDG ${String(Math.round(headingDegrees(plane))).padStart(3, '0')}°`, 486, 37);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${Math.round(state.score)}`, w - 190, 37);

  // heading ribbon with cardinal letters
  const hdg = headingDegrees(plane);
  ctx.save();
  ctx.beginPath();
  ctx.rect(w / 2 - 170, 60, 340, 24);
  ctx.clip();
  ctx.fillStyle = 'rgba(8,14,22,0.45)';
  ctx.fillRect(w / 2 - 170, 60, 340, 24);
  ctx.font = '700 15px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (let off = -60; off <= 60; off += 10) {
    const deg = ((Math.round((hdg + off) / 10) * 10) % 360 + 360) % 360;
    const x = w / 2 + off * 2.8;
    const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg];
    ctx.fillStyle = card ? '#ffd98f' : '#9fc6e8';
    ctx.fillText(card || String(deg / 10).padStart(2, '0'), x, 79);
  }
  ctx.restore();
  ctx.fillStyle = '#ff5e4d';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, 58);
  ctx.lineTo(w / 2 + 6, 58);
  ctx.lineTo(w / 2, 66);
  ctx.closePath();
  ctx.fill();

  // centre pipper
  ctx.strokeStyle = 'rgba(140,255,170,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.42, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w / 2 - 26, h * 0.42);
  ctx.lineTo(w / 2 - 13, h * 0.42);
  ctx.moveTo(w / 2 + 13, h * 0.42);
  ctx.lineTo(w / 2 + 26, h * 0.42);
  ctx.stroke();

  // stall / gear warnings in the pilot's face
  ctx.textAlign = 'center';
  if (plane.stall && Math.sin(t * 12) > -0.2) {
    ctx.fillStyle = '#ff5e4d';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText('STALL', w / 2, h * 0.30);
  }
  if (!plane.gearDown && plane.y < 130 && plane.airborne) {
    ctx.fillStyle = '#ffb63d';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText('GEAR UP — PRESS G', w / 2, h * 0.335);
  }
  if (state.gateFlash > 0) {
    ctx.fillStyle = `rgba(120,255,160,${Math.min(1, state.gateFlash * 1.6)})`;
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText('GATE CLEAR  +100', w / 2, h * 0.24);
  }
}

export function drawTargetMarker(ctx, w, h, projectFn, target, plane) {
  const p = {};
  if (!projectFn(target.x, target.y, target.z, p)) return;
  const dist = Math.hypot(plane.x - target.x, plane.z - target.z);
  const size = Math.max(9, Math.min(30, p.s * 16));
  ctx.strokeStyle = '#ffb63d';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(p.x - size, p.y - size, size * 2, size * 2);
  ctx.fillStyle = '#ffb63d';
  ctx.font = '700 14px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${target.label}  ${Math.round(dist)}m`, p.x, p.y - size - 8);
}

export function drawMinimap(ctx, w, h, plane, state) {
  const S = 148;
  const x0 = w - S - 16;
  const y0 = 68;
  ctx.fillStyle = 'rgba(8,20,30,0.9)';
  ctx.fillRect(x0, y0, S, S);
  ctx.strokeStyle = 'rgba(160,210,240,0.6)';
  ctx.strokeRect(x0, y0, S, S);
  const map = (x, z) => [x0 + S / 2 + (x / 9200) * S, y0 + S / 2 + (z / 9200) * S];
  // island blob + runway
  ctx.fillStyle = 'rgba(90,160,90,0.5)';
  ctx.beginPath();
  ctx.arc(x0 + S / 2, y0 + S / 2, S * 0.42, 0, Math.PI * 2);
  ctx.fill();
  const [rx, rz] = map(WORLD.runway.x, WORLD.runway.z);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(rx - 1.5, rz - 9, 3, 18);
  RING_COURSE.forEach((r, i) => {
    const [gx, gz] = map(r.x, r.z);
    ctx.fillStyle = state.missionId === 'rings' && i < state.nextRing ? '#57e389' : i === state.nextRing ? '#ffb63d' : '#cfd8de';
    ctx.beginPath();
    ctx.arc(gx, gz, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  const [px, pz] = map(plane.x, plane.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(plane.heading);
  ctx.fillStyle = '#ff5e4d';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#aee2ff';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SKY HARBOR ISLAND', x0 + 8, y0 + S - 8);
}

export function drawBanner(ctx, w, h, title, lines, accent = '#ffb63d') {
  ctx.fillStyle = 'rgba(6,12,20,0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '800 54px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h * 0.30);
  ctx.fillStyle = '#f2f6fa';
  ctx.font = '500 21px system-ui, sans-serif';
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h * 0.40 + i * 32));
}
