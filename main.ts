// Isla Brava: Water Bomber — hand-in program.
//
// Copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json with buildDossier from the kit's
// library. The dossier is written as the exact bytes buildDossier
// returns: the scorer rebuilds it from the same files and compares byte
// for byte, so no re-encoding, stringifying or trailing newline.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
// Clear any previous run's copies first: a stale screenshot or game file
// left in the output would change the dossier the scorer rebuilds.
rmSync(join(outputDir, 'game'), { recursive: true, force: true });
rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
