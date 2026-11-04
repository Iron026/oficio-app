import { isValidProfileImage, isValidSealAward } from '../domain/profileImage';
import { MAX_SERVICE_TYPES, isValidServiceType, uniqueById } from '../domain/serviceTypes';
import { isProfessionId } from '../domain/professions';
import { DEFAULT_SETTINGS, type AppData } from '../domain/types';

export const BACKUP_FORMAT = 'oficio-backup';
export const BACKUP_VERSION = 1;

/**
 * Versão do app que gerou o arquivo (informativa: mostrada antes de restaurar). Versões antigas do
 * Ofício ignoram campos que não conhecem, então o formato continua sendo o 1.
 */
export function serializeBackup(data: AppData, now = new Date(), appVersion: string = __APP_VERSION__): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion, exportedAt: now.toISOString(), data }, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arrOf = (v: unknown, required: string[]): boolean =>
  Array.isArray(v) && v.every((item) => isObj(item) && required.every((k) => k in item) && typeof item.id === 'string');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 100_000_000_000; // folga sobre o limite do app (R$ 1 milhão por registro)
const cents = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= MAX_CENTS;

/**
 * Integridade dos campos que entram nos totais (valores, datas, tipo e situação). Um arquivo
 * editado à mão ou corrompido é recusado antes de qualquer alteração — nada é restaurado pela metade.
 * Os campos conferidos sempre existiram no formato 1 (0.2 em diante), então backups reais passam.
 */
function checkIntegrity(d: Record<string, unknown>) {
  const bad = (key: string, i: number, field: string) => new Error(`Dados inválidos em "${key}" (item ${i + 1}: ${field}).`);
  (d.appointments as Record<string, unknown>[]).forEach((a, i) => {
    if (typeof a.title !== 'string') throw bad('appointments', i, 'descrição');
    if (typeof a.date !== 'string' || !DATE_RE.test(a.date)) throw bad('appointments', i, 'data');
    if (!['agendado', 'concluido', 'cancelado'].includes(a.status as string)) throw bad('appointments', i, 'situação');
    if (!cents(a.price, 0)) throw bad('appointments', i, 'valor');
  });
  (d.transactions as Record<string, unknown>[]).forEach((t, i) => {
    if (t.type !== 'receita' && t.type !== 'despesa') throw bad('transactions', i, 'tipo');
    if (!cents(t.amount, 0)) throw bad('transactions', i, 'valor');
    if (typeof t.date !== 'string' || !DATE_RE.test(t.date)) throw bad('transactions', i, 'data');
    if (t.category !== undefined && typeof t.category !== 'string') throw bad('transactions', i, 'categoria');
    if (t.description !== undefined && typeof t.description !== 'string') throw bad('transactions', i, 'descrição');
  });
  (d.clients as Record<string, unknown>[]).forEach((c, i) => {
    if (typeof c.name !== 'string') throw bad('clients', i, 'nome');
  });
  (d.xpEvents as Record<string, unknown>[]).forEach((e, i) => {
    if (typeof e.key !== 'string' || typeof e.xp !== 'number' || !Number.isFinite(e.xp)) throw bad('xpEvents', i, 'XP');
  });
}

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
  checkIntegrity(d);
  return {
    profile: profile as AppData['profile'],
    settings: { ...DEFAULT_SETTINGS, ...(isObj(d.settings) ? d.settings : {}) },
    clients: d.clients as AppData['clients'],
    appointments: d.appointments as AppData['appointments'],
    transactions: d.transactions as AppData['transactions'],
    xpEvents: d.xpEvents as AppData['xpEvents'],
    achievements: d.achievements as AppData['achievements'],
    // 0.4 (opcionais: backups antigos não têm). Itens inválidos são descartados.
    sealAwards: Array.isArray(d.sealAwards) ? d.sealAwards.filter(isValidSealAward) : [],
    profileImages: Array.isArray(d.profileImages) ? d.profileImages.filter(isValidProfileImage).slice(0, 1) : [],
    // Rodada 3 (opcional): tipos de serviço; inválidos e repetidos são descartados.
    serviceTypes: Array.isArray(d.serviceTypes) ? uniqueById(d.serviceTypes.filter(isValidServiceType)).slice(0, MAX_SERVICE_TYPES) : [],
  };
}
