// Deterministic screenshot scenes (?shot=1..4) and the QA autopilot
// (?bot=1). The shots pose the real game state — plane, fires, HUD and
// all — so every screenshot is an honest render of the game's own code.

import * as THREE from 'three';
import { WORLD, FLIGHT } from './config.js';
import { clamp } from './random.js';

export function shotNumber() {
  const raw = new URLSearchParams(window.location.search).get('shot');
  const n = raw ? parseInt(raw, 10) : 0;
  return n >= 1 && n <= 4 ? n : 0;
}

export function botEnabled() {
  return new URLSearchParams(window.location.search).has('bot');
}

// ?lite=1 strips shadows and caps the pixel ratio so scripted playtests
// on weak GPUs still run near real time. Purely a test harness switch;
// the shipped game ignores it in normal play.
export function liteEnabled() {
  return new URLSearchParams(window.location.search).has('lite');
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function pickNode(fires, predicate, fallback) {
  return fires.nodes.find(predicate) || fires.nodes[fallback % fires.nodes.length];
}

// Poses the game for one screenshot. Returns a camera spec:
// { mode: 'chase' } or { mode: 'fixed', pos, look }.
export function stageShot(n, game) {
  const { state, fires, bursts } = game;
  state.tank = 80;
  if (n === 1) {
    const target = pickNode(fires, (node) => node.y > 26 && node.y < 54, 3);
    fires.ignite(target);
    const second = pickNode(fires, (node) => node !== target && node.y > 14, 7);
    fires.ignite(second);
    target.intensity = 1;
    state.pos.set(target.x - 55, target.y + 44, target.z + 108);
    state.heading = Math.atan2(target.x - state.pos.x, -(target.z - state.pos.z));
    state.pitch = -0.05;
    state.roll = 0.16;
    state.speed = 52;
    state.throttle = 0.72;
    state.tank = 85;
    return { mode: 'chase' };
  }
  if (n === 2) {
    const far = pickNode(fires, (node) => node.x < -80 && node.y > 16, 5);
    fires.ignite(far);
    far.intensity = 0.9;
    state.pos.set(WORLD.lake.x - 30, WORLD.lake.surfaceY + 4.6, WORLD.lake.z + 150);
    state.heading = 0.12;
    state.pitch = 0.01;
    state.roll = 0.05;
    state.speed = 43;
    state.throttle = 0.5;
    state.tank = 46;
    state.scooping = true;
    for (let i = 0; i < 3; i++) {
      bursts.spawn({
        pos: new THREE.Vector3(state.pos.x + (i - 1) * 3, WORLD.lake.surfaceY + 1.2, state.pos.z + 6 + i * 4),
        count: 22, color: 0xeafcff, up: 7, spread: 5, size: 6, life: 1.2, opacity: 0.9,
      });
    }
    return { mode: 'chase' };
  }
  if (n === 3) {
    const far = pickNode(fires, (node) => node.y > 20, 2);
    fires.ignite(far);
    state.pos.set(300, 128, -430);
    state.heading = Math.PI / 2.3;
    state.pitch = 0.02;
    state.roll = 0.34;
    state.speed = 40;
    state.throttle = 0.5;
    state.tank = 65;
    return {
      mode: 'fixed',
      pos: new THREE.Vector3(640, 235, 470),
      look: new THREE.Vector3(-40, 25, -140),
    };
  }
  // n === 4: the drop, cascade mid-fall, steam coming off the fire.
  const target = pickNode(fires, (node) => node.y > 18 && node.y < 50, 4);
  fires.ignite(target);
  target.intensity = 1;
  state.pos.set(target.x + 40, target.y + 74, target.z + 150);
  state.heading = Math.atan2(target.x - state.pos.x, -(target.z - state.pos.z));
  state.pitch = -0.14;
  state.roll = -0.08;
  state.speed = 55;
  state.throttle = 0.66;
  state.tank = 12;
  const dropPos = new THREE.Vector3(target.x + 6, target.y + 34, target.z + 8);
  fires.releaseWater(dropPos.x, dropPos.y + 26, dropPos.z, new THREE.Vector3(0, -6, 0));
  bursts.spawn({ pos: new THREE.Vector3(target.x, target.y + 5, target.z), count: 26, color: 0xf4f7f7, up: 12, spread: 5, size: 10, life: 1.6, opacity: 0.9 });
  return { mode: 'chase' };
}

// A simple seek-and-serve pilot for scripted playtests: scoops when the
// tank is low, otherwise flies to the priority fire and drops.
export function createBot() {
  let phase = 'scoop';
  return {
    input(state, fires, world) {
      const burning = fires.nodes.filter((node) => node.state === 'burning');
      if (state.tank > 62 && burning.length > 0) phase = 'attack';
      if (state.tank < 18) phase = 'scoop';
      let tx;
      let tz;
      let targetAlt;
      if (phase === 'scoop') {
        tx = WORLD.lake.x;
        tz = WORLD.lake.z;
        const dLake = Math.hypot(tx - state.pos.x, tz - state.pos.z);
        targetAlt = dLake < 240 ? WORLD.lake.surfaceY + 4.5 : 95;
      } else {
        const node = burning[0];
        tx = node.x;
        tz = node.z;
        targetAlt = node.y + 62;
      }
      const dx = tx - state.pos.x;
      const dz = tz - state.pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, -dz);
      const diff = wrapAngle(desired - state.heading);
      const roll = clamp(diff * 1.35, -1, 1);
      const altError = targetAlt - state.pos.y;
      const desiredPitch = clamp(altError * 0.012, -0.4, 0.42);
      const pitch = clamp((desiredPitch - state.pitch) * 2.4, -1, 1);
      const throttle = phase === 'scoop' && dist < 240 ? -0.4 : 0.6;
      // Drop on the predicted impact point, not the plane's position:
      // the cascade keeps the plane's velocity, so it lands ahead.
      let drop = false;
      if (phase === 'attack') {
        const node = burning[0];
        // Fall time solving 21t² − vy·t − h = 0, so a climbing or
        // diving release still leads the target correctly.
        const h = Math.max(state.pos.y - node.y, 1);
        const fall = (state.vel.y + Math.sqrt(state.vel.y * state.vel.y + 84 * h)) / 42;
        const leadX = state.pos.x + state.vel.x * fall;
        const leadZ = state.pos.z + state.vel.z * fall;
        drop =
          state.tank > 40 &&
          Math.hypot(node.x - leadX, node.z - leadZ) < 18 &&
          state.pos.y - world.heightAt(state.pos.x, state.pos.z) < 120;
      }
      return { pitch, roll, rudder: 0, throttle, drop };
    },
  };
}

export function flightLimits() {
  return FLIGHT;
}
