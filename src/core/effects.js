// Screen effects that follow the money (core): rain and thunder in a panic, a screen shake on a loss,
// confetti on a donation. Pure DOM + CSS (style.css), so they cost nothing on the GPU side.

const RAIN_DROPS = 70;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const CONFETTI_COLORS = ['#ff7eb6', '#ffd23f', '#7ee0ff', '#b28dff', '#ff9f5a', '#2fd27a', '#fff'];

export function createEffects({ reducedMotion }) {
  const layer = document.createElement('div');
  layer.className = 'effects';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="rain"></div><div class="storm"></div><div class="flash"></div><div class="confetti"></div>';
  document.body.append(layer);
  const rain = layer.querySelector('.rain');
  for (let i = 0; i < RAIN_DROPS; i++) {
    const d = document.createElement('i');
    d.style.cssText = `left:${Math.random() * 100}%;--dur:${(0.55 + Math.random() * 0.5).toFixed(2)}s;--delay:${(-Math.random() * 2).toFixed(2)}s;--len:${(30 + Math.random() * 50).toFixed(0)}px`;
    rain.append(d);
  }
  const flash = layer.querySelector('.flash');
  const confetti = layer.querySelector('.confetti');
  const shakeTargets = () => [document.getElementById('scene'), document.querySelector('.hud')].filter(Boolean);

  let lastRain = -1, thunderIn = 3;

  function thunder() {
    if (reducedMotion) return;
    flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
  }
  function shake(strength) {
    if (reducedMotion) return;
    for (const el of shakeTargets()) {
      el.style.setProperty('--shake', `${(4 + 10 * strength).toFixed(0)}px`);
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    }
  }
  function burst(strength) {
    if (reducedMotion) return;
    const count = Math.round(50 + 130 * Math.min(1, strength));
    for (let i = 0; i < count; i++) {
      const c = document.createElement('i');
      c.style.cssText = `left:${Math.random() * 100}%;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};`
        + `--dur:${(2.2 + Math.random() * 1.8).toFixed(2)}s;--delay:${(Math.random() * 0.8).toFixed(2)}s;`
        + `--drift:${((Math.random() - 0.5) * 160).toFixed(0)}px;--spin:${(Math.random() * 720 - 360).toFixed(0)}deg;`
        + `width:${(6 + Math.random() * 6).toFixed(0)}px;height:${(8 + Math.random() * 8).toFixed(0)}px`;
      confetti.append(c);
      c.addEventListener('animationend', () => c.remove());
    }
  }

  return {
    /** Every frame, with the smoothed stress. */
    update(dt, stress) {
      const amount = smooth(0.76, 0.95, stress);
      if (Math.abs(amount - lastRain) > 0.01) {
        lastRain = amount;
        layer.style.setProperty('--rain', amount.toFixed(2));
        layer.classList.toggle('raining', amount > 0.02 && !reducedMotion);
      }
      if (amount > 0.5) {
        thunderIn -= dt;
        if (thunderIn <= 0) { thunder(); thunderIn = 4 + Math.random() * 7; }
      }
    },
    /** Money moved: impulse in -1..1. */
    impulse(i) {
      if (i < 0) { thunder(); shake(-i); }
      if (i > 0) burst(i);
    },
  };
}
