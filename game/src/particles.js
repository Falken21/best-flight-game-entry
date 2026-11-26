// One tiny pooled particle system for every burst the game needs: steam
// off a doused fire, spray off the pontoons, splash where the water lands.

import * as THREE from 'three';

let sharedTexture = null;

export function makeSoftTexture() {
  if (sharedTexture) return sharedTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.38)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

const MAX_BURSTS = 28;

export function createBursts(scene) {
  const live = [];

  function spawn(opts) {
    if (live.length >= MAX_BURSTS) {
      const old = live.shift();
      scene.remove(old.points);
      old.points.geometry.dispose();
    }
    const count = opts.count ?? 24;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const origin = opts.pos;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * (opts.radius ?? 2);
      positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * (opts.radius ?? 2) * 0.4;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * (opts.radius ?? 2);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (opts.spread ?? 3);
      velocities[i * 3] = Math.cos(a) * r + (opts.vel ? opts.vel.x : 0);
      velocities[i * 3 + 1] = (opts.up ?? 6) * (0.4 + Math.random() * 0.9);
      velocities[i * 3 + 2] = Math.sin(a) * r + (opts.vel ? opts.vel.z : 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: opts.size ?? 5,
      map: makeSoftTexture(),
      transparent: true,
      depthWrite: false,
      color: opts.color ?? 0xffffff,
      opacity: opts.opacity ?? 0.8,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    live.push({
      points,
      velocities,
      life: 0,
      maxLife: opts.life ?? 1.1,
      gravity: opts.gravity ?? -2.5,
      drag: opts.drag ?? 0.6,
    });
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      b.life += dt;
      const pos = b.points.geometry.attributes.position;
      const dragK = Math.max(0, 1 - b.drag * dt);
      for (let j = 0; j < pos.count; j++) {
        b.velocities[j * 3] *= dragK;
        b.velocities[j * 3 + 2] *= dragK;
        b.velocities[j * 3 + 1] = b.velocities[j * 3 + 1] * dragK + b.gravity * dt;
        pos.array[j * 3] += b.velocities[j * 3] * dt;
        pos.array[j * 3 + 1] += b.velocities[j * 3 + 1] * dt;
        pos.array[j * 3 + 2] += b.velocities[j * 3 + 2] * dt;
      }
      pos.needsUpdate = true;
      const fade = 1 - b.life / b.maxLife;
      b.points.material.opacity = Math.max(0, fade) * 0.85;
      if (b.life >= b.maxLife) {
        scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        live.splice(i, 1);
      }
    }
  }

  return { spawn, update };
}
