// A small, cheerful tune for the recap, generated with the Web Audio API: soft chord pads over a
// I–V–vi–IV progression and a bell-like arpeggio on top. Nothing to download, nothing to license.
// Browsers only let sound start after a user gesture, so start() is called from the Recap button.

const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const PROGRESSION = [[60, 64, 67], [55, 59, 62, 67], [57, 60, 64], [53, 57, 60, 65]]; // C, G, Am, F
const BPM = 104;

export function createMusic({ storageKey = "recapMusic" } = {}) {
  let ctx = null, master = null, timer = null, bar = 0, nextBarAt = 0;
  let muted = false;
  try { muted = localStorage.getItem(storageKey) === "off"; } catch { /* fine */ }
  const listeners = new Set();

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }

  function pad(freq, at, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = "triangle"; o.frequency.value = freq;
    f.type = "lowpass"; f.frequency.value = 900;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.06, at + 0.4); g.gain.setTargetAtTime(0, at + dur - 0.6, 0.25);
    o.connect(f).connect(g).connect(master); o.start(at); o.stop(at + dur + 0.5);
  }
  function bell(freq, at) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.11, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    o.connect(g).connect(master); o.start(at); o.stop(at + 1);
  }
  function scheduleBar(at) {
    const beat = 60 / BPM, chord = PROGRESSION[bar % PROGRESSION.length];
    for (const m of chord) pad(NOTE(m), at, beat * 4);
    // Arpeggio: eighth notes climbing the chord, an octave up, with a little rest to breathe.
    const arp = [...chord, ...chord.slice(0, 2)].map((m) => m + 12);
    for (let i = 0; i < 8; i++) if (i !== 6) bell(NOTE(arp[i % arp.length]), at + i * beat / 2);
    bar++;
  }
  function tick() {
    const beat = 60 / BPM;
    while (nextBarAt < ctx.currentTime + 0.6) { scheduleBar(nextBarAt); nextBarAt += beat * 4; }
  }

  const api = {
    get muted() { return muted; },
    start() {
      ensure();
      if (ctx.state === "suspended") ctx.resume();
      if (!timer) { bar = 0; nextBarAt = ctx.currentTime + 0.1; timer = setInterval(tick, 200); tick(); }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.8);
    },
    stop() {
      if (!ctx || !timer) return;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      clearInterval(timer); timer = null;
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(storageKey, muted ? "off" : "on"); } catch { /* fine */ }
      if (ctx && timer) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.3);
      for (const l of listeners) l(muted);
      return muted;
    },
    onChange(l) { listeners.add(l); },
  };
  return api;
}
