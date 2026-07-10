// Rend l'app 100% autonome/hors-ligne : on copie le cœur WASM + le worker de
// Tesseract depuis node_modules vers public/tesseract, et on récupère les
// données de langue (français + anglais) dans public/tessdata.
//
// Tout est "best-effort" : si le réseau n'est pas dispo au moment du postinstall,
// le script n'échoue pas — l'app basculera sur le CDN au runtime et on pourra
// relancer `node scripts/vendor-tesseract.mjs` plus tard pour compléter.
import { mkdir, copyFile, access, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const run = promisify(execFile);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const coreDir = join(pub, 'tesseract');
const langDir = join(pub, 'tessdata');

const exists = (p) => access(p).then(() => true).catch(() => false);

async function copyCore() {
  await mkdir(coreDir, { recursive: true });
  const candidates = [
    join(root, 'node_modules', 'tesseract.js-core'),
  ];
  const workerSrc = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
  if (await exists(workerSrc)) {
    await copyFile(workerSrc, join(coreDir, 'worker.min.js'));
    console.log('  ✓ worker.min.js');
  }
  for (const dir of candidates) {
    if (!(await exists(dir))) continue;
    for (const f of await readdir(dir)) {
      if (f.endsWith('.wasm') || f.endsWith('.js')) {
        await copyFile(join(dir, f), join(coreDir, f));
      }
    }
    console.log('  ✓ cœur WASM (tesseract.js-core)');
    return;
  }
  console.log('  ⚠ cœur WASM introuvable dans node_modules (sera chargé via CDN)');
}

async function fetchLang(lang) {
  await mkdir(langDir, { recursive: true });
  const out = join(langDir, `${lang}.traineddata.gz`);
  if (await exists(out)) { console.log(`  ✓ ${lang}.traineddata.gz (déjà présent)`); return; }
  // On récupère les données de langue depuis le registre npm (fonctionne même
  // quand les CDN publics sont bloqués par une politique d'egress).
  const work = join(tmpdir(), `tessdata-${lang}-${process.pid}`);
  try {
    await mkdir(work, { recursive: true });
    const { stdout } = await run('npm', ['pack', `@tesseract.js-data/${lang}`, '--silent'], { cwd: work });
    const tgz = stdout.trim().split('\n').pop();
    // 4.0.0_best_int : bon compromis précision / taille.
    await run('tar', ['-xzf', tgz, '-C', work, `package/4.0.0_best_int/${lang}.traineddata.gz`], { cwd: work });
    await copyFile(join(work, 'package', '4.0.0_best_int', `${lang}.traineddata.gz`), out);
    console.log(`  ✓ ${lang}.traineddata.gz récupéré via npm`);
  } catch (e) {
    console.log(`  ⚠ ${lang}.traineddata.gz non récupéré (${e.message}) — CDN au runtime`);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

console.log('Vendoring Tesseract (pour un fonctionnement hors-ligne) :');
await copyCore().catch((e) => console.log('  ⚠ copie cœur:', e.message));
await fetchLang('fra').catch(() => {});
await fetchLang('eng').catch(() => {});
console.log('Terminé.');
