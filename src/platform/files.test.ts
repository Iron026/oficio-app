import { friendlyError } from '../lib/errors';
import { parseBackup } from '../storage/backup';
import { AppService } from '../state/service';
import { createMemoryAdapter } from '../storage/memory';
import { bytesToBase64, saveFile, saveTextFile, type OficioFilesPlugin } from './files';

function fakePlugin(result: Awaited<ReturnType<OficioFilesPlugin['saveDocument']>> | Error) {
  const calls: Parameters<OficioFilesPlugin['saveDocument']>[0][] = [];
  const plugin: OficioFilesPlugin = {
    async saveDocument(opts) {
      calls.push(opts);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { plugin, calls };
}

describe('exportação de backup no Android (Storage Access Framework)', () => {
  it('envia o JSON exatamente como gerado (acentos, emoji, volume) e informa o arquivo salvo', async () => {
    const service = await AppService.load(createMemoryAdapter());
    await service.completeOnboarding({ name: 'Ana Ção 😀', businessName: 'Salão Ñandú', professionId: 'beleza' });
    for (let i = 0; i < 300; i++) await service.saveClient({ name: `Cliente ${i} — “aspas”`, phone: '', email: '', address: 'Rua São João, 1º andar', notes: 'linha 1\nlinha 2\t✓' });
    const json = service.exportBackup();
    const { plugin, calls } = fakePlugin({ cancelled: false, uri: 'content://x/1', name: 'oficio-backup-2026-11-04.json', bytes: 1 });

    const res = await saveTextFile('oficio-backup-2026-11-04.json', json, { native: true, plugin });

    expect(res).toEqual({ status: 'salvo', where: 'oficio-backup-2026-11-04.json' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.mimeType).toBe('application/json');
    expect(calls[0]!.filename).toBe('oficio-backup-2026-11-04.json');
    expect(calls[0]!.content).toBe(json); // byte a byte
    const restored = parseBackup(calls[0]!.content);
    expect(restored.clients).toHaveLength(300);
    expect(restored.profile?.name).toBe('Ana Ção 😀');
  });

  it('cancelar a janela "Salvar como" não é erro e não salva nada', async () => {
    const { plugin } = fakePlugin({ cancelled: true });
    expect(await saveTextFile('a.json', '{}', { native: true, plugin })).toEqual({ status: 'cancelado' });
  });

  it('falha de gravação é propagada e vira mensagem clara (sem "permissão negada" genérica)', async () => {
    const err = Object.assign(new Error('Não foi possível gravar o arquivo no local escolhido.'), { code: 'WRITE_FAILED' });
    const { plugin } = fakePlugin(err);
    await expect(saveTextFile('a.json', '{}', { native: true, plugin })).rejects.toBe(err);
    expect(friendlyError(err)?.title).toBe('Não foi possível salvar o arquivo');
    expect(friendlyError(Object.assign(new Error('x'), { code: 'PERMISSION_DENIED' }))?.description).toMatch(/Compartilhar/);
  });

  it('usa o nome do arquivo informado quando o provedor não devolve o nome', async () => {
    const { plugin } = fakePlugin({ cancelled: false, uri: 'content://x/2', name: null });
    expect(await saveTextFile('oficio-backup.json', '{}', { native: true, plugin })).toEqual({ status: 'salvo', where: 'oficio-backup.json' });
  });

  it('no navegador continua sendo um download (sem plugin nativo)', async () => {
    const clicks: string[] = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:teste';
    URL.revokeObjectURL = () => undefined;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this.download);
    };
    const { plugin, calls } = fakePlugin({ cancelled: false });
    try {
      expect(await saveTextFile('oficio-backup.json', '{}', { native: false, plugin })).toEqual({ status: 'salvo', where: 'Downloads' });
      expect(clicks).toEqual(['oficio-backup.json']);
      expect(calls).toHaveLength(0);
    } finally {
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});

describe('extrato no Android: CSV como texto e PDF como bytes', () => {
  it('CSV vai em UTF-8 (com BOM) e tipo text/csv, sem alteração', async () => {
    const { plugin, calls } = fakePlugin({ cancelled: false, uri: 'content://x/3', name: 'oficio-extrato-2026-11.csv' });
    const csv = '\uFEFFData;Tipo\r\n04/11/2026;Receita\r\n';
    expect(await saveFile('oficio-extrato-2026-11.csv', csv, 'text/csv', { native: true, plugin })).toEqual({ status: 'salvo', where: 'oficio-extrato-2026-11.csv' });
    expect(calls[0]).toEqual({ filename: 'oficio-extrato-2026-11.csv', content: csv, mimeType: 'text/csv' });
  });

  it('PDF vai em base64 e volta byte a byte (inclusive bytes altos e arquivos grandes)', async () => {
    const { plugin, calls } = fakePlugin({ cancelled: false, uri: 'content://x/4', name: null });
    const bytes = new Uint8Array(300_000).map((_, i) => (i * 37) % 256);
    await saveFile('oficio-extrato-2026-11.pdf', bytes, 'application/pdf', { native: true, plugin });
    expect(calls[0]!.encoding).toBe('base64');
    expect(calls[0]!.mimeType).toBe('application/pdf');
    const back = Uint8Array.from(atob(calls[0]!.content), (c) => c.charCodeAt(0));
    expect(back).toEqual(bytes);
    expect(bytesToBase64(new Uint8Array([0, 255, 128]))).toBe('AP+A');
  });
});
