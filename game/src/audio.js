// audio.js — procedural WebAudio sound: a two-oscillator engine whose pitch
// follows the throttle, wind that rises with speed, a chime for each gate and
// a low thud for touchdown. No audio files, no network.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let started = false;

  function start() {
    if (started) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    started = true;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineOsc.connect(filter);
    sub.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    sub.start();
    engineOsc._sub = sub;

    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 800;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    wind.start();
  }

  function update(plane) {
    if (!started || !ctx) return;
    const rpm = 55 + plane.throttle * 95;
    engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.08);
    if (engineOsc._sub) engineOsc._sub.frequency.setTargetAtTime(rpm / 2, ctx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.015 + plane.throttle * 0.05, ctx.currentTime, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.06, plane.speed * 0.0006), ctx.currentTime, 0.15);
  }

  function blip(freq, dur = 0.16, type = 'sine', vol = 0.12) {
    if (!started || !ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  return {
    start,
    update,
    gate: () => { blip(880, 0.14); setTimeout(() => blip(1318, 0.2), 90); },
    touchdown: () => blip(90, 0.25, 'triangle', 0.2),
    crash: () => blip(55, 0.6, 'sawtooth', 0.22),
    get started() { return started; },
  };
}
