/**
 * Pré-visualização da restauração (beta.5): o que o arquivo tem, o que há agora e o que se perde. Funções puras.
 */
import { compareVersions } from './compat';
import { isPayment, isRefund } from './paymentMarks';
import type { AppData } from './types';

export interface BackupCounts {
  clients: number;
  appointments: number;
  transactions: number;
  /** Pagamentos registrados (receitas vinculadas a um atendimento, com marcador da 0.5). */
  payments: number;
  refunds: number;
  xpEvents: number;
  /** XP total dos eventos. */
  xp: number;
  achievements: number;
  sealAwards: number;
  serviceTypes: number;
}

export function backupCounts(d: Pick<AppData, 'clients' | 'appointments' | 'transactions' | 'xpEvents' | 'achievements' | 'sealAwards' | 'serviceTypes'>): BackupCounts {
  return {
    clients: d.clients.length,
    appointments: d.appointments.length,
    transactions: d.transactions.length,
    payments: d.transactions.filter(isPayment).length,
    refunds: d.transactions.filter(isRefund).length,
    xpEvents: d.xpEvents.length,
    xp: d.xpEvents.reduce((s, e) => s + (Number.isFinite(e.xp) ? e.xp : 0), 0),
    achievements: d.achievements.length,
    sealAwards: d.sealAwards.length,
    serviceTypes: d.serviceTypes.length,
  };
}

export type BackupCompatibility = 'mesma' | 'anterior' | 'mais-nova' | 'desconhecida';

/** Compatibilidade pela versão do app que gerou o arquivo (antes da 0.4.0-beta.3 não era gravada). */
export function backupCompatibility(fileVersion: string | null, appVersion: string): BackupCompatibility {
  if (!fileVersion) return 'desconhecida';
  const c = compareVersions(fileVersion, appVersion);
  if (c === null) return 'desconhecida';
  return c === 0 ? 'mesma' : c < 0 ? 'anterior' : 'mais-nova';
}

export interface BackupLoss {
  /** Registros atuais que não existem no arquivo: saem ao restaurar. */
  removed: { clients: number; appointments: number; transactions: number; payments: number; refunds: number };
  /** Registros atuais criados ou alterados depois da data do arquivo (a versão de agora se perde). */
  newerThanFile: number;
}

type Rec = { id: string; updatedAt?: string; createdAt?: string };

export function backupLoss(current: Pick<AppData, 'clients' | 'appointments' | 'transactions'>, file: Pick<AppData, 'clients' | 'appointments' | 'transactions'>, exportedAt: string | null): BackupLoss {
  const missing = <T extends Rec>(cur: readonly T[], f: readonly Rec[]) => {
    const ids = new Set(f.map((x) => x.id));
    return cur.filter((x) => !ids.has(x.id));
  };
  const gone = missing(current.transactions, file.transactions);
  const removed = {
    clients: missing(current.clients, file.clients).length,
    appointments: missing(current.appointments, file.appointments).length,
    transactions: gone.length,
    payments: gone.filter(isPayment).length,
    refunds: gone.filter(isRefund).length,
  };
  const t = exportedAt ? Date.parse(exportedAt) : NaN;
  const changed = (x: Rec) => {
    const at = Date.parse(x.updatedAt ?? x.createdAt ?? '');
    return Number.isFinite(t) && Number.isFinite(at) && at > t;
  };
  const newerThanFile = Number.isFinite(t) ? [...current.clients, ...current.appointments, ...current.transactions].filter(changed).length : 0;
  return { removed, newerThanFile };
}
