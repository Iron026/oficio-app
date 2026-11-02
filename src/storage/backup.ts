import { isProfessionId } from '../domain/professions';
import { DEFAULT_SETTINGS, type AppData } from '../domain/types';

export const BACKUP_FORMAT = 'oficio-backup';
export const BACKUP_VERSION = 1;

export function serializeBackup(data: AppData, now = new Date()): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), data }, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arrOf = (v: unknown, required: string[]): boolean =>
  Array.isArray(v) && v.every((item) => isObj(item) && required.every((k) => k in item) && typeof item.id === 'string');

/** Valida e converte um arquivo de backup. Lança erro com mensagem amigável se inválido. */
export function parseBackup(text: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new Error('Este arquivo não é um backup do Ofício.');
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new Error('Backup criado por uma versão mais nova do app.');
  }
  const d = raw.data;
  if (!isObj(d)) throw new Error('Backup sem dados.');
  const profile = d.profile;
  if (profile !== null && (!isObj(profile) || typeof profile.name !== 'string' || !isProfessionId(profile.professionId))) {
    throw new Error('Perfil inválido no backup.');
  }
  const checks: [keyof AppData, string[]][] = [
    ['clients', ['name']],
    ['appointments', ['title', 'date', 'status', 'price']],
    ['transactions', ['type', 'amount', 'date']],
    ['xpEvents', ['key', 'xp']],
    ['achievements', ['unlockedAt']],
  ];
  for (const [key, req] of checks) {
    if (!arrOf(d[key], req)) throw new Error(`Dados inválidos em "${key}".`);
  }
  return {
    profile: profile as AppData['profile'],
    settings: { ...DEFAULT_SETTINGS, ...(isObj(d.settings) ? d.settings : {}) },
    clients: d.clients as AppData['clients'],
    appointments: d.appointments as AppData['appointments'],
    transactions: d.transactions as AppData['transactions'],
    xpEvents: d.xpEvents as AppData['xpEvents'],
    achievements: d.achievements as AppData['achievements'],
  };
}
