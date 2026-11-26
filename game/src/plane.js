// The water bomber: a low-poly seaplane built from primitives, and an
// arcade flight model that stays forgiving — pitch and bank are direct,
// speed bleeds in a climb and builds in a dive, and a full tank makes
// everything heavier.

import * as THREE from 'three';
import { FLIGHT } from './config.js';
import { clamp } from './random.js';

function part(geo, color, x, y, z, parent, opts = {}) {
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.75, metalness: opts.metalness ?? 0.05, flatShading: true })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildPlaneMesh() {
  const group = new THREE.Group();
  const body = 0xf7b731;
  const accent = 0xc23b2a;

  const fuselage = part(new THREE.CylinderGeometry(1.05, 1.55, 10.5, 8), body, 0, 0, 0.4, group);
  fuselage.rotation.x = Math.PI / 2;
  const nose = part(new THREE.ConeGeometry(1.05, 2.4, 8), accent, 0, 0, -5.6, group);
  nose.rotation.x = -Math.PI / 2;
  const tail = part(new THREE.ConeGeometry(0.85, 3.6, 8), body, 0, 0.25, 6.6, group);
  tail.rotation.x = Math.PI / 2;

  const glass = part(new THREE.SphereGeometry(1.02, 10, 8), 0x24333d, 0, 0.95, -1.7, group, { roughness: 0.15, metalness: 0.45 });
  glass.scale.set(0.92, 0.72, 1.5);

  const wing = part(new THREE.BoxGeometry(15.5, 0.32, 2.7), body, 0, 1.75, -0.7, group);
  part(new THREE.BoxGeometry(1.7, 0.36, 2.7), accent, -7.6, 1.75, -0.7, group);
  part(new THREE.BoxGeometry(1.7, 0.36, 2.7), accent, 7.6, 1.75, -0.7, group);
  part(new THREE.BoxGeometry(0.28, 1.5, 0.9), body, -2.4, 0.9, -0.7, group);
  part(new THREE.BoxGeometry(0.28, 1.5, 0.9), body, 2.4, 0.9, -0.7, group);

  const stab = part(new THREE.BoxGeometry(5.6, 0.26, 1.6), body, 0, 0.7, 7.6, group);
  stab.name = 'stabilizer';
  const fin = part(new THREE.BoxGeometry(0.28, 2.6, 1.9), accent, 0, 1.7, 7.6, group);
  fin.name = 'fin';

  const tank = part(new THREE.BoxGeometry(2.5, 1.1, 5.6), 0xdfe5e8, 0, -1.35, 0.6, group, { roughness: 0.4, metalness: 0.3 });
  tank.name = 'tank';

  for (const side of [-1, 1]) {
    const pontoon = part(new THREE.CapsuleGeometry(0.62, 5.4, 3, 8), accent, side * 2.3, -2.5, -0.2, group);
    pontoon.rotation.x = Math.PI / 2;
    const strutF = part(new THREE.BoxGeometry(0.24, 1.6, 0.5), 0x555f66, side * 2.1, -1.6, -1.9, group);
    strutF.rotation.z = side * 0.25;
    const strutB = part(new THREE.BoxGeometry(0.24, 1.6, 0.5), 0x555f66, side * 2.1, -1.6, 1.6, group);
    strutB.rotation.z = side * 0.25;
  }

  const prop = new THREE.Group();
  prop.position.set(0, 0, -6.9);
  const bladeA = part(new THREE.BoxGeometry(0.5, 5.6, 0.14), 0x2e2a26, 0, 0, 0, prop);
  bladeA.castShadow = false;
  const bladeB = part(new THREE.BoxGeometry(5.6, 0.5, 0.14), 0x2e2a26, 0, 0, 0, prop);
  bladeB.castShadow = false;
  const spinner = part(new THREE.ConeGeometry(0.55, 1.3, 8), accent, 0, 0, -0.5, prop);
  spinner.rotation.x = -Math.PI / 2;
  group.add(prop);

  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return { group, prop };
}

export function createFlightState(startPos, heading) {
  return {
    pos: startPos.clone(),
    vel: new THREE.Vector3(),
    heading,
    pitch: 0,
    roll: 0,
    speed: 44,
    throttle: 0.55,
    tank: 0,
    stalled: false,
    scooping: false,
  };
}

const _forward = new THREE.Vector3();

export function forwardVector(state, out) {
  const cp = Math.cos(state.pitch);
  out.set(Math.sin(state.heading) * cp, Math.sin(state.pitch), -Math.cos(state.heading) * cp);
  return out;
}

// input: { pitch, roll, rudder, throttle } each in -1..1 (pitch + = climb).
// heavy is 0..1, how full the tank is: it caps speed and climb authority.
export function stepFlight(state, input, dt, heavy) {
  state.throttle = clamp(state.throttle + input.throttle * FLIGHT.throttleRate * dt, 0, 1);

  const targetRoll = input.roll * FLIGHT.maxRoll;
  const rollStep = FLIGHT.rollRate * dt;
  state.roll += clamp(targetRoll - state.roll, -rollStep, rollStep);

  const targetPitch = input.pitch * FLIGHT.maxPitch;
  const pitchStep = FLIGHT.pitchRate * dt;
  state.pitch += clamp(targetPitch - state.pitch, -pitchStep, pitchStep);

  const speedFactor = clamp(state.speed / FLIGHT.cruiseSpeed, 0.4, 1.4);
  state.heading += Math.sin(state.roll) * FLIGHT.turnPerRoll * speedFactor * dt;
  state.heading += input.rudder * 0.3 * dt;

  const powerSpeed =
    FLIGHT.minSpeed + 6 + state.throttle * (FLIGHT.maxSpeed - FLIGHT.minSpeed - 6) - heavy * 7;
  const dv = (powerSpeed - state.speed) * 0.5 - Math.sin(state.pitch) * 21;
  state.speed = clamp(state.speed + dv * dt, 12, FLIGHT.maxSpeed + 8);

  state.stalled = state.speed < FLIGHT.minSpeed + 1;
  if (state.stalled) {
    state.pitch += (-0.4 - state.pitch) * Math.min(1, dt * 1.7);
  }

  forwardVector(state, _forward);
  state.vel.copy(_forward).multiplyScalar(state.speed);
  if (state.stalled) state.vel.y -= (FLIGHT.minSpeed + 1 - state.speed) * 0.5;
  state.pos.addScaledVector(state.vel, dt);
  return state;
}

export function updatePlaneVisual(parts, state, dt, elapsed) {
  const { group, prop } = parts;
  group.position.copy(state.pos);
  group.rotation.order = 'YXZ';
  group.rotation.y = -state.heading;
  group.rotation.x = state.pitch;
  group.rotation.z = -state.roll;
  prop.rotation.z -= (4 + state.throttle * 42) * dt;
  const tankMesh = group.getObjectByName('tank');
  if (tankMesh) {
    const fill = 0.55 + (state.tank / FLIGHT.tankCapacity) * 0.5;
    tankMesh.scale.set(1, fill, 1);
  }
  void elapsed;
}
