// All sound is synthesized WebAudio — no audio files. The engine is a
// detuned saw pair through a lowpass, wind is filtered noise that follows
// airspeed, and every event (splash, release, douse, alarm) is a shaped
// noise or tone burst.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
      return;
    }
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 62;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 31;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter);
    osc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    osc2.start();

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 640;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    wind.start();
  }

  function burst(freqA, freqB, seconds, gain, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freqA, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), now + seconds);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
  }

  function noiseBurst(seconds, gain, freq) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },
    update(throttle, speed01, running) {
      if (!ctx) return;
      const target = running ? 0.05 + throttle * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
      engineOsc.frequency.setTargetAtTime(52 + throttle * 46 + speed01 * 12, ctx.currentTime, 0.1);
      engineFilter.frequency.setTargetAtTime(240 + throttle * 420, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(running ? speed01 * speed01 * 0.11 : 0, ctx.currentTime, 0.15);
    },
    splash() {
      noiseBurst(0.5, 0.16, 900);
    },
    drop() {
      noiseBurst(0.7, 0.1, 420);
    },
    douse() {
      noiseBurst(1.1, 0.2, 2600);
      burst(660, 990, 0.28, 0.06, 'triangle');
    },
    partial() {
      noiseBurst(0.6, 0.12, 2200);
    },
    alarm() {
      burst(880, 880, 0.14, 0.05, 'square');
    },
    waveClear() {
      burst(523, 523, 0.16, 0.07, 'triangle');
      setTimeout(() => burst(659, 659, 0.16, 0.07, 'triangle'), 130);
      setTimeout(() => burst(784, 784, 0.3, 0.07, 'triangle'), 260);
    },
    crash() {
      noiseBurst(1.2, 0.3, 180);
      burst(120, 34, 0.9, 0.22, 'sawtooth');
    },
  };
}
