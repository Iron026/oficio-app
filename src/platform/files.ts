import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

/** Resultado de salvar um arquivo: salvo (com o local) ou cancelado pelo usuário. */
export type SaveResult = { status: 'salvo'; where: string } | { status: 'cancelado' };

/** Plugin nativo do app (android/.../BackupFilePlugin.java). */
export interface OficioFilesPlugin {
  saveDocument(options: { filename: string; content: string; mimeType: string }): Promise<{ cancelled: boolean; uri?: string; name?: string | null; bytes?: number }>;
}

const OficioFiles = registerPlugin<OficioFilesPlugin>('OficioFiles');

/**
 * Salvar arquivo de texto.
 * - Navegador: download comum.
 * - Android: janela "Salvar como" do sistema (Storage Access Framework). O usuário
 *   escolhe o local; nenhuma permissão de armazenamento é necessária. O conteúdo
 *   é gravado exatamente como recebido (UTF-8).
 */
export async function saveTextFile(
  filename: string,
  content: string,
  deps: { native?: boolean; plugin?: OficioFilesPlugin } = {},
): Promise<SaveResult> {
  const native = deps.native ?? isNative();
  if (!native) {
    const blob = new Blob([content], { type: 'application/json' });
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
  const res = await plugin.saveDocument({ filename, content, mimeType: 'application/json' });
  if (res.cancelled) return { status: 'cancelado' };
  return { status: 'salvo', where: res.name ?? filename };
}

/** Android: abre o menu de compartilhar (Drive, WhatsApp, e-mail...) com o arquivo. */
export async function shareTextFile(filename: string, content: string, title: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const res = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title, files: [res.uri], dialogTitle: title });
}

export function canShareFiles(): boolean {
  return isNative();
}
