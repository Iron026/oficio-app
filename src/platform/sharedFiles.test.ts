/**
 * Auditoria pré-RC (0.5.0) — arquivos compartilhados (backup completo, recibos, extratos) não ficam esquecidos no
 * cache do app: vão para uma pasta própria, limpa antes de cada compartilhamento, ao abrir o app e em
 * "Apagar todos os dados". Antes, ficavam no cache para sempre.
 */
const calls: { op: string; arg: Record<string, unknown> }[] = [];
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: async (arg: Record<string, unknown>) => { calls.push({ op: 'writeFile', arg }); return { uri: `file:///cache/${String(arg.path)}` }; },
    rmdir: async (arg: Record<string, unknown>) => { calls.push({ op: 'rmdir', arg }); },
  },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: async (arg: Record<string, unknown>) => { calls.push({ op: 'share', arg }); } } }));
vi.mock('./native', () => ({ isNative: () => true }));

import { clearSharedFiles, shareFile } from './files';

beforeEach(() => { calls.length = 0; });

describe('arquivos compartilhados no cache', () => {
  it('compartilhar grava numa pasta própria e limpa o que sobrou do compartilhamento anterior antes', async () => {
    await shareFile('oficio-backup-2026-11-13.json', '{"dados":"pessoais"}', 'Backup');
    expect(calls.map((c) => c.op)).toEqual(['rmdir', 'writeFile', 'share']);
    expect(calls[0]!.arg).toMatchObject({ path: 'compartilhar', directory: 'CACHE', recursive: true });
    expect(calls[1]!.arg).toMatchObject({ path: 'compartilhar/oficio-backup-2026-11-13.json', directory: 'CACHE', recursive: true });
    expect(calls[2]!.arg).toMatchObject({ files: ['file:///cache/compartilhar/oficio-backup-2026-11-13.json'] });
  });

  it('limpar remove a pasta inteira e não falha se ela não existe', async () => {
    await clearSharedFiles();
    expect(calls).toEqual([{ op: 'rmdir', arg: { path: 'compartilhar', directory: 'CACHE', recursive: true } }]);
  });
});
