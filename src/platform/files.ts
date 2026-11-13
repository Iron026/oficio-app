import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

/** Resultado de salvar um arquivo: salvo (com o local) ou cancelado pelo usuário. */
export type SaveResult = { status: 'salvo'; where: string } | { status: 'cancelado' };

/** Plugin nativo do app (android/.../BackupFilePlugin.java). */
export interface OficioFilesPlugin {
  saveDocument(options: { filename: string; content: string; mimeType: string; encoding?: 'utf8' | 'base64' }): Promise<{ cancelled: boolean; uri?: string; name?: string | null; bytes?: number }>;
}

const OficioFiles = registerPlugin<OficioFilesPlugin>('OficioFiles');

/** Conteúdo de um arquivo: texto (gravado em UTF-8) ou bytes (ex.: PDF). */
export type FileData = string | Uint8Array;

/** Bytes → base64 em blocos (sem estourar a pilha em arquivos grandes). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Salvar arquivo.
 * - Navegador: download comum.
 * - Android: janela "Salvar como" do sistema (Storage Access Framework). O usuário
 *   escolhe o local; nenhuma permissão de armazenamento é necessária. Texto é gravado
 *   exatamente como recebido (UTF-8); bytes vão em base64 e são gravados sem alteração.
 */
export async function saveFile(
  filename: string,
  data: FileData,
  mimeType: string,
  deps: { native?: boolean; plugin?: OficioFilesPlugin } = {},
): Promise<SaveResult> {
  const native = deps.native ?? isNative();
  if (!native) {
    const blob = new Blob([typeof data === 'string' ? data : data.slice().buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { status: 'salvo', where: 'Downloads' };
  }
  const plugin = deps.plugin ?? OficioFiles;
  const res = await plugin.saveDocument(
    typeof data === 'string'
      ? { filename, content: data, mimeType }
      : { filename, content: bytesToBase64(data), mimeType, encoding: 'base64' },
  );
  if (res.cancelled) return { status: 'cancelado' };
  return { status: 'salvo', where: res.name ?? filename };
}

/** Backup em JSON (mantido para a exportação existente). */
export function saveTextFile(filename: string, content: string, deps: { native?: boolean; plugin?: OficioFilesPlugin } = {}): Promise<SaveResult> {
  return saveFile(filename, content, 'application/json', deps);
}

/**
 * Pasta (no cache do app) dos arquivos entregues ao menu de compartilhar. Auditoria pré-RC: antes, backups completos
 * e PDFs ficavam no cache para sempre, inclusive depois de "Apagar todos os dados". Não dá para apagar logo depois
 * de compartilhar (o app escolhido pode ler o arquivo mais tarde); a pasta é limpa antes do próximo
 * compartilhamento, ao abrir o app e ao apagar os dados.
 */
const SHARE_DIR = 'compartilhar';

export async function clearSharedFiles(): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await Filesystem.rmdir({ path: SHARE_DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined); // pode não existir
}

/** Android: abre o menu de compartilhar (Drive, WhatsApp, e-mail...) com o arquivo. */
export async function shareFile(filename: string, data: FileData, title: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  await clearSharedFiles();
  const path = `${SHARE_DIR}/${filename}`;
  const res = typeof data === 'string'
    ? await Filesystem.writeFile({ path, data, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true })
    : await Filesystem.writeFile({ path, data: bytesToBase64(data), directory: Directory.Cache, recursive: true });
  await Share.share({ title, files: [res.uri], dialogTitle: title });
}

export function shareTextFile(filename: string, content: string, title: string): Promise<void> {
  return shareFile(filename, content, title);
}

export function canShareFiles(): boolean {
  return isNative();
}
