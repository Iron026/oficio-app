import { backupChecksum, CHECKSUM_ALGORITHM } from '../storage/backup';

/**
 * Testes que montam um backup "de outro aparelho" editando um arquivo exportado: a soma de verificação (beta.5)
 * precisa ser recalculada, como faria o app que gerou o arquivo. `unsigned` simula um arquivo anterior à beta.5.
 */
export function signed(file: Record<string, unknown> | string): string {
  const o = typeof file === 'string' ? (JSON.parse(file) as Record<string, unknown>) : { ...file };
  delete o.checksum;
  return JSON.stringify({ ...o, checksum: { algorithm: CHECKSUM_ALGORITHM, value: backupChecksum(o) } });
}

export function unsigned(file: Record<string, unknown> | string): string {
  const o = typeof file === 'string' ? (JSON.parse(file) as Record<string, unknown>) : { ...file };
  delete o.checksum;
  return JSON.stringify(o);
}
