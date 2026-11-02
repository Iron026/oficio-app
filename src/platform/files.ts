import { isNative } from './native';

export interface SavedFile { where: string }

/**
 * Salvar arquivo de texto.
 * - Navegador: download comum.
 * - Android: grava em Documentos/Oficio (visível no app "Meus arquivos").
 */
export async function saveTextFile(filename: string, content: string): Promise<SavedFile> {
  if (!isNative()) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { where: 'Downloads' };
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  await Filesystem.writeFile({ path: `Oficio/${filename}`, data: content, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  return { where: `Documentos/Oficio/${filename}` };
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
