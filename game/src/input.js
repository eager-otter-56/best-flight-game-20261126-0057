// input.js — keyboard and mouse flight controls.
// Arrows / WASD fly, Shift/Ctrl or W/S work the throttle, the mouse drags the stick.

export function createInput(canvas) {
  const input = {
    pitch: 0, roll: 0, throttleUp: false, throttleDown: false,
    toggleGear: false, toggleFlaps: false, restart: false, pause: false,
    startRequested: false, missionPick: 0,
  };
  const keys = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyG') input.toggleGear = true;
    if (e.code === 'KeyF') input.toggleFlaps = true;
    if (e.code === 'KeyR') input.restart = true;
    if (e.code === 'KeyP' || e.code === 'Escape') input.pause = true;
    if (e.code === 'Enter' || e.code === 'Space') input.startRequested = true;
    if (e.code === 'Digit1') input.missionPick = 1;
    if (e.code === 'Digit2') input.missionPick = 2;
    if (e.code === 'Digit3') input.missionPick = 3;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    input.startRequested = true;
    canvas.dataset.mx = String(e.clientX);
    canvas.dataset.my = String(e.clientY);
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });

  // Fold the raw key/mouse state into stick deflections once per frame.
  input.poll = () => {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowDown')) pitch += 1;
    if (keys.has('ArrowUp')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (Math.abs(mouseDX) > 1 || Math.abs(mouseDY) > 1) {
      roll += mouseDX * 0.012;
      pitch += mouseDY * 0.010;
      mouseDX *= 0.55;
      mouseDY *= 0.55;
    }
    input.pitch = Math.max(-1, Math.min(1, pitch));
    input.roll = Math.max(-1, Math.min(1, roll));
    input.throttleUp = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal');
    input.throttleDown = keys.has('ControlLeft') || keys.has('Minus');
    return input;
  };

  input.consume = () => {
    input.toggleGear = false;
    input.toggleFlaps = false;
    input.restart = false;
    input.pause = false;
    input.startRequested = false;
    input.missionPick = 0;
  };

  return input;
}
