// cockpit.js — the instrument panel across the bottom of the screen: six lit
// steam gauges (airspeed, attitude, altimeter, heading, vertical speed, RPM),
// a throttle quadrant, fuel and damage bars, and warning lamps that light up.

import { headingDegrees, speedKnots, altitudeFeet } from './physics.js';

function gaugeFrame(ctx, x, y, r, label) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, '#2b2f36');
  g.addColorStop(1, '#101216');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c8ccd2';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,190,90,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r - 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd98f';
  ctx.font = `600 ${Math.round(r * 0.24)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + r * 0.78);
}

function needle(ctx, x, y, r, angle, colour = '#ffcf5e') {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(angle) * r * 0.18, y - Math.sin(angle) * r * 0.18);
  ctx.lineTo(x + Math.cos(angle) * r * 0.82, y + Math.sin(angle) * r * 0.82);
  ctx.stroke();
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
}

function ticks(ctx, x, y, r, count, a0, a1) {
  ctx.strokeStyle = '#e8ecf0';
  ctx.lineWidth = 1.6;
  for (let i = 0; i <= count; i++) {
    const a = a0 + (a1 - a0) * (i / count);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    ctx.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94);
    ctx.stroke();
  }
}

export function drawCockpit(ctx, w, h, plane, t) {
  const panelH = Math.round(h * 0.205);
  const top = h - panelH;
  const pg = ctx.createLinearGradient(0, top, 0, h);
  pg.addColorStop(0, '#3a3f47');
  pg.addColorStop(0.12, '#26292f');
  pg.addColorStop(1, '#14161a');
  ctx.fillStyle = pg;
  ctx.fillRect(0, top, w, panelH);
  ctx.fillStyle = 'rgba(255,200,110,0.16)';
  ctx.fillRect(0, top, w, 2);
  // glareshield shadow onto the view
  const sh = ctx.createLinearGradient(0, top - 26, 0, top);
  sh.addColorStop(0, 'rgba(10,12,16,0)');
  sh.addColorStop(1, 'rgba(10,12,16,0.35)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, top - 26, w, 26);

  const r = Math.min(52, panelH * 0.40);
  const cy = top + panelH * 0.54;
  const xs = [0.115, 0.265, 0.415, 0.565, 0.715].map((f) => w * f);

  // 1 airspeed (kt), 40..240 sweep
  gaugeFrame(ctx, xs[0], cy, r, 'AIRSPEED');
  ticks(ctx, xs[0], cy, r, 10, Math.PI * 0.75, Math.PI * 2.25);
  needle(ctx, xs[0], cy, r, Math.PI * 0.75 + Math.min(1, speedKnots(plane) / 240) * Math.PI * 1.5);

  // 2 attitude indicator: sky/ground ball that rolls and pitches with the plane
  gaugeFrame(ctx, xs[1], cy, r, 'ATTITUDE');
  ctx.save();
  ctx.beginPath();
  ctx.arc(xs[1], cy, r - 5, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(xs[1], cy);
  ctx.rotate(-plane.roll);
  ctx.translate(0, (plane.att !== undefined ? plane.att : plane.pitch) * r * 0.9);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r, -r * 1.6, r * 2, r * 1.6);
  ctx.fillStyle = '#8a6134';
  ctx.fillRect(-r, 0, r * 2, r * 1.6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-r, -1, r * 2, 2);
  ctx.restore();
  ctx.strokeStyle = '#ffcf5e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(xs[1] - r * 0.5, cy);
  ctx.lineTo(xs[1] - r * 0.14, cy);
  ctx.moveTo(xs[1] + r * 0.14, cy);
  ctx.lineTo(xs[1] + r * 0.5, cy);
  ctx.stroke();
  // turn coordinator ball: it slides out while the turn is uncoordinated —
  // step on the ball (rudder toward it) to centre it, like the real thing
  const ballY = cy + r * 0.62;
  ctx.strokeStyle = 'rgba(230,236,240,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xs[1] - r * 0.34, ballY);
  ctx.lineTo(xs[1] + r * 0.34, ballY);
  ctx.stroke();
  ctx.fillStyle = '#ffcf5e';
  ctx.beginPath();
  ctx.arc(xs[1] + Math.max(-0.3, Math.min(0.3, plane.slip || 0)) * r * 1.1, ballY - 3, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // 3 altimeter (ft), one revolution = 1000 ft
  gaugeFrame(ctx, xs[2], cy, r, 'ALTIMETER');
  ticks(ctx, xs[2], cy, r, 10, -Math.PI / 2, Math.PI * 1.5);
  const alt = altitudeFeet(plane);
  needle(ctx, xs[2], cy, r, -Math.PI / 2 + ((alt % 1000) / 1000) * Math.PI * 2);
  ctx.fillStyle = '#e8ecf0';
  ctx.font = `600 ${Math.round(r * 0.3)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(alt / 100) * 100), xs[2], cy + r * 0.52);

  // 4 heading compass card
  gaugeFrame(ctx, xs[3], cy, r, 'HEADING');
  const hdg = headingDegrees(plane);
  ctx.fillStyle = '#e8ecf0';
  ctx.font = `600 ${Math.round(r * 0.3)}px system-ui, sans-serif`;
  for (const [deg, txt] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const a = ((deg - hdg) * Math.PI / 180) - Math.PI / 2;
    const lx = xs[3] + Math.cos(a) * r * 0.66;
    const ly = cy + Math.sin(a) * r * 0.66;
    if (Math.hypot(lx - xs[3], ly - cy) < r - 6) ctx.fillText(txt, lx, ly + 4);
  }
  ctx.strokeStyle = '#ff5e4d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(xs[3], cy - r + 5);
  ctx.lineTo(xs[3], cy - r + 15);
  ctx.stroke();
  ctx.fillStyle = '#ffd98f';
  ctx.font = `700 ${Math.round(r * 0.34)}px ui-monospace, monospace`;
  ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', xs[3], cy + r * 0.55);

  // 5 vertical speed (x100 fpm), -2000..+2000
  gaugeFrame(ctx, xs[4], cy, r, 'VERT SPD');
  ticks(ctx, xs[4], cy, r, 8, Math.PI * 0.75, Math.PI * 2.25);
  const vs = Math.max(-1, Math.min(1, (plane.vy * 196.85) / 2000));
  needle(ctx, xs[4], cy, r, Math.PI * 0.75 + (vs * 0.5 + 0.5) * Math.PI * 1.5);

  // right cluster: throttle quadrant, fuel, damage, lamps
  const qx = w * 0.845;
  ctx.fillStyle = '#1b1e23';
  ctx.fillRect(qx - 52, top + 12, 196, panelH - 24);
  ctx.strokeStyle = '#565d66';
  ctx.strokeRect(qx - 52, top + 12, 196, panelH - 24);
  ctx.fillStyle = '#ffd98f';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THROTTLE', qx - 40, top + 30);
  ctx.fillStyle = '#0c0e11';
  ctx.fillRect(qx - 40, top + 40, 120, 10);
  ctx.fillStyle = '#57e389';
  ctx.fillRect(qx - 40, top + 40, 120 * plane.throttle, 10);
  ctx.fillStyle = '#e8ecf0';
  ctx.font = '700 13px ui-monospace, monospace';
  ctx.fillText(Math.round(plane.throttle * 100) + '%', qx + 88, top + 50);

  bar(ctx, qx - 40, top + 62, 'FUEL', plane.fuel / 100, plane.fuel < 25 ? '#ff5e4d' : '#57b6e3');
  bar(ctx, qx - 40, top + 88, 'HULL', 1 - plane.damage / 100, plane.damage > 55 ? '#ff5e4d' : '#ffb63d');

  const lamps = [
    ['GEAR', plane.gearDown, '#57e389'],
    ['FLAPS', plane.flaps > 0, '#57b6e3'],
    ['STALL', plane.stall, '#ff5e4d'],
    ['FUEL', plane.fuel < 25, '#ff5e4d'],
  ];
  lamps.forEach(([txt, on, col], i) => {
    const lx = qx - 40 + i * 44;
    const ly = top + panelH - 26;
    ctx.fillStyle = on ? col : '#2c3037';
    ctx.beginPath();
    ctx.arc(lx + 9, ly, 7, 0, Math.PI * 2);
    ctx.fill();
    if (on && txt === 'STALL' && Math.sin(t * 14) > 0) {
      ctx.strokeStyle = col;
      ctx.stroke();
    }
    ctx.fillStyle = '#c8ccd2';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(txt, lx + 9, ly + 16);
  });
}

function bar(ctx, x, y, label, frac, colour) {
  ctx.fillStyle = '#ffd98f';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y + 4);
  ctx.fillStyle = '#0c0e11';
  ctx.fillRect(x + 44, y - 6, 118, 10);
  ctx.fillStyle = colour;
  ctx.fillRect(x + 44, y - 6, 118 * Math.max(0, Math.min(1, frac)), 10);
}
