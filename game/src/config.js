// Isla Brava: Water Bomber — shared tuning constants.
// Every gameplay number lives here so the feel can be tuned in one place.

export const WORLD = {
  size: 2400, // terrain plane is size x size metres
  seaLevel: 0,
  islandRadius: 980, // shoreline distance from centre
  volcano: { x: -270, z: -250, height: 158, radius: 340 },
  lake: { x: 250, z: 310, radius: 215, surfaceY: 2.2 },
  seed: 20261126,
};

export const FLIGHT = {
  minSpeed: 24, // m/s, below this the wing stalls
  cruiseSpeed: 46,
  maxSpeed: 88,
  throttleRate: 0.55, // throttle units per second
  accel: 9.5, // m/s^2 at full throttle difference
  pitchRate: 0.85, // rad/s at full stick
  rollRate: 1.9, // rad/s at full stick
  maxPitch: 0.62, // rad
  maxRoll: 1.05, // rad
  turnPerRoll: 0.55, // heading rad/s at maxRoll
  tankCapacity: 100,
  scoopRate: 42, // tank units per second while skimming
  scoopMaxAltitude: 7.5, // metres above the lake surface
  scoopMinSpeed: 27,
  scoopMaxSpeed: 58,
  dropRadiusFull: 26, // metres: a direct hit douses outright
  dropRadiusPartial: 58, // metres: a near miss halves the fire
};

export const FIRE = {
  nodeCount: 24,
  spreadBaseSeconds: 34, // per burning node, before wave scaling
  scorchPerSecond: 0.16, // per burning node at full intensity
  buildingScorchPenalty: 20, // percent, when a building burns down
  buildingBurnSeconds: 26, // of an adjacent fire before the building falls
};

export const WAVES = [
  null, // waves are 1-based; index 0 unused
  { fires: 3, wind: 2, spreadScale: 1.0 },
  { fires: 4, wind: 4, spreadScale: 0.92 },
  { fires: 5, wind: 6, spreadScale: 0.85 },
  { fires: 6, wind: 8, spreadScale: 0.78 },
  { fires: 7, wind: 10, spreadScale: 0.72 },
  { fires: 8, wind: 12, spreadScale: 0.66 },
];

// Waves past the table keep scaling gently.
export function waveSpec(wave) {
  if (wave < WAVES.length) return WAVES[wave];
  const extra = wave - (WAVES.length - 1);
  return {
    fires: Math.min(8 + extra, FIRE.nodeCount - 4),
    wind: 12 + extra * 1.5,
    spreadScale: Math.max(0.45, 0.66 - extra * 0.04),
  };
}

export const SCORE = {
  douse: 500,
  partialDouse: 150,
  waveClear: 1000,
  buildingLost: -750,
  scoopBonus: 25, // per full scoop from empty
};

export const PALETTE = {
  sky: 0xf2a65e,
  skyHorizon: 0xffd9a3,
  fog: 0xf6b877,
  sea: 0x2e7f86,
  lake: 0x3fa7a0,
  sand: 0xe8cf9f,
  grass: 0x77a657,
  forest: 0x3f7048,
  rock: 0x8a7f72,
  snow: 0xf7f3ea,
  trunk: 0x6d4c33,
  pine: 0x2f6b3c,
  flame: 0xff7b24,
  flameCore: 0xffc63d,
  smoke: 0x3a3733,
};
