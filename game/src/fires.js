// The wildfire: pre-placed nodes in the forest that ignite, grow, throw
// smoke the whole island can see, and spread downwind on a timer. The
// player douses them with tanked lake water; a doused node leaves a black
// scar and stops feeding the SCORCH meter.

import * as THREE from 'three';
import { FIRE, FLIGHT, PALETTE } from './config.js';
import { mulberry32, randRange, clamp } from './random.js';
import { makeSoftTexture } from './particles.js';

function buildFlameGroup() {
  const group = new THREE.Group();
  const flames = [];
  const outer = new THREE.MeshBasicMaterial({ color: PALETTE.flame, transparent: true, opacity: 0.92 });
  const core = new THREE.MeshBasicMaterial({ color: PALETTE.flameCore, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6.5 - i * 1.6, 17 - i * 3, 7), i === 2 ? core : outer);
    cone.position.y = 6 - i * 0.8;
    cone.rotation.y = (i * Math.PI) / 3;
    group.add(cone);
    flames.push(cone);
  }
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeSoftTexture(), color: 0xff8a3d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.scale.set(46, 30, 1);
  glow.position.y = 7;
  group.add(glow);
  return { group, flames, glow };
}

function buildSmoke(node, texture) {
  const count = 22;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seeds[i] = Math.random();
    positions[i * 3 + 1] = seeds[i] * 120;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 26,
    map: texture,
    transparent: true,
    depthWrite: false,
    color: PALETTE.smoke,
    opacity: 0.5,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  node.group.add(points);
  return { points, seeds, count };
}

export function createFireSystem(scene, spots, heightAt, bursts) {
  const rng = mulberry32(0xf17e);
  const smokeTexture = makeSoftTexture();
  const nodes = spots.map((s, i) => {
    const { group, flames, glow } = buildFlameGroup();
    group.position.set(s.x, s.y, s.z);
    group.visible = false;
    scene.add(group);
    const scar = new THREE.Mesh(
      new THREE.CircleGeometry(17, 18),
      new THREE.MeshBasicMaterial({ color: 0x1f1a16, transparent: true, opacity: 0.72 })
    );
    scar.rotation.x = -Math.PI / 2;
    scar.position.set(s.x, s.y + 0.35, s.z);
    scar.visible = false;
    scene.add(scar);
    const node = {
      id: i,
      x: s.x,
      y: s.y,
      z: s.z,
      state: 'idle', // idle | burning | doused
      intensity: 0,
      spreadTimer: 0,
      spreadCount: 0,
      phase: rng() * Math.PI * 2,
      group,
      flames,
      glow,
      scar,
      smoke: null,
    };
    node.smoke = buildSmoke(node, smokeTexture);
    node.smoke.points.visible = false;
    return node;
  });

  // The target marker: a pulsing ring and a soft column of light over the
  // one fire the HUD is steering the player to.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(14.5, 18.5, 40),
    new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(15.5, 15.5, 90, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff7b24, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })
  );
  column.visible = false;
  scene.add(column);
  const fireLight = new THREE.PointLight(0xff7b24, 0, 260, 1.6);
  scene.add(fireLight);

  const falling = []; // water drops in flight: { points, vel, x, z }

  function ignite(node, wind) {
    node.state = 'burning';
    node.intensity = 0.55;
    node.group.visible = true;
    node.smoke.points.visible = true;
    node.spreadTimer = FIRE.spreadBaseSeconds * randRange(rng, 0.85, 1.3);
    void wind;
  }

  function igniteNearest(count, windAngleX, windAngleZ, spreadScale) {
    const idle = nodes.filter((n) => n.state === 'idle');
    let lit = 0;
    while (lit < count && idle.length > 0) {
      // Bias new fires downwind of the island centre so the wind reads.
      idle.sort((a, b) => {
        const da = (a.x - windAngleX * 300) ** 2 + (a.z - windAngleZ * 300) ** 2;
        const db = (b.x - windAngleX * 300) ** 2 + (b.z - windAngleZ * 300) ** 2;
        return da - db;
      });
      const node = idle.shift();
      ignite(node);
      node.spreadTimer *= spreadScale;
      lit++;
    }
    return lit;
  }

  function douse(node) {
    node.state = 'doused';
    node.intensity = 0;
    node.group.visible = false;
    node.smoke.points.visible = false;
    node.scar.visible = true;
    bursts.spawn({ pos: new THREE.Vector3(node.x, node.y + 4, node.z), count: 30, color: 0xf4f7f7, up: 11, spread: 5, size: 9, life: 1.4, opacity: 0.9 });
    bursts.spawn({ pos: new THREE.Vector3(node.x, node.y + 2, node.z), count: 16, color: 0xbfe8e2, up: 4, spread: 8, size: 6, life: 0.8, opacity: 0.8 });
  }

  function releaseWater(x, y, z, vel) {
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = x + (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = y - Math.random() * 6;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 3.6, map: makeSoftTexture(), transparent: true, depthWrite: false, color: 0x9fdcec, opacity: 0.9 })
    );
    points.frustumCulled = false;
    scene.add(points);
    falling.push({ points, vel: vel.clone(), x, z });
  }

  function resolveDrop(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const node of nodes) {
      if (node.state !== 'burning') continue;
      const d = Math.hypot(node.x - x, node.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    if (!best) return { kind: 'miss' };
    if (bestDist <= FLIGHT.dropRadiusFull) {
      douse(best);
      return { kind: 'full', node: best };
    }
    if (bestDist <= FLIGHT.dropRadiusPartial) {
      best.intensity -= 0.55;
      bursts.spawn({ pos: new THREE.Vector3(best.x, best.y + 5, best.z), count: 18, color: 0xf4f7f7, up: 8, spread: 4, size: 8, life: 1.1, opacity: 0.85 });
      if (best.intensity <= 0.12) {
        douse(best);
        return { kind: 'full', node: best, viaPartial: true };
      }
      return { kind: 'partial', node: best };
    }
    return { kind: 'miss' };
  }

  const events = { spread: [], drops: [] };

  function update(dt, elapsed, windX, windZ, windSpeed) {
    events.spread.length = 0;
    events.drops.length = 0;
    for (const node of nodes) {
      if (node.state !== 'burning') continue;
      node.intensity = Math.min(1, node.intensity + dt * 0.012);
      const flicker = 0.9 + Math.sin(elapsed * 11 + node.phase) * 0.14 + Math.sin(elapsed * 23 + node.phase * 2) * 0.08;
      node.group.scale.set(1, node.intensity * flicker * 1.6, 1);
      for (const flame of node.flames) flame.rotation.y += dt * 1.7;
      node.glow.material.opacity = 0.4 + node.intensity * 0.25;

      const pos = node.smoke.points.geometry.attributes.position;
      for (let i = 0; i < node.smoke.count; i++) {
        let y = pos.getY(i) + dt * (14 + node.intensity * 10);
        if (y > 130) y = 2;
        pos.setY(i, y);
        pos.setX(i, Math.sin(node.phase + y * 0.05) * 3 + windX * (y / 130) * windSpeed * 2.4);
        pos.setZ(i, Math.cos(node.phase + y * 0.04) * 3 + windZ * (y / 130) * windSpeed * 2.4);
      }
      pos.needsUpdate = true;

      node.spreadTimer -= dt;
      if (node.spreadTimer <= 0) {
        node.spreadCount++;
        node.spreadTimer = FIRE.spreadBaseSeconds * (1.25 + node.spreadCount * 0.35) * randRange(rng, 0.85, 1.25);
        let target = null;
        let targetScore = Infinity;
        for (const other of nodes) {
          if (other.state !== 'idle') continue;
          const d = Math.hypot(other.x - node.x, other.z - node.z);
          if (d > 330) continue;
          const downwind = (other.x - node.x) * windX + (other.z - node.z) * windZ;
          const score = d - downwind * 0.6;
          if (score < targetScore) {
            targetScore = score;
            target = other;
          }
        }
        if (target) {
          ignite(target);
          events.spread.push(target);
        }
      }
    }

    for (let i = falling.length - 1; i >= 0; i--) {
      const drop = falling[i];
      drop.vel.y -= 42 * dt;
      const pos = drop.points.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        pos.array[j * 3] += drop.vel.x * dt;
        pos.array[j * 3 + 1] += drop.vel.y * dt - j * 0.004;
        pos.array[j * 3 + 2] += drop.vel.z * dt;
      }
      pos.needsUpdate = true;
      drop.x += drop.vel.x * dt;
      drop.z += drop.vel.z * dt;
      const groundY = heightAt(drop.x, drop.z);
      const headY = pos.getY(0);
      if (headY <= groundY + 1.5) {
        scene.remove(drop.points);
        drop.points.geometry.dispose();
        drop.points.material.dispose();
        falling.splice(i, 1);
        bursts.spawn({ pos: new THREE.Vector3(drop.x, groundY + 2, drop.z), count: 20, color: 0x9fdcec, up: 5, spread: 7, size: 6, life: 0.7, opacity: 0.8 });
        events.drops.push(resolveDrop(drop.x, drop.z));
      }
    }
    return events;
  }

  function setTarget(node, elapsed) {
    if (!node) {
      ring.visible = false;
      column.visible = false;
      fireLight.intensity = 0;
      return;
    }
    const pulse = 1 + Math.sin(elapsed * 3.2) * 0.07;
    ring.visible = true;
    ring.position.set(node.x, node.y + 5, node.z);
    ring.scale.setScalar(pulse);
    column.visible = true;
    column.position.set(node.x, node.y + 45, node.z);
    fireLight.position.set(node.x, node.y + 16, node.z);
    fireLight.intensity = 900 + Math.sin(elapsed * 9) * 220;
  }

  function burningCount() {
    return nodes.reduce((n, node) => n + (node.state === 'burning' ? 1 : 0), 0);
  }

  function burningIntensity() {
    return nodes.reduce((n, node) => n + (node.state === 'burning' ? node.intensity : 0), 0);
  }

  return { nodes, ignite, igniteNearest, releaseWater, update, setTarget, burningCount, burningIntensity, events };
}
