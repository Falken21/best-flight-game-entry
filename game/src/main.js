// Isla Brava: Water Bomber — game glue. Owns the state machine
// (title → playing → paused → over), the wave director, scoop and drop
// resolution, scoring, the chase camera and the projected impact marker.

import * as THREE from 'three';
import { WORLD, FLIGHT, FIRE, SCORE, PALETTE, waveSpec } from './config.js';
import { mulberry32, clamp, lerpAngle } from './random.js';
import { createWorld, heightAt, isOverLake } from './world.js';
import { buildPlaneMesh, createFlightState, stepFlight, updatePlaneVisual, forwardVector } from './plane.js';
import { createFireSystem } from './fires.js';
import { createBursts } from './particles.js';
import { createHUD } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { shotNumber, botEnabled, liteEnabled, stageShot, createBot } from './shots.js';

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(liteEnabled() ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !liteEnabled();
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 6000);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hud = createHUD();
const input = createInput();
const audio = createAudio();
const gameplayRng = mulberry32(WORLD.seed ^ 0xd15e);

let S = null; // the whole mutable game state, rebuilt on restart

function buildGame() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 500, 2900);

  // Gradient sky dome: warm horizon melting into the golden-hour zenith.
  const skyGeo = new THREE.SphereGeometry(3200, 24, 12);
  const skyPos = skyGeo.attributes.position;
  const skyColors = new Float32Array(skyPos.count * 3);
  const zen = new THREE.Color(PALETTE.sky);
  const hor = new THREE.Color(PALETTE.skyHorizon);
  const mix = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const t = clamp(skyPos.getY(i) / 3200, 0, 1);
    mix.copy(hor).lerp(zen, Math.pow(t, 0.55));
    skyColors[i * 3] = mix.r;
    skyColors[i * 3 + 1] = mix.g;
    skyColors[i * 3 + 2] = mix.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

  const hemi = new THREE.HemisphereLight(0xffe0b0, 0x46684e, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -420;
  sun.shadow.camera.right = 420;
  sun.shadow.camera.top = 420;
  sun.shadow.camera.bottom = -420;
  sun.shadow.camera.far = 1600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const world = createWorld(scene);
  const planeParts = buildPlaneMesh();
  scene.add(planeParts.group);
  const bursts = createBursts(scene);
  const fires = createFireSystem(scene, world.fireSpots, heightAt, bursts);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(7.5, 10.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xbffbff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  const state = createFlightState(new THREE.Vector3(80, 95, 780), -0.1);
  return {
    scene, sun, world, planeParts, bursts, fires, marker, state,
    mode: 'title',
    score: 0,
    wave: 0,
    scorch: 0,
    doused: 0,
    elapsed: 0,
    waveTimer: 0,
    windX: 1,
    windZ: 0,
    windSpeed: 0,
    spreadScale: 1,
    alarmTimer: 0,
    splashTimer: 0,
    scoopWasEmpty: true,
    orbitAngle: 0,
    endReason: '',
    camPos: new THREE.Vector3(80, 120, 900),
    camHeading: 0,
    title: document.getElementById('title-screen'),
    end: document.getElementById('end-screen'),
    veil: document.getElementById('pause-veil'),
  };
}

function startWave(n) {
  S.wave = n;
  const spec = waveSpec(n);
  S.spreadScale = spec.spreadScale;
  S.windSpeed = spec.wind;
  const ang = 2.1 + n * 0.37;
  S.windX = Math.sin(ang);
  S.windZ = Math.cos(ang);
  S.fires.igniteNearest(spec.fires, S.windX, S.windZ, spec.spreadScale);
  hud.showBanner(`WAVE ${n}`, n === 1 ? 'Fire in the pines — scoop the lake, drop on the smoke' : `${spec.fires} new fires — wind ${spec.wind} kt`, 3);
}

function priorityTarget() {
  let threatened = null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const node of S.fires.nodes) {
    if (node.state !== 'burning') continue;
    const d = Math.hypot(node.x - S.state.pos.x, node.z - S.state.pos.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = node;
    }
    for (const b of S.world.buildings) {
      if (!b.burned && Math.hypot(node.x - b.x, node.z - b.z) < b.radius + 46) threatened = node;
    }
  }
  return threatened || nearest;
}

function endGame(reason) {
  if (S.mode === 'over') return;
  S.mode = 'over';
  S.endReason = reason;
  audio.crash();
  document.getElementById('end-title').textContent = reason;
  document.getElementById('end-stats').textContent =
    `Score ${S.score} · Waves survived ${S.wave} · Fires doused ${S.doused} · Island scorch ${Math.floor(S.scorch)}%`;
  S.end.classList.add('show');
}

function startRun() {
  S.title.classList.remove('show');
  S.end.classList.remove('show');
  S.state.pos.set(80, 95, 780);
  S.state.heading = -0.1;
  S.state.pitch = 0;
  S.state.roll = 0;
  S.state.speed = 46;
  S.state.throttle = 0.55;
  S.state.tank = 0;
  S.scoopWasEmpty = true;
  S.mode = 'playing';
  startWave(1);
}

function restart() {
  const shot = shotNumber();
  S = buildGame();
  if (shot) return;
  S.title.classList.add('show');
  S.mode = 'title';
}

const _fwd = new THREE.Vector3();
const _dropPos = new THREE.Vector3();

function predictDropPoint() {
  const st = S.state;
  let px = st.pos.x;
  let py = st.pos.y - 3;
  let pz = st.pos.z;
  let vx = st.vel.x;
  let vy = st.vel.y;
  let vz = st.vel.z;
  const step = 0.06;
  for (let t = 0; t < 3.2; t += step) {
    vy -= 42 * step;
    px += vx * step;
    py += vy * step;
    pz += vz * step;
    const g = Math.max(heightAt(px, pz), isOverLake(px, pz) ? WORLD.lake.surfaceY : WORLD.seaLevel);
    if (py <= g + 1) {
      _dropPos.set(px, g + 1.4, pz);
      return _dropPos;
    }
  }
  return null;
}

function tryDrop() {
  if (S.mode !== 'playing') return;
  const st = S.state;
  if (st.tank < 20) {
    hud.popup('TANK TOO LOW', '#ff9a5e');
    return;
  }
  const used = Math.min(st.tank, 65);
  st.tank -= used;
  forwardVector(st, _fwd);
  S.fires.releaseWater(st.pos.x, st.pos.y - 3, st.pos.z, st.vel.clone());
  audio.drop();
}

function updatePlaying(dt) {
  const st = S.state;
  const bot = botEnabled() ? updatePlaying.bot || (updatePlaying.bot = createBot()) : null;
  let axis;
  if (bot) {
    const b = bot.input(st, S.fires, S.world);
    axis = b;
    if (b.drop) tryDrop();
  } else {
    axis = input.axis();
  }
  const heavy = st.tank / FLIGHT.tankCapacity;
  stepFlight(st, axis, dt, heavy);
  updatePlaneVisual(S.planeParts, st, dt, S.elapsed);

  const groundY = heightAt(st.pos.x, st.pos.z);
  const overLake = isOverLake(st.pos.x, st.pos.z);
  const waterY = overLake ? WORLD.lake.surfaceY : WORLD.seaLevel;
  st.scooping = false;

  if (st.pos.y < waterY + FLIGHT.scoopMaxAltitude && st.pos.y > waterY - 0.5) {
    const inScoopBand = st.speed >= FLIGHT.scoopMinSpeed && st.speed <= FLIGHT.scoopMaxSpeed;
    const gentle = st.vel.y > -6;
    if (inScoopBand && gentle) {
      st.scooping = true;
      if (st.pos.y < waterY + 2.6) st.pos.y = waterY + 2.6;
      const before = st.tank;
      st.tank = Math.min(FLIGHT.tankCapacity, st.tank + FLIGHT.scoopRate * dt);
      if (S.scoopWasEmpty && st.tank >= FLIGHT.tankCapacity - 1) {
        S.score += SCORE.scoopBonus;
        S.scoopWasEmpty = false;
      }
      if (before < st.tank) {
        S.splashTimer -= dt;
        if (S.splashTimer <= 0) {
          S.splashTimer = 0.14;
          audio.splash();
          S.bursts.spawn({
            pos: new THREE.Vector3(st.pos.x - Math.sin(st.heading) * 4, waterY + 1, st.pos.z + Math.cos(st.heading) * 4),
            count: 10, color: 0xeafcff, up: 6, spread: 4, size: 5, life: 0.7, opacity: 0.9,
          });
        }
      }
    } else if (st.pos.y < waterY + 1.4) {
      endGame('DITCHED IN THE WATER');
      return;
    }
  }
  if (st.tank < FLIGHT.tankCapacity * 0.2) S.scoopWasEmpty = true;

  if (st.pos.y < waterY - 1) {
    endGame('DITCHED IN THE WATER');
    return;
  }
  if (!st.scooping && st.pos.y < groundY + 2.4 && st.pos.y > waterY + FLIGHT.scoopMaxAltitude) {
    S.bursts.spawn({ pos: st.pos.clone(), count: 40, color: 0xff7b24, up: 9, spread: 7, size: 9, life: 1.2, additive: true });
    S.bursts.spawn({ pos: st.pos.clone(), count: 24, color: 0x3a3733, up: 12, spread: 5, size: 11, life: 1.8 });
    endGame('TERRAIN STRIKE');
    return;
  }
  if (st.pos.y > 700) st.pos.y = 700;

  const events = S.fires.update(dt, S.elapsed, S.windX, S.windZ, S.windSpeed);
  for (const drop of events.drops) {
    if (drop.kind === 'full') {
      S.score += SCORE.douse;
      S.doused++;
      hud.popup(`+${SCORE.douse} DOUSED`, '#ffd76a');
      audio.douse();
    } else if (drop.kind === 'partial') {
      S.score += SCORE.partialDouse;
      hud.popup(`+${SCORE.partialDouse} KNOCKED DOWN`, '#ffe9b0');
      audio.partial();
    } else {
      hud.popup('MISSED', '#ff9a5e');
    }
  }
  if (events.spread.length > 0) {
    hud.showBanner('THE FIRE IS SPREADING', 'Catch it before it reaches a building', 2);
  }

  const burning = S.fires.burningCount();
  S.scorch += S.fires.burningIntensity() * FIRE.scorchPerSecond * dt;
  if (burning === 0) S.scorch = Math.max(0, S.scorch - 0.4 * dt);
  for (const b of S.world.buildings) {
    if (b.burned) continue;
    const threatened = S.fires.nodes.some(
      (node) => node.state === 'burning' && Math.hypot(node.x - b.x, node.z - b.z) < b.radius + 46
    );
    if (threatened) {
      b.health -= dt * (100 / FIRE.buildingBurnSeconds);
      if (b.health <= 0) {
        b.burnDown();
        S.scorch += FIRE.buildingScorchPenalty;
        S.score += SCORE.buildingLost;
        hud.showBanner(`${b.name.toUpperCase()} BURNED DOWN`, `+${FIRE.buildingScorchPenalty}% scorch`, 3);
        audio.crash();
      }
    } else {
      b.health = Math.min(100, b.health + dt * 2);
    }
  }
  if (S.scorch >= 100) {
    S.scorch = 100;
    endGame('ISLA BRAVA BURNED');
    return;
  }

  if (burning === 0 && S.mode === 'playing') {
    S.waveTimer += dt;
    if (S.waveTimer > 2.4) {
      S.waveTimer = 0;
      S.score += SCORE.waveClear;
      audio.waveClear();
      startWave(S.wave + 1);
    }
  } else {
    S.waveTimer = 0;
  }

  const target = priorityTarget();
  S.fires.setTarget(target, S.elapsed);

  const markerPos = st.tank >= 20 ? predictDropPoint() : null;
  S.marker.visible = !!markerPos;
  if (markerPos) S.marker.position.copy(markerPos);

  if (st.stalled) {
    S.alarmTimer -= dt;
    if (S.alarmTimer <= 0) {
      S.alarmTimer = 0.75;
      audio.alarm();
    }
  }
  audio.update(st.throttle, clamp(st.speed / FLIGHT.maxSpeed, 0, 1), true);
}

function updateCamera(dt) {
  const st = S.state;
  if (S.fixedCam) {
    camera.position.copy(S.fixedCam.pos);
    camera.lookAt(S.fixedCam.look);
    return;
  }
  if (S.mode === 'title') {
    S.orbitAngle += dt * 0.045;
    const r = 560;
    camera.position.set(Math.sin(S.orbitAngle) * r, 150, Math.cos(S.orbitAngle) * r);
    camera.lookAt(-120, 55, -160);
    return;
  }
  forwardVector(st, _fwd);
  const back = 17 + st.speed * 0.04;
  const desired = new THREE.Vector3(
    st.pos.x - Math.sin(st.heading) * back,
    st.pos.y + 6.5,
    st.pos.z + Math.cos(st.heading) * back
  );
  const k = 1 - Math.exp(-dt * 4.2);
  S.camPos.lerp(desired, k);
  const groundY = heightAt(S.camPos.x, S.camPos.z);
  if (S.camPos.y < groundY + 4) S.camPos.y = groundY + 4;
  camera.position.copy(S.camPos);
  const look = new THREE.Vector3(st.pos.x + _fwd.x * 26, st.pos.y + 2 + _fwd.y * 20, st.pos.z + _fwd.z * 26);
  camera.lookAt(look);
  const targetFov = 62 + clamp((st.speed - 40) / 48, 0, 1) * 7;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
  S.sun.position.set(st.pos.x - 500, st.pos.y + 330, st.pos.z - 180);
  S.sun.target.position.copy(st.pos);
}

function hudView() {
  const st = S.state;
  const groundY = Math.max(heightAt(st.pos.x, st.pos.z), 0);
  return {
    score: S.score,
    wave: Math.max(1, S.wave),
    fires: S.fires.burningCount(),
    scorch: S.scorch,
    altFt: st.pos.y * 3.281,
    spdKt: st.speed * 1.944,
    hdgDeg: ((st.heading * 180) / Math.PI % 360 + 360) % 360,
    tank01: st.tank / FLIGHT.tankCapacity,
    windKt: S.windSpeed,
    pitch: st.pitch,
    roll: st.roll,
    stalled: st.stalled && S.mode === 'playing',
    pullUp: S.mode === 'playing' && st.pos.y - groundY < 26 && st.vel.y < -2,
    lowTank: S.mode === 'playing' && st.tank < 12 && S.fires.burningCount() > 0,
  };
}

// ---- boot ----

S = buildGame();
const shot = shotNumber();
if (shot) {
  const staged = [
    null,
    { score: 1250, wave: 2, scorch: 18 },
    { score: 250, wave: 1, scorch: 6 },
    { score: 0, wave: 1, scorch: 0 },
    { score: 2750, wave: 3, scorch: 27 },
  ][shot];
  S.score = staged.score;
  S.wave = staged.wave;
  S.scorch = staged.scorch;
  S.windSpeed = waveSpec(Math.max(1, staged.wave)).wind;
  const spec = stageShot(shot, S);
  if (spec.mode === 'fixed') S.fixedCam = spec;
  if (shot === 3) S.title.classList.add('show');
  S.mode = 'shot';
  let frames = 0;
  const shotLoop = () => {
    S.elapsed += 1 / 30;
    S.fires.update(1 / 30, 4 + frames / 30, 0.8, 0.4, 4);
    S.bursts.update(1 / 30);
    updatePlaneVisual(S.planeParts, S.state, 1 / 30, S.elapsed);
    const target = priorityTarget();
    S.fires.setTarget(target, 4 + frames / 30);
    updateCamera(1 / 30);
    hud.update(hudView());
    renderer.render(S.scene, camera);
    frames++;
    window.__shotFrames = frames;
    if (frames > 16) {
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(shotLoop);
  };
  shotLoop();
} else {
  S.title.classList.add('show');
  if (botEnabled()) {
    S.title.classList.remove('show');
    startRun();
  }
  window.__game = {
    snapshot() {
      return {
        mode: S.mode,
        score: S.score,
        wave: S.wave,
        scorch: Math.floor(S.scorch),
        tank: Math.round(S.state.tank),
        fires: S.fires.burningCount(),
        doused: S.doused,
        pos: { x: Math.round(S.state.pos.x), y: Math.round(S.state.pos.y), z: Math.round(S.state.pos.z) },
        endReason: S.endReason,
      };
    },
  };
  input.on('confirm', () => {
    audio.unlock();
    if (S.mode === 'title') startRun();
    else if (S.mode === 'over') restart();
  });
  input.on('restart', () => {
    if (S.mode === 'over') restart();
  });
  input.on('pause', () => {
    if (S.mode === 'playing') {
      S.mode = 'paused';
      S.veil.classList.add('show');
    } else if (S.mode === 'paused') {
      S.mode = 'playing';
      S.veil.classList.remove('show');
    }
  });
  input.on('drop', () => {
    audio.unlock();
    tryDrop();
  });

  const clock = new THREE.Clock();
  const loop = () => {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    S.elapsed += dt;
    if (S.mode === 'playing') {
      updatePlaying(dt);
    } else if (S.mode === 'title') {
      // Slow scenic orbit of the plane around the island.
      const st = S.state;
      const w = S.elapsed * 0.045;
      st.pos.set(Math.sin(w) * 470, 128, Math.cos(w) * 470);
      st.heading = Math.atan2(Math.cos(w), Math.sin(w));
      st.roll = 0.32;
      st.pitch = 0.01;
      updatePlaneVisual(S.planeParts, st, dt, S.elapsed);
      S.fires.update(dt, S.elapsed, S.windX, S.windZ, 3);
    } else if (S.mode === 'over') {
      S.fires.update(dt, S.elapsed, S.windX, S.windZ, S.windSpeed);
    }
    S.bursts.update(dt);
    if (S.mode !== 'playing') audio.update(0.3, 0.2, false);
    S.world.update(dt, S.windX, S.windZ);
    updateCamera(dt);
    hud.update(hudView());
    renderer.render(S.scene, camera);
  };
  loop();
}
