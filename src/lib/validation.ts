import { parseMoney } from './money';

export type Errors<T> = Partial<Record<keyof T, string>>;

export function hasErrors<T>(errors: Errors<T>): boolean {
  return Object.values(errors).some(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validatePhone(phone: string): string | undefined {
  if (!phone.trim()) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return 'Informe DDD + número (10 ou 11 dígitos).';
  return undefined;
}

export interface ClientInput { name: string; phone: string; email: string; address: string; notes: string }

export function validateClient(v: ClientInput): Errors<ClientInput> {
  const e: Errors<ClientInput> = {};
  const name = v.name.trim();
  if (!name) e.name = 'Informe o nome.';
  else if (name.length < 2) e.name = 'O nome precisa de ao menos 2 letras.';
  else if (name.length > 80) e.name = 'Use no máximo 80 caracteres.';
  e.phone = validatePhone(v.phone);
  if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) e.email = 'E-mail inválido.';
  if (v.notes.length > 500) e.notes = 'Use no máximo 500 caracteres.';
  return e;
}

export interface AppointmentInput { title: string; clientId: string; date: string; time: string; price: string; notes: string }

export function validateAppointment(v: AppointmentInput): Errors<AppointmentInput> {
  const e: Errors<AppointmentInput> = {};
  if (!v.title.trim()) e.title = 'Descreva o serviço.';
  else if (v.title.trim().length > 80) e.title = 'Use no máximo 80 caracteres.';
  if (!DATE_RE.test(v.date)) e.date = 'Escolha uma data.';
  if (v.time && !TIME_RE.test(v.time)) e.time = 'Horário inválido.';
  if (v.price.trim()) {
    const cents = parseMoney(v.price);
    if (cents === null) e.price = 'Valor inválido. Ex.: 150 ou 150,00';
    else if (cents > 100_000_000) e.price = 'Valor muito alto.';
  }
  if (v.notes.length > 500) e.notes = 'Use no máximo 500 caracteres.';
  return e;
}

export interface TransactionInput { type: string; amount: string; description: string; category: string; date: string }

export function validateTransaction(v: TransactionInput): Errors<TransactionInput> {
  const e: Errors<TransactionInput> = {};
  if (v.type !== 'receita' && v.type !== 'despesa') e.type = 'Escolha receita ou despesa.';
  const cents = parseMoney(v.amount);
  if (cents === null) e.amount = 'Informe um valor válido. Ex.: 80,00';
  else if (cents <= 0) e.amount = 'O valor deve ser maior que zero.';
  else if (cents > 100_000_000) e.amount = 'Valor muito alto.';
  // Descrição é opcional (rodada 3); a categoria identifica o lançamento quando ela falta.
  if (v.description.trim().length > 80) e.description = 'Use no máximo 80 caracteres.';
  if (!v.category.trim()) e.category = 'Escolha uma categoria.';
  if (!DATE_RE.test(v.date)) e.date = 'Escolha uma data.';
  return e;
}

export interface ProfileInput { name: string; businessName: string }

export function validateProfile(v: ProfileInput): Errors<ProfileInput> {
  const e: Errors<ProfileInput> = {};
  const name = v.name.trim();
  if (!name) e.name = 'Como podemos te chamar?';
  else if (name.length > 60) e.name = 'Use no máximo 60 caracteres.';
  if (v.businessName.trim().length > 60) e.businessName = 'Use no máximo 60 caracteres.';
  return e;
}
