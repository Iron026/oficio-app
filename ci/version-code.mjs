#!/usr/bin/env node
// versionCode determinístico das versões de RELEASE, derivado de package.json.
//   major·1.000.000 + minor·10.000 + patch·100 + estágio
//   estágio: final = 99 · rc.N = 50+N · beta.N = 20+N · alpha.N = N  (N ≤ 29)
// Ex.: 0.5.0 → 50099; 0.5.1 → 50199; 0.6.0-rc.1 → 60051; 1.0.0 → 1000099.
// Sempre acima de todos os builds de depuração e da RC.1 (versionCode = 100 + número da execução do CI; RC.1 = 227).
// Uso: node ci/version-code.mjs [versão]   (sem argumento: versão do package.json)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function versionCode(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(version);
  if (!m) throw new Error(`Versão fora do padrão aceito para release: "${version}"`);
  const [, major, minor, patch, stage, n] = m;
  if (+minor > 99 || +patch > 99) throw new Error(`minor/patch acima de 99: "${version}"`);
  if (stage && (+n < 1 || +n > 29)) throw new Error(`Número de pré-lançamento fora de 1–29: "${version}"`);
  const stageCode = !stage ? 99 : stage === 'rc' ? 50 + +n : stage === 'beta' ? 20 + +n : +n;
  return +major * 1_000_000 + +minor * 10_000 + +patch * 100 + stageCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = process.argv[2] ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  process.stdout.write(String(versionCode(v)));
}
