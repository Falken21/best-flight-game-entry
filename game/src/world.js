// The island of Isla Brava: one analytic height field drives both the
// rendered terrain and every gameplay query, so what you see is exactly
// what the flight model feels.

import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { mulberry32, fbmFactory, clamp, lerp } from './random.js';

const fbm = fbmFactory(WORLD.seed);

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function heightAt(x, z) {
  const dx = x * 0.94;
  const dz = z * 1.02;
  const d = Math.sqrt(dx * dx + dz * dz);
  const t = clamp(1 - d / WORLD.islandRadius, 0, 1);
  let h = 74 * Math.pow(t, 1.5);
  const hillMask = clamp(h / 34, 0, 1);
  h += (fbm(x * 0.0016 + 13.7, z * 0.0016 + 7.3, 4) - 0.5) * 48 * hillMask;

  const vx = x - WORLD.volcano.x;
  const vz = z - WORLD.volcano.z;
  const dv = Math.sqrt(vx * vx + vz * vz);
  const cone = WORLD.volcano.height * Math.pow(clamp(1 - dv / WORLD.volcano.radius, 0, 1), 1.7);
  const crater = -17 * Math.exp(-(dv * dv) / (2 * 58 * 58));
  h += cone + crater;

  const lx = x - WORLD.lake.x;
  const lz = z - WORLD.lake.z;
  const dl = Math.sqrt(lx * lx + lz * lz);
  const lakeMask = smoothstep(WORLD.lake.radius + 80, WORLD.lake.radius - 40, dl);
  h = lerp(h, -5.5, lakeMask);

  if (d > WORLD.islandRadius) {
    h = lerp(h, -9, clamp((d - WORLD.islandRadius) / 130, 0, 1));
  }
  return h;
}

export function isOverLake(x, z) {
  const lx = x - WORLD.lake.x;
  const lz = z - WORLD.lake.z;
  return lx * lx + lz * lz < WORLD.lake.radius * WORLD.lake.radius;
}

function terrainColor(x, z, h, slope, rng) {
  const jitter = 0.92 + rng() * 0.16;
  const c = new THREE.Color();
  if (h < 1.8) c.setHex(PALETTE.sand);
  else if (h < 22) c.setHex(PALETTE.grass).lerp(new THREE.Color(PALETTE.sand), clamp((6 - h) / 6, 0, 0.6));
  else if (h < 58) c.setHex(PALETTE.forest).lerp(new THREE.Color(PALETTE.grass), clamp((58 - h) / 60, 0, 0.45));
  else if (h < 104) c.setHex(PALETTE.rock).lerp(new THREE.Color(PALETTE.forest), clamp((76 - h) / 40, 0, 0.5));
  else c.setHex(PALETTE.snow).lerp(new THREE.Color(PALETTE.rock), clamp((118 - h) / 30, 0, 0.6));
  if (slope > 0.55 && h >= 1.8) c.lerp(new THREE.Color(PALETTE.rock), clamp((slope - 0.55) * 1.6, 0, 0.75));
  c.multiplyScalar(jitter);
  return c;
}

function buildTerrain() {
  const segments = 150;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  const faceted = geo.toNonIndexed();
  faceted.computeVertexNormals();
  const rng = mulberry32(WORLD.seed ^ 0x51ab);
  const fpos = faceted.attributes.position;
  const fnor = faceted.attributes.normal;
  const colors = new Float32Array(fpos.count * 3);
  for (let i = 0; i < fpos.count; i++) {
    const slope = 1 - fnor.getY(i);
    const c = terrainColor(fpos.getX(i), fpos.getZ(i), fpos.getY(i), slope, rng);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  faceted.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(faceted, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildWater() {
  const group = new THREE.Group();
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.size * 0.85, 48),
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.16, metalness: 0.3, transparent: true, opacity: 0.94 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.seaLevel;
  group.add(sea);
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.lake.radius, 40),
    new THREE.MeshStandardMaterial({ color: PALETTE.lake, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.95 })
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(WORLD.lake.x, WORLD.lake.surfaceY, WORLD.lake.z);
  group.add(lake);
  return group;
}

function scatterTrees(rng) {
  const spots = [];
  let guard = 0;
  while (spots.length < 640 && guard++ < 9000) {
    const x = (rng() * 2 - 1) * 900;
    const z = (rng() * 2 - 1) * 900;
    const h = heightAt(x, z);
    if (h < 7 || h > 56) continue;
    if (isOverLake(x, z)) continue;
    const dv = Math.hypot(x - WORLD.volcano.x, z - WORLD.volcano.z);
    if (dv < 150) continue;
    spots.push({ x, z, y: h, s: 0.8 + rng() * 0.9 });
  }
  return spots;
}

function buildForest(treeSpots) {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
  const pineGeo = new THREE.ConeGeometry(4.6, 13, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1, flatShading: true });
  const pineMat = new THREE.MeshStandardMaterial({ color: PALETTE.pine, roughness: 1, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const pines = new THREE.InstancedMesh(pineGeo, pineMat, treeSpots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  treeSpots.forEach((t, i) => {
    q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
    m.compose(new THREE.Vector3(t.x, t.y + 2.2 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(t.x, t.y + (5 + 5.5) * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
    pines.setMatrixAt(i, m);
  });
  trunks.castShadow = true;
  pines.castShadow = true;
  group.add(trunks, pines);
  return group;
}

function pickFireSpots(rng, treeSpots) {
  const spots = [];
  const pool = treeSpots.filter((t) => t.y > 10 && t.y < 52);
  let guard = 0;
  while (spots.length < 24 && guard++ < 3000) {
    const t = pool[Math.floor(rng() * pool.length)];
    if (!t) break;
    if (spots.some((s) => Math.hypot(s.x - t.x, s.z - t.z) < 120)) continue;
    spots.push({ x: t.x, z: t.z, y: t.y });
  }
  return spots;
}

function box(w, h, d, color, x, y, z, parent) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildVillage() {
  const group = new THREE.Group();
  const rng = mulberry32(WORLD.seed ^ 0xbeef);
  const homes = [
    [430, -140], [468, -108], [398, -96], [452, -176], [392, -168],
  ];
  for (const [hx, hz] of homes) {
    const hy = heightAt(hx, hz);
    box(13, 6, 11, 0xf3e5cf, hx, hy + 2.2, hz, group);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(10.5, 4.6, 4),
      new THREE.MeshStandardMaterial({ color: 0xb5502e, roughness: 1, flatShading: true })
    );
    roof.position.set(hx, hy + 7.4, hz);
    roof.rotation.y = Math.PI / 4 + rng() * 0.2;
    roof.castShadow = true;
    group.add(roof);
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffca6a })
    );
    win.position.set(hx + 3.4, hy + 2.6, hz + 5.6);
    group.add(win);
  }
  return { group, x: 430, z: -135, name: 'the village' };
}

function buildLighthouse() {
  const group = new THREE.Group();
  const x = -640;
  const z = 390;
  const y = heightAt(x, z);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.8, flatShading: true });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.6, 24, 10), towerMat);
  tower.position.set(x, y + 12, z);
  tower.castShadow = true;
  group.add(tower);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(4.7, 5.1, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xc23b2a, roughness: 0.8, flatShading: true })
  );
  band.position.set(x, y + 15, z);
  group.add(band);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
  );
  lamp.position.set(x, y + 26, z);
  group.add(lamp);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(7, 46, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(x + 24, y + 26, z);
  const beamPivot = new THREE.Group();
  beamPivot.position.set(x, y + 26, z);
  beam.position.set(24, 0, 0);
  beamPivot.add(beam);
  group.add(beamPivot);
  return { group, x, z, name: 'the lighthouse', beamPivot };
}

function buildDepot() {
  const group = new THREE.Group();
  const x = -60;
  const z = 640;
  const y = heightAt(x, z);
  for (const off of [-11, 11]) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 17, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.6, metalness: 0.25, flatShading: true })
    );
    tank.rotation.z = Math.PI / 2;
    tank.position.set(x + off, y + 6, z);
    tank.castShadow = true;
    group.add(tank);
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(6.15, 6.15, 3, 12),
      new THREE.MeshStandardMaterial({ color: 0xc96a1e, roughness: 0.7, flatShading: true })
    );
    stripe.rotation.z = Math.PI / 2;
    stripe.position.set(x + off, y + 6, z);
    group.add(stripe);
  }
  box(14, 5, 9, 0x9aa3a8, x, y + 2, z + 16, group);
  return { group, x, z, name: 'the fuel depot' };
}

function darkenBuilding(building) {
  building.group.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.color) {
      obj.material = obj.material.clone();
      obj.material.color.multiplyScalar(0.22);
    }
  });
}

function buildClouds(rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, roughness: 1, flatShading: true, transparent: true, opacity: 0.88 });
  const clouds = [];
  for (let i = 0; i < 11; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(16 + rng() * 22, 7, 6), mat);
      s.position.set(p * 22 - puffs * 10, rng() * 6, rng() * 14 - 7);
      s.scale.y = 0.42;
      cloud.add(s);
    }
    cloud.position.set((rng() * 2 - 1) * 1000, 190 + rng() * 90, (rng() * 2 - 1) * 1000);
    clouds.push(cloud);
    group.add(cloud);
  }
  return { group, clouds };
}

export function createWorld(scene) {
  const rng = mulberry32(WORLD.seed ^ 0x77aa);
  scene.add(buildTerrain());
  scene.add(buildWater());

  const treeSpots = scatterTrees(rng);
  scene.add(buildForest(treeSpots));
  const fireSpots = pickFireSpots(rng, treeSpots);

  const village = buildVillage();
  const lighthouse = buildLighthouse();
  const depot = buildDepot();
  scene.add(village.group, lighthouse.group, depot.group);
  const buildings = [village, lighthouse, depot].map((b) => ({
    name: b.name,
    x: b.x,
    z: b.z,
    radius: 58,
    health: 100,
    burned: false,
    group: b.group,
    burnDown() {
      this.burned = true;
      darkenBuilding(this);
    },
  }));

  const { group: cloudGroup, clouds } = buildClouds(rng);
  scene.add(cloudGroup);

  return {
    fireSpots,
    buildings,
    heightAt,
    isOverLake,
    update(dt, windDirX, windDirZ) {
      for (const cloud of clouds) {
        cloud.position.x += windDirX * dt * 2.2;
        cloud.position.z += windDirZ * dt * 2.2;
        if (cloud.position.x > 1250) cloud.position.x = -1250;
        if (cloud.position.x < -1250) cloud.position.x = 1250;
        if (cloud.position.z > 1250) cloud.position.z = -1250;
        if (cloud.position.z < -1250) cloud.position.z = 1250;
      }
      lighthouse.beamPivot.rotation.y += dt * 0.5;
    },
  };
}
