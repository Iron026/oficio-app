/**
 * Busca global (0.5.0-beta.3). Índice em memória sobre os dados deste aparelho e desta conta — nada sai do
 * aparelho, funciona offline e não usa serviço externo. Ignora acentos e maiúsculas; cada palavra digitada
 * precisa aparecer em algum campo do registro. Com "Ocultar valores", nunca encontra registros pelo valor.
 */
import { centsToInput } from '../lib/money';
import type { AppData, Appointment, Client, ServiceType, Transaction } from './types';

export const normalizeSearch = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const SEARCH_LIMIT = 20;
export const MIN_QUERY = 2;

export interface SearchGroup<T> { items: T[]; total: number }
export interface SearchResults {
  clients: SearchGroup<Client>;
  appointments: SearchGroup<Appointment>;
  serviceTypes: SearchGroup<ServiceType>;
  transactions: SearchGroup<Transaction>;
  total: number;
}

const brDate = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
const money = (cents: number) => `${centsToInput(cents)} ${String(Math.round(cents / 100))}`;

function matcher(query: string) {
  const tokens = normalizeSearch(query).split(' ').filter(Boolean);
  return (...fields: (string | null | undefined)[]) => {
    const hay = normalizeSearch(fields.filter(Boolean).join(' \u0001 '));
    return tokens.every((t) => hay.includes(t));
  };
}

function group<T>(all: T[], limit: number): SearchGroup<T> {
  return { items: all.slice(0, limit), total: all.length };
}

export function searchAll(data: Pick<AppData, 'clients' | 'appointments' | 'serviceTypes' | 'transactions'>, query: string, opts: { hideValues: boolean; limit?: number } = { hideValues: false }): SearchResults {
  const limit = opts.limit ?? SEARCH_LIMIT;
  const empty = { items: [], total: 0 };
  if (normalizeSearch(query).length < MIN_QUERY) return { clients: empty, appointments: empty, serviceTypes: empty, transactions: empty, total: 0 };
  const match = matcher(query);
  const v = (cents: number) => (opts.hideValues ? '' : money(cents));
  const clientName = new Map(data.clients.map((c) => [c.id, c.name]));
  const digits = query.replace(/\D/g, '');

  const clients = data.clients
    .filter((c) => match(c.name, c.email, c.address, c.notes) || (digits.length >= 4 && c.phone.replace(/\D/g, '').includes(digits)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const appointments = data.appointments
    .filter((a) => match(a.title, a.notes, a.clientId ? clientName.get(a.clientId) : '', brDate(a.date), v(a.price)))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const serviceTypes = data.serviceTypes
    .filter((s) => match(s.name, s.price ? v(s.price) : ''))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const transactions = data.transactions
    .filter((t) => match(t.description, t.category, brDate(t.date), v(t.amount)))
    .sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  return {
    clients: group(clients, limit), appointments: group(appointments, limit), serviceTypes: group(serviceTypes, limit), transactions: group(transactions, limit),
    total: clients.length + appointments.length + serviceTypes.length + transactions.length,
  };
}
