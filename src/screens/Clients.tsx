import { useDeferredValue, useMemo, useState } from 'react';
import { completedCountByClient } from '../domain/insights';
import { CalendarDays, CalendarPlus, CirclePlus, Mail, Undo2, MapPin, MessageCircle, Pencil, Phone, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import type { Client, Transaction } from '../domain/types';
import { clientHistory, MONEY_LABEL } from '../domain/clientHistory';
import { formatDateShort, todayKey } from '../lib/dates';
import { PaymentBadge } from './payments/PaymentSheets';
import { TransactionFormSheet } from './forms/TransactionForm';
import { useApp, useErrorHandler, useUndoAction } from '../state/AppContext';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { Avatar } from '../ui/Avatar';
import { DemoBadge, EmptyState } from '../ui/Misc';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { AppointmentActions, AppointmentItem, whatsappLink } from './AppointmentItem';
import { AppointmentFormSheet } from './forms/AppointmentForm';
import { ClientFormSheet } from './forms/ClientForm';
import { Fab, HeroSlot } from './Shell';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Clients() {
  const { data, profession } = useApp();
  const t = profession.terms;
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = normalize(query.trim());
    return [...data.clients]
      .filter((c) => !q || normalize(c.name).includes(q) || c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000'))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [data.clients, query]);

  const wa = whatsappLink;
  // Listas grandes: os primeiros cartões aparecem na hora e o restante é montado em segundo
  // plano (renderização interrompível do React), sem travar a troca de tela.
  const shown = useDeferredValue(list, list.slice(0, 24));
  const completedBy = useMemo(() => completedCountByClient(data.appointments), [data.appointments]);
  const countFor = (id: string) => completedBy.get(id) ?? 0;
  const selectedClient = data.clients.find((c) => c.id === selected);

  return (
    <div>
      <HeroSlot>
        <p className="pt-1 text-sm text-on-hero-soft">{data.clients.length} {data.clients.length === 1 ? t.client.toLowerCase() : t.clients.toLowerCase()} na carteira</p>
        {data.clients.length > 0 && (
          <label className="relative mt-3 block">
            <span className="sr-only">Buscar cliente</span>
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-hero-soft" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="h-12 w-full rounded-xl border border-white/30 bg-on-hero-fill pl-10 pr-3 text-base text-white placeholder:text-on-hero-soft focus:border-white focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </label>
        )}
      </HeroSlot>
      {data.clients.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={28} />}
          title="Sua carteira de clientes começa aqui"
          text="Guarde contatos, preferências e o histórico de cada cliente."
          action={<Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>Cadastrar cliente</Button>}
        />
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-muted">Nenhum cliente encontrado.</p>
      ) : (
        <>
          {query.trim() && <p className="mb-2 mt-4 text-sm text-muted" aria-live="polite">{list.length} {list.length === 1 ? 'resultado' : 'resultados'} para “{query.trim()}”</p>}
          <ul className="enter-stagger grid gap-[var(--gap-list)]">
            {shown.map((c) => {
              const n = countFor(c.id);
              return (
                <li key={c.id} className="flex items-stretch gap-1 rounded-2xl border border-line bg-surface shadow-sm">
                  <button type="button" onClick={() => setSelected(c.id)} className="press-soft flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left hover:bg-surface-2">
                    <Avatar name={c.name} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-3 font-display font-semibold leading-snug [overflow-wrap:anywhere]">{c.name}</span>
                      <span className="num text-sm text-muted">{c.phone || 'Sem telefone'}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                        {n} {n === 1 ? t.service.toLowerCase() : t.services.toLowerCase()} {n === 1 ? t.completedLabel : t.completedLabelPlural}
                        {c.isDemo && <DemoBadge />}
                      </span>
                    </span>
                  </button>
                  {wa(c.phone) && (
                    <a
                      href={wa(c.phone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp de ${c.name}`}
                      title="WhatsApp"
                      className="my-auto mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-green-700 transition-colors hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-500/10"
                    >
                      <MessageCircle size={22} aria-hidden="true" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {/* Sem clientes, o estado vazio já oferece "Cadastrar cliente". */}
      {data.clients.length > 0 && <Fab label="Cliente" icon={<Plus size={20} />} onClick={() => setCreating(true)} />}
      <ClientFormSheet open={creating} onClose={() => setCreating(false)} />
      {selectedClient && <ClientDetail client={selectedClient} onClose={() => setSelected(null)} />}
    </div>
  );
}

export function ClientDetail({ client, onClose }: { client: Client; onClose: () => void }) {
  const { data, service, profession } = useApp();
  const t = profession.terms;
  const confirm = useConfirm();
  const toast = useToast();
  const undoAction = useUndoAction();
  const onError = useErrorHandler();
  const [mode, setMode] = useState<'view' | 'edit' | 'schedule'>('view');
  // beta.3: histórico derivado dos agendamentos e dos lançamentos reais (fonte única dos valores).
  const h = useMemo(() => clientHistory(client.id, data.appointments, data.transactions, todayKey()), [client.id, data.appointments, data.transactions]);
  const [openAppt, setOpenAppt] = useState<string | null>(null);
  const [openTx, setOpenTx] = useState<Transaction | null>(null);
  const apptOpen = openAppt ? data.appointments.find((a) => a.id === openAppt) : undefined;
  const wa = whatsappLink(client.phone);

  async function remove() {
    const ok = await confirm({ title: 'Excluir cliente?', message: `${client.name} será removido. O histórico de ${t.services.toLowerCase()} e o financeiro são mantidos, sem vínculo com o cliente. Logo depois, dá para desfazer pelo aviso.`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      const ticket = await service.deleteClient(client.id);
      toast({ title: 'Cliente excluído', description: client.name, tone: 'info', action: undoAction(ticket) });
      onClose();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <>
      <Sheet open={mode === 'view'} onClose={onClose} title={client.name}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={client.name} size="lg" />
          <div className="min-w-0 text-sm text-muted">
            <p className="num">{client.phone || 'Sem telefone'}</p>
            {client.isDemo && <p className="mt-1"><DemoBadge /></p>}
          </div>
        </div>
        <div className="mb-4 flex gap-2">
          {client.phone && (
            <a href={`tel:${client.phone.replace(/\D/g, '')}`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-2"><Phone size={16} aria-hidden="true" /> Ligar</a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-green-700 text-sm font-semibold text-white hover:bg-green-800"><MessageCircle size={16} aria-hidden="true" /> WhatsApp</a>
          )}
        </div>
        <dl className="mb-4 grid grid-cols-2 gap-2" aria-label="Resumo do cliente" data-client-summary>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-muted">{t.services} {t.completedLabelPlural}</dt><dd className="num text-lg font-bold">{h.completedCount}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-muted">Último {t.service.toLowerCase()}</dt><dd className="text-lg font-bold">{h.lastCompleted ? formatDateShort(h.lastCompleted.date) : '—'}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-muted">Contratado</dt><dd className="text-lg font-bold"><Money cents={h.contracted} /></dd></div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-sm text-muted">Recebido</dt><dd className="text-lg font-bold"><Money cents={h.received} /></dd>
            {h.advanceOpen > 0 && <dd className="text-xs text-muted">inclui <Money cents={h.advanceOpen} /> antecipado</dd>}
          </div>
          {h.refunded > 0 && <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-muted">Estornado</dt><dd className="text-lg font-bold text-expense"><Money cents={h.refunded} /></dd></div>}
          <div className={h.pending > 0 ? 'rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10' : 'rounded-xl bg-surface-2 p-3'}><dt className="text-sm text-muted">Pendente</dt><dd className="text-lg font-bold"><Money cents={h.pending} /></dd></div>
        </dl>
        {(h.notRegistered > 0 || h.inReview > 0) && (
          <ul className="mb-4 space-y-1 text-xs text-muted">
            {h.notRegistered > 0 && <li>{h.notRegistered} {h.notRegistered === 1 ? `${t.service.toLowerCase()} ${t.completedLabel}` : `${t.services.toLowerCase()} ${t.completedLabelPlural}`} antes da 0.5 sem pagamento registrado (fora do pendente).</li>}
            {h.inReview > 0 && <li className="font-semibold text-red-700 dark:text-red-300">{h.inReview} com estornos para revisar.</li>}
          </ul>
        )}
        <ul className="mb-4 space-y-2 text-sm">
          {client.email && <li className="flex items-center gap-2"><Mail size={16} className="text-muted" aria-hidden="true" />{client.email}</li>}
          {client.address && <li className="flex items-center gap-2"><MapPin size={16} className="text-muted" aria-hidden="true" />{client.address}</li>}
          {client.notes && <li className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3">{client.notes}</li>}
        </ul>
        <div className="mb-5 grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" icon={<CalendarPlus size={16} />} onClick={() => setMode('schedule')}>Agendar</Button>
          <Button variant="secondary" size="sm" icon={<Pencil size={16} />} onClick={() => setMode('edit')}>Editar</Button>
          <Button variant="secondary" size="sm" className="text-red-700 dark:text-red-300" icon={<Trash2 size={16} />} onClick={remove}>Excluir</Button>
        </div>
        {h.upcoming.length > 0 && (
          <section aria-label="Próximos" className="mb-5">
            <h3 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-muted">Próximos</h3>
            <div className="space-y-2">{h.upcoming.map((a) => <AppointmentItem key={a.id} a={a} showDate />)}</div>
          </section>
        )}
        <h3 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-muted">Histórico</h3>
        {h.timeline.length ? (
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Histórico do cliente">
            {h.timeline.map((e) => (
              <li key={e.key}>
                {e.kind === 'atendimento' ? (
                  <button type="button" onClick={() => setOpenAppt(e.a.id)} className="press-soft flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2" data-timeline="atendimento">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><CalendarDays size={18} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={e.a.status === 'cancelado' ? 'block font-semibold text-muted line-through' : 'block font-semibold'}>{e.a.title}</span>
                      <span className="block text-xs text-muted">{formatDateShort(e.a.date)} · {e.a.status === 'concluido' ? t.completedLabel : e.a.status === 'cancelado' ? 'cancelado' : 'agendado'}</span>
                    </span>
                    <PaymentBadge a={e.a} s={e.s} />
                  </button>
                ) : (
                  <button type="button" onClick={() => setOpenTx(e.tx)} className="press-soft flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2" data-timeline={e.money}>
                    <span className={e.money === 'estorno' ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-income dark:bg-green-500/10'}>
                      {e.money === 'estorno' ? <Undo2 size={18} aria-hidden="true" /> : <CirclePlus size={18} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{MONEY_LABEL[e.money]}</span>
                      <span className="block text-xs text-muted">{formatDateShort(e.date)} · {e.a.title}</span>
                    </span>
                    <Money cents={e.tx.amount} kind={e.money === 'estorno' ? 'expense' : 'income'} className="font-semibold" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Nenhum {t.service.toLowerCase()} registrado para este cliente.</p>
        )}
      </Sheet>
      {apptOpen && <AppointmentActions a={apptOpen} open onClose={() => setOpenAppt(null)} />}
      <TransactionFormSheet open={!!openTx} transaction={openTx ?? undefined} onClose={() => setOpenTx(null)} />
      <ClientFormSheet open={mode === 'edit'} client={client} onClose={() => setMode('view')} />
      <AppointmentFormSheet open={mode === 'schedule'} defaultClientId={client.id} onClose={() => setMode('view')} />
    </>
  );
}
