import { canonicalJson, sha256Hex } from '../lib/sha256';
import { isValidProfileImage } from '../domain/profileImage';
import { MAX_SERVICE_TYPES, isDuration, isValidServiceType } from '../domain/serviceTypes';
import { seriesOf } from '../domain/recurrence';
import { isProfessionId } from '../domain/professions';
import { DEFAULT_SETTINGS, type AppData } from '../domain/types';

export const BACKUP_FORMAT = 'oficio-backup';
export const BACKUP_VERSION = 1;
export const CHECKSUM_ALGORITHM = 'SHA-256';

/**
 * Soma de verificação (beta.5). Cobre **todo o conteúdo do arquivo, exceto o próprio campo `checksum`**: `format`,
 * `version`, `appVersion`, `exportedAt` e `data`, serializados de forma canônica (`canonicalJson`: chaves em ordem,
 * sem espaços, arrays na ordem do arquivo), codificados em UTF-8. Detecta alteração acidental e corrupção; não prova
 * quem criou o arquivo (qualquer pessoa pode recalcular a soma de um arquivo editado).
 */
export function backupChecksum(file: Record<string, unknown>): string {
  const rest: Record<string, unknown> = { ...file };
  delete rest.checksum;
  return sha256Hex(canonicalJson(rest));
}

/**
 * Versão do app que gerou o arquivo (informativa) e soma de verificação. Versões antigas do Ofício ignoram campos
 * que não conhecem, então o formato continua sendo o 1.
 */
export function serializeBackup(data: AppData, now = new Date(), appVersion: string = __APP_VERSION__): string {
  const body = { format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion, exportedAt: now.toISOString(), data };
  // Ida e volta pelo JSON: a soma é calculada sobre exatamente o que vai para o arquivo.
  const plain = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  return JSON.stringify({ ...plain, checksum: { algorithm: CHECKSUM_ALGORITHM, value: backupChecksum(plain) } }, null, 2);
}

export type BackupErrorKind = 'json' | 'formato' | 'versao' | 'integridade' | 'estrutura';

/** Arquivo recusado. `kind` separa as causas para a tela ("sem soma" não é erro; "soma inválida" é). */
export class BackupError extends Error {
  constructor(public readonly kind: BackupErrorKind, message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

/** Resultado da verificação de integridade: com soma conferida, ou arquivo antigo sem soma (validação estrutural). */
export type BackupIntegrity = 'verificada' | 'sem-soma';

export interface BackupInspection {
  data: AppData;
  integrity: BackupIntegrity;
  exportedAt: string | null;
  appVersion: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const LABEL: Record<string, string> = { clients: 'clientes', appointments: 'atendimentos', transactions: 'lançamentos', xpEvents: 'XP', achievements: 'conquistas' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 100_000_000_000; // folga sobre o limite do app (R$ 1 milhão por registro)
const cents = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= MAX_CENTS;
const optStr = (v: unknown) => v === undefined || v === null || typeof v === 'string';

/**
 * Estrutura de cada coleção: lista de objetos com id em texto (1 a 128 caracteres), sem ids repetidos, com os
 * campos obrigatórios. Ids repetidos tornariam a restauração ambígua (qual registro vale?) e nunca existem num
 * backup real (o armazenamento é indexado pelo id).
 */
function checkCollection(d: Record<string, unknown>, key: string, required: string[]) {
  const list = d[key];
  if (!Array.isArray(list)) throw new BackupError('estrutura', `Dados inválidos em "${key}" (${LABEL[key] ?? key}): a lista está ausente.`);
  const seen = new Set<string>();
  list.forEach((item, i) => {
    if (!isObj(item) || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 128 || !required.every((k) => k in item)) {
      throw new BackupError('estrutura', `Dados inválidos em "${key}" (item ${i + 1}: registro incompleto).`);
    }
    if (seen.has(item.id)) throw new BackupError('estrutura', `Registros repetidos em "${key}" (${LABEL[key] ?? key}): o id do item ${i + 1} aparece mais de uma vez.`);
    seen.add(item.id);
  });
}

/**
 * Marcador de pagamento/estorno (`transaction.payment`, 0.5). Auditoria pré-RC: um estorno sem referência ao
 * pagamento reduzia o saldo sem aparecer na revisão de estornos, e marcadores com tipos errados mudavam a leitura
 * dos totais. Devolve o campo com problema, ou null.
 */
function paymentMarkError(t: Record<string, unknown>): string | null {
  const m = t.payment;
  if (m === undefined || m === null) return null;
  if (!isObj(m)) return 'pagamento';
  if (m.kind === 'pagamento') {
    if (t.type !== 'receita') return 'pagamento lançado como despesa';
    if (!optStr(m.method)) return 'pagamento: forma de pagamento';
  } else if (m.kind === 'estorno') {
    if (t.type !== 'despesa') return 'estorno lançado como receita';
    if (typeof m.of !== 'string' || !m.of) return 'estorno sem o pagamento de origem';
  } else if (m.kind === undefined && t.type === 'receita') {
    // Contrato da 0.4.0-beta.4 (COMPATIBILIDADE-0.5.md): qualquer marcador numa receita vinculada = pagamento.
    if (!optStr(m.method)) return 'pagamento: forma de pagamento';
  } else {
    return 'pagamento: tipo de marcador desconhecido';
  }
  if (!optStr(m.key)) return 'pagamento: chave';
  if (m.review !== undefined && m.review !== null && !(isObj(m.review) && typeof m.review.ack === 'string' && typeof m.review.at === 'string')) return 'pagamento: revisão';
  return null;
}

/**
 * Regra de recorrência (0.5.0-beta.3) estruturalmente completa. Auditoria pré-RC: uma regra inválida era aceita e a
 * série deixava de existir em silêncio (o gerador a ignora). Campos extras de versões futuras são aceitos.
 */
function isValidSeries(v: unknown): boolean {
  if (!isObj(v) || seriesOf({ series: v }) === null) return false;
  const intOrNull = (x: unknown) => x === undefined || x === null || (Number.isInteger(x) && (x as number) >= 1);
  if (!intOrNull(v.interval) || !intOrNull(v.count)) return false;
  if (v.days !== undefined && v.days !== null && !(Array.isArray(v.days) && v.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) return false;
  if (v.until !== undefined && v.until !== null && !(typeof v.until === 'string' && DATE_RE.test(v.until))) return false;
  return true;
}

/** Selo estruturalmente válido; id desconhecido (selo de versão mais nova) é preservado. */
function isSealShape(v: unknown): boolean {
  return isObj(v) && typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 40
    && Number.isInteger(v.stage) && (v.stage as number) >= 1 && (v.stage as number) <= 4
    && Array.isArray(v.reachedAt) && v.reachedAt.length <= 4 && v.reachedAt.every((d) => d === null || typeof d === 'string')
    && typeof v.createdAt === 'string' && typeof v.updatedAt === 'string';
}

/** Tipo de serviço: campos conhecidos válidos; campos extras de versões futuras são preservados. */
function isServiceTypeShape(v: unknown): boolean {
  if (!isObj(v)) return false;
  const known: Record<string, unknown> = {};
  for (const k of ['id', 'name', 'price', 'pinned', 'order', 'duration', 'createdAt', 'updatedAt']) if (k in v) known[k] = v[k];
  return isValidServiceType(known);
}

/**
 * Coleções opcionais da 0.4 (ausentes em backups antigos). Auditoria pré-RC: antes, itens inválidos, repetidos ou
 * além do limite eram descartados em silêncio; agora o arquivo inteiro é recusado.
 */
function checkOptionalCollection(d: Record<string, unknown>, key: string, label: string, valid: (v: unknown) => boolean, max: number) {
  const list = d[key];
  if (list === undefined) return;
  if (!Array.isArray(list)) throw new BackupError('estrutura', `Dados inválidos em "${key}" (${label}): não é uma lista.`);
  if (list.length > max) throw new BackupError('estrutura', `Dados inválidos em "${key}" (${label}): ${list.length} itens, acima do limite de ${max}. Nada foi restaurado.`);
  const seen = new Set<string>();
  list.forEach((item, i) => {
    if (!valid(item)) throw new BackupError('estrutura', `Dados inválidos em "${key}" (${label}, item ${i + 1}).`);
    const id = (item as { id: string }).id;
    if (seen.has(id)) throw new BackupError('estrutura', `Registros repetidos em "${key}" (${label}): o id do item ${i + 1} aparece mais de uma vez.`);
    seen.add(id);
  });
}

/**
 * Integridade dos campos que entram nos totais (valores, datas, tipo e situação). Um arquivo editado à mão ou
 * corrompido é recusado antes de qualquer alteração — nada é restaurado pela metade. Campos da 0.5 são opcionais,
 * mas, se existirem, precisam ter o tipo esperado: um arquivo de versão mais nova não é aceito só por ter o formato 1.
 */
function checkIntegrity(d: Record<string, unknown>) {
  const bad = (key: string, i: number, field: string) => new BackupError('estrutura', `Dados inválidos em "${key}" (item ${i + 1}: ${field}).`);
  (d.appointments as Record<string, unknown>[]).forEach((a, i) => {
    if (typeof a.title !== 'string') throw bad('appointments', i, 'descrição');
    // Auditoria pré-RC: campos que todas as versões gravaram como texto; ausentes, derrubavam telas.
    if (typeof a.notes !== 'string') throw bad('appointments', i, 'observações');
    if (a.completedAt !== undefined && a.completedAt !== null && typeof a.completedAt !== 'string') throw bad('appointments', i, 'conclusão');
    if (a.transactionId !== undefined && a.transactionId !== null && typeof a.transactionId !== 'string') throw bad('appointments', i, 'receita vinculada');
    if (typeof a.date !== 'string' || !DATE_RE.test(a.date)) throw bad('appointments', i, 'data');
    if (!['agendado', 'concluido', 'cancelado'].includes(a.status as string)) throw bad('appointments', i, 'situação');
    if (!cents(a.price, 0)) throw bad('appointments', i, 'valor');
    if (!optStr(a.time)) throw bad('appointments', i, 'horário');
    if (!optStr(a.clientId)) throw bad('appointments', i, 'cliente');
    if (a.duration !== undefined && !isDuration(a.duration)) throw bad('appointments', i, 'duração');
    if (a.series !== undefined && a.series !== null && !isValidSeries(a.series)) throw bad('appointments', i, 'recorrência');
    if (a.payments !== undefined && typeof a.payments !== 'boolean') throw bad('appointments', i, 'controle de pagamento');
  });
  (d.transactions as Record<string, unknown>[]).forEach((t, i) => {
    if (t.type !== 'receita' && t.type !== 'despesa') throw bad('transactions', i, 'tipo');
    if (!cents(t.amount, 0)) throw bad('transactions', i, 'valor');
    if (typeof t.date !== 'string' || !DATE_RE.test(t.date)) throw bad('transactions', i, 'data');
    // Auditoria pré-RC: categoria e descrição existem desde a v0.1; sem elas, Finanças e Relatórios quebravam.
    if (typeof t.category !== 'string') throw bad('transactions', i, 'categoria');
    if (typeof t.description !== 'string') throw bad('transactions', i, 'descrição');
    if (!optStr(t.appointmentId)) throw bad('transactions', i, 'serviço vinculado');
    const markErr = paymentMarkError(t);
    if (markErr) throw bad('transactions', i, markErr);
    if (t.reviews !== undefined && !(Array.isArray(t.reviews) && t.reviews.every(isObj))) throw bad('transactions', i, 'trilha de revisões');
  });
  (d.clients as Record<string, unknown>[]).forEach((c, i) => {
    if (typeof c.name !== 'string') throw bad('clients', i, 'nome');
    // Auditoria pré-RC: sem telefone (ou com número), Painel, Agenda e Clientes quebravam.
    for (const [k, label] of [['phone', 'telefone'], ['email', 'e-mail'], ['address', 'endereço'], ['notes', 'observações']] as const) {
      if (typeof c[k] !== 'string') throw bad('clients', i, label);
    }
  });
  (d.xpEvents as Record<string, unknown>[]).forEach((e, i) => {
    if (typeof e.key !== 'string' || typeof e.xp !== 'number' || !Number.isFinite(e.xp)) throw bad('xpEvents', i, 'XP');
  });
  (d.achievements as Record<string, unknown>[]).forEach((a, i) => {
    if (typeof a.unlockedAt !== 'string') throw bad('achievements', i, 'data da conquista');
  });
}

/**
 * Lê, verifica e valida um arquivo de backup sem alterar nada. Ordem: JSON → formato → versão → soma de
 * verificação (se houver) → estrutura. Qualquer falha lança `BackupError` com mensagem para a pessoa.
 */
export function inspectBackup(text: string): BackupInspection {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('json', 'O arquivo não é um JSON válido: está incompleto ou corrompido.');
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError('formato', 'Este arquivo não é um backup do Ofício.');
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new BackupError('versao', 'Backup criado por uma versão mais nova do app, num formato que esta versão não lê.');
  }

  let integrity: BackupIntegrity = 'sem-soma';
  if ('checksum' in raw) {
    const c = raw.checksum;
    const ok = isObj(c) && c.algorithm === CHECKSUM_ALGORITHM && typeof c.value === 'string' && /^[0-9a-f]{64}$/.test(c.value) && c.value === backupChecksum(raw);
    if (!ok) throw new BackupError('integridade', 'A verificação de integridade falhou: o conteúdo do arquivo foi alterado ou está corrompido. Nada foi restaurado.');
    integrity = 'verificada';
  }

  const d = raw.data;
  if (!isObj(d)) throw new BackupError('estrutura', 'Backup sem dados.');
  const profile = d.profile;
  const goal = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (profile !== null && (!isObj(profile) || typeof profile.name !== 'string' || !isProfessionId(profile.professionId) || !optStr(profile.businessName)
    || !goal(profile.weeklyGoalServices) || !goal(profile.monthlyGoalRevenue))) {
    throw new BackupError('estrutura', 'Perfil inválido no backup.');
  }
  if (d.settings !== undefined && !isObj(d.settings)) throw new BackupError('estrutura', 'Preferências inválidas no backup.');
  const checks: [string, string[]][] = [
    ['clients', ['name']],
    ['appointments', ['title', 'date', 'status', 'price']],
    ['transactions', ['type', 'amount', 'date']],
    ['xpEvents', ['key', 'xp']],
    ['achievements', ['unlockedAt']],
  ];
  for (const [key, req] of checks) checkCollection(d, key, req);
  checkIntegrity(d);
  checkOptionalCollection(d, 'sealAwards', 'selos', isSealShape, 64);
  checkOptionalCollection(d, 'profileImages', 'foto de perfil', isValidProfileImage, 1);
  checkOptionalCollection(d, 'serviceTypes', 'tipos de serviço', isServiceTypeShape, MAX_SERVICE_TYPES);

  const exportedAt = typeof raw.exportedAt === 'string' && !Number.isNaN(Date.parse(raw.exportedAt)) ? raw.exportedAt : null;
  // Só informativo; arquivos anteriores à 0.4.0-beta.3 não têm.
  const appVersion = typeof raw.appVersion === 'string' && /^\d+\.\d+\.\d+[\w.-]*$/.test(raw.appVersion) && raw.appVersion.length <= 32 ? raw.appVersion : null;
  const data: AppData = {
    profile: profile as AppData['profile'],
    // Preferências da conta (inclusive o Painel e campos de versões futuras) vêm inteiras.
    settings: { ...DEFAULT_SETTINGS, ...(isObj(d.settings) ? d.settings : {}) },
    clients: d.clients as AppData['clients'],
    appointments: d.appointments as AppData['appointments'],
    transactions: d.transactions as AppData['transactions'],
    xpEvents: d.xpEvents as AppData['xpEvents'],
    achievements: d.achievements as AppData['achievements'],
    // 0.4 (opcionais: backups antigos não têm), já conferidos por inteiro acima.
    sealAwards: (d.sealAwards ?? []) as AppData['sealAwards'],
    profileImages: (d.profileImages ?? []) as AppData['profileImages'],
    serviceTypes: (d.serviceTypes ?? []) as AppData['serviceTypes'],
  };
  return { data, integrity, exportedAt, appVersion };
}

/** Valida e converte um arquivo de backup. Lança `BackupError` com mensagem amigável se inválido. */
export function parseBackup(text: string): AppData {
  return inspectBackup(text).data;
}
