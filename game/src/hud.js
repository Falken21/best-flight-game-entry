// The instrument panel: pure DOM and two small canvases, styled as one
// dark backlit cluster so it reads as cockpit instruments at thumbnail
// size — amber digits, green arcs, a live artificial horizon and a
// scrolling compass strip.

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function el(id) {
  return document.getElementById(id);
}

export function createHUD() {
  const score = el('hud-score');
  const wave = el('hud-wave');
  const fires = el('hud-fires');
  const scorchFill = el('scorch-fill');
  const scorchText = el('scorch-text');
  const alt = el('hud-alt');
  const spd = el('hud-spd');
  const hdg = el('hud-hdg');
  const tankFill = el('hud-tank-fill');
  const tankText = el('hud-tank-text');
  const wind = el('hud-wind');
  const warn = el('hud-warn');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const popups = el('popups');
  const compass = el('compass-canvas').getContext('2d');
  const horizon = el('horizon-canvas').getContext('2d');
  let bannerTimer = 0;

  function drawCompass(headingDeg) {
    const w = 264;
    const h = 34;
    compass.clearRect(0, 0, w, h);
    compass.fillStyle = 'rgba(10,14,16,0.72)';
    compass.fillRect(0, 0, w, h);
    const pxPerDeg = 2.4;
    compass.font = 'bold 13px ui-monospace, monospace';
    compass.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      let deg = Math.round((headingDeg + d) / 5) * 5;
      const shown = ((deg % 360) + 360) % 360;
      const x = w / 2 + (deg - headingDeg) * pxPerDeg;
      if (x < -10 || x > w + 10) continue;
      if (shown % 45 === 0) {
        compass.fillStyle = '#ffc45e';
        compass.fillText(COMPASS_POINTS[Math.round(shown / 45) % 8], x, 16);
        compass.fillRect(x - 1, 22, 2, 8);
      } else if (shown % 15 === 0) {
        compass.fillStyle = 'rgba(255,255,255,0.55)';
        compass.fillText(String(shown / 10).padStart(2, '0'), x, 16);
        compass.fillRect(x - 0.5, 24, 1, 6);
      }
    }
    compass.fillStyle = '#ff5a1f';
    compass.beginPath();
    compass.moveTo(w / 2 - 6, 0);
    compass.lineTo(w / 2 + 6, 0);
    compass.lineTo(w / 2, 9);
    compass.closePath();
    compass.fill();
  }

  function drawHorizon(pitchRad, rollRad) {
    const s = 118;
    const c = s / 2;
    horizon.clearRect(0, 0, s, s);
    horizon.save();
    horizon.beginPath();
    horizon.arc(c, c, c - 2, 0, Math.PI * 2);
    horizon.clip();
    horizon.translate(c, c);
    horizon.rotate(-rollRad);
    const pitchPx = pitchRad * 90;
    horizon.fillStyle = '#7ec8e3';
    horizon.fillRect(-c, -c + pitchPx, s, c - pitchPx + c);
    horizon.fillStyle = '#8a6a42';
    horizon.fillRect(-c, pitchPx, s, c - pitchPx + c);
    horizon.strokeStyle = 'rgba(255,255,255,0.9)';
    horizon.lineWidth = 2;
    horizon.beginPath();
    horizon.moveTo(-c, pitchPx);
    horizon.lineTo(c, pitchPx);
    horizon.stroke();
    horizon.strokeStyle = 'rgba(255,255,255,0.5)';
    horizon.lineWidth = 1;
    for (const off of [-24, 24]) {
      horizon.beginPath();
      horizon.moveTo(-14, pitchPx + off);
      horizon.lineTo(14, pitchPx + off);
      horizon.stroke();
    }
    horizon.restore();
    horizon.strokeStyle = '#ffc45e';
    horizon.lineWidth = 3;
    horizon.beginPath();
    horizon.moveTo(c - 26, c);
    horizon.lineTo(c - 8, c);
    horizon.lineTo(c, c + 6);
    horizon.lineTo(c + 8, c);
    horizon.lineTo(c + 26, c);
    horizon.stroke();
    horizon.fillStyle = '#ffc45e';
    horizon.fillRect(c - 1.5, c - 1.5, 3, 3);
  }

  function showBanner(title, sub, seconds = 2.6) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub || '';
    banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('show'), seconds * 1000);
  }

  function popup(text, color = '#ffd76a') {
    const div = document.createElement('div');
    div.className = 'popup';
    div.textContent = text;
    div.style.color = color;
    div.style.left = `${46 + Math.random() * 8}%`;
    div.style.top = '34%';
    popups.appendChild(div);
    setTimeout(() => div.remove(), 1500);
  }

  function update(view) {
    score.textContent = String(view.score).padStart(6, '0');
    wave.textContent = `WAVE ${view.wave}`;
    fires.textContent = `${view.fires} FIRE${view.fires === 1 ? '' : 'S'}`;
    scorchFill.style.width = `${Math.min(100, view.scorch)}%`;
    scorchFill.style.background = view.scorch > 70 ? '#ff4b26' : view.scorch > 40 ? '#ff8a2a' : '#ffc45e';
    scorchText.textContent = `SCORCH ${Math.floor(view.scorch)}%`;
    alt.textContent = `${Math.max(0, Math.round(view.altFt))}`;
    spd.textContent = `${Math.round(view.spdKt)}`;
    hdg.textContent = `${String(Math.round(view.hdgDeg) % 360).padStart(3, '0')}°`;
    tankFill.style.height = `${view.tank01 * 100}%`;
    tankFill.style.background = view.tank01 > 0.25 ? '#57c7e3' : '#ff8a2a';
    tankText.textContent = `${Math.round(view.tank01 * 100)}%`;
    wind.textContent = `WIND ${Math.round(view.windKt)} KT`;
    drawCompass(view.hdgDeg);
    drawHorizon(view.pitch, view.roll);
    if (view.stalled) {
      warn.textContent = 'STALL — NOSE DOWN';
      warn.style.display = 'block';
    } else if (view.pullUp) {
      warn.textContent = 'PULL UP';
      warn.style.display = 'block';
    } else if (view.lowTank) {
      warn.textContent = 'TANK EMPTY — SCOOP THE LAKE';
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
  }

  return { update, showBanner, popup };
}
