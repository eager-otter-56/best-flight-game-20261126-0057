// aircraft.js — draws the player's aeroplane in chase view: a high-wing
// tourer with a spinning propeller, deflecting control surfaces, navigation
// lights and a shadow that tracks the ground below.

export function drawAircraft(ctx, w, h, plane, input, t, groundBelow) {
  const cx = w / 2;
  const cy = h * 0.60;
  const bank = plane.roll;
  // the drawn nose follows ATTITUDE, not the flight path: pull back and the
  // nose rises first, the climb follows — the gap between them is the AoA
  const att = plane.att !== undefined ? plane.att : plane.pitch;
  const aoa = att - plane.pitch;
  const pitchLift = -att * 34;
  const buffet = plane.stall ? Math.sin(t * 47) * 2.2 : 0;
  const airBump = (plane.verticalAir || 0) * Math.sin(t * 9.3) * 0.9;
  const scale = 1;

  ctx.save();
  ctx.translate(cx + buffet, cy + pitchLift + buffet * 0.6 + airBump);
  ctx.rotate(bank * 0.55 - aoa * 0.45);
  ctx.scale(scale, scale);

  // slipstream streaks that stretch with speed, so the air itself shows motion
  if (plane.speed > 46) {
    const stretch = Math.min(1, (plane.speed - 46) / 55);
    ctx.strokeStyle = `rgba(255,255,255,${0.10 + stretch * 0.22})`;
    ctx.lineWidth = 2;
    const rows = [[-190, -30], [185, -24], [-160, 44], [168, 50], [-215, 8], [212, 14], [-140, -64], [150, -58]];
    rows.forEach(([sx, sy], i) => {
      const len = (34 + (i % 3) * 14) * (0.5 + stretch);
      const wob = Math.sin(t * 31 + i * 1.7) * 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy + wob);
      ctx.lineTo(sx + (sx < 0 ? -len : len), sy + wob);
      ctx.stroke();
    });
  }

  // main wing (seen from behind-above), ailerons deflect with roll input
  const ail = input.roll * 7;
  ctx.fillStyle = '#d8542e';
  ctx.beginPath();
  ctx.moveTo(-196, -34);
  ctx.lineTo(-30, -52);
  ctx.lineTo(30, -52);
  ctx.lineTo(196, -34);
  ctx.lineTo(196, -22);
  ctx.lineTo(30, -38);
  ctx.lineTo(-30, -38);
  ctx.lineTo(-196, -22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b23f1e';
  ctx.fillRect(-196, -30 + ail, 74, 7);
  ctx.fillRect(122, -30 - ail, 74, 7);
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(-199, -36, 12, 16);
  ctx.fillRect(187, -36, 12, 16);

  // fuselage, tapering to the tail
  const body = ctx.createLinearGradient(0, -60, 0, 46);
  body.addColorStop(0, '#fdfcf7');
  body.addColorStop(0.55, '#e9e4d8');
  body.addColorStop(1, '#b9b2a2');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-17, -58);
  ctx.quadraticCurveTo(-24, 6, -13, 44);
  ctx.quadraticCurveTo(0, 52, 13, 44);
  ctx.quadraticCurveTo(24, 6, 17, -58);
  ctx.quadraticCurveTo(0, -68, -17, -58);
  ctx.fill();
  // cheatline stripe
  ctx.fillStyle = '#d8542e';
  ctx.fillRect(-19, 2, 38, 7);

  // cabin glass with a sky reflection and two headrest silhouettes
  const glass = ctx.createLinearGradient(0, -56, 0, -8);
  glass.addColorStop(0, '#9fd4ee');
  glass.addColorStop(1, '#2c5a78');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(-14, -54);
  ctx.quadraticCurveTo(0, -62, 14, -54);
  ctx.lineTo(11, -14);
  ctx.quadraticCurveTo(0, -9, -11, -14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(30,40,50,0.65)';
  ctx.beginPath();
  ctx.arc(-5.5, -20, 3.4, 0, Math.PI * 2);
  ctx.arc(5.5, -20, 3.4, 0, Math.PI * 2);
  ctx.fill();

  // tail feathers; the rudder swings with the turn, elevator with pitch input
  ctx.fillStyle = '#d8542e';
  ctx.beginPath();
  ctx.moveTo(-52, 34);
  ctx.lineTo(0, 26);
  ctx.lineTo(52, 34);
  ctx.lineTo(52, 42);
  ctx.lineTo(0, 36);
  ctx.lineTo(-52, 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b23f1e';
  const elev = input.pitch * 5;
  ctx.fillRect(-52, 38 + elev, 30, 5);
  ctx.fillRect(22, 38 - elev, 30, 5);
  ctx.fillStyle = '#e8e2d2';
  const rudder = (plane.slip || 0) * 6 + input.roll * 2;
  ctx.beginPath();
  ctx.moveTo(-3, 6);
  ctx.lineTo(3, 6);
  ctx.lineTo(3 + rudder, 34);
  ctx.lineTo(-3 + rudder, 34);
  ctx.closePath();
  ctx.fill();

  // propeller arc ahead of the nose (top of frame) with a spinner
  const propAlpha = 0.10 + Math.min(0.2, plane.throttle * 0.2);
  ctx.fillStyle = `rgba(40,40,44,${propAlpha})`;
  ctx.beginPath();
  ctx.ellipse(0, -66, 30, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#33383e';
  ctx.beginPath();
  ctx.arc(0, -64, 4.6, 0, Math.PI * 2);
  ctx.fill();

  // landing gear: struts and wheels when down, tucked hint when up
  if (plane.gearDown) {
    ctx.strokeStyle = '#4a4d52';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, 40);
    ctx.lineTo(-24, 62);
    ctx.moveTo(12, 40);
    ctx.lineTo(24, 62);
    ctx.stroke();
    ctx.fillStyle = '#22252a';
    ctx.beginPath();
    ctx.arc(-25, 66, 7.5, 0, Math.PI * 2);
    ctx.arc(25, 66, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f959c';
    ctx.beginPath();
    ctx.arc(-25, 66, 3, 0, Math.PI * 2);
    ctx.arc(25, 66, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // navigation lights: red port, green starboard, white tail strobe
  const strobe = (t % 1.1) < 0.08;
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-199, -28, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2eff7a';
  ctx.beginPath();
  ctx.arc(199, -28, 4, 0, Math.PI * 2);
  ctx.fill();
  if (strobe) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(0, 44, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // ground shadow: an ellipse that grows and sharpens as the ground nears
  const heightAbove = plane.y - groundBelow;
  if (heightAbove < 260) {
    const a = Math.max(0.05, 0.34 - heightAbove * 0.0011);
    const sw = Math.max(18, 120 - heightAbove * 0.32);
    ctx.fillStyle = `rgba(20,30,20,${a})`;
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.60 + 92 + heightAbove * 0.14, sw, sw * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPropWash(ctx, w, h, plane) {
  // faint spiral wash behind the aircraft at full throttle on the ground
  if (!plane.onGround || plane.throttle < 0.7) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.60 + 16 + i * 14, 20 + i * 16, 0.3, Math.PI * 1.5);
    ctx.stroke();
  }
}
