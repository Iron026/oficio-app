import { useMemo, useState } from 'react';
import { CalendarDays, CircleMinus, CirclePlus, Search as SearchIcon, Tag, Undo2, User } from 'lucide-react';
import { movementKind } from '../domain/finance';
import { MIN_QUERY, searchAll } from '../domain/search';
import type { Transaction } from '../domain/types';
import { formatDateShort } from '../lib/dates';
import { useApp } from '../state/AppContext';
import { IconButton } from '../ui/Button';
import { Money } from '../ui/Money';
import { useHideValues } from '../ui/privacy';
import { Sheet } from '../ui/Sheet';
import { AppointmentActions } from './AppointmentItem';
import { ClientDetail } from './Clients';
import { TransactionFormSheet } from './forms/TransactionForm';
import { ServiceTypesSheet } from './ServiceTypesSheet';

/** Botão discreto do cabeçalho (sem sexta área na navegação). */
export function SearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Buscar" onClick={() => setOpen(true)} className="text-white hover:bg-white/15 hover:text-white">
        <SearchIcon size={22} />
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title="Buscar">
        {open && <SearchPanel />}
      </Sheet>
    </>
  );
}

const STATUS: Record<string, string> = { agendado: 'agendado', concluido: 'concluído', cancelado: 'cancelado' };

/**
 * Busca global offline (beta.3): clientes, atendimentos, tipos de serviço e lançamentos deste aparelho,
 * sem acentos nem maiúsculas. Tocar abre o registro por cima da busca; fechar volta aos resultados.
 */
function SearchPanel() {
  const { data, profession } = useApp();
  const t = profession.terms;
  const hidden = useHideValues();
  const [query, setQuery] = useState('');
  // Resultado calculado do mesmo texto exibido (sem valor adiado): num aparelho lento, um valor adiado podia
  // ficar para trás e mostrar "Nada encontrado" para um texto que tem resultados. A busca é rápida o bastante.
  const r = useMemo(() => searchAll(data, query, { hideValues: hidden }), [data, query, hidden]);
  const [client, setClient] = useState<string | null>(null);
  const [appt, setAppt] = useState<string | null>(null);
  const [tx, setTx] = useState<Transaction | null>(null);
  const [types, setTypes] = useState(false);
  const clientName = (id: string | null) => (id ? data.clients.find((c) => c.id === id)?.name : undefined);
  const short = query.trim().length < MIN_QUERY;
  const openClient = client ? data.clients.find((c) => c.id === client) : undefined;
  const openAppt = appt ? data.appointments.find((a) => a.id === appt) : undefined;

  const row = 'press-soft flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2';
  const more = (shown: number, total: number) => total > shown && <p className="px-3 py-2 text-xs text-muted">Mostrando {shown} de {total}. Digite mais para refinar.</p>;

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">Buscar no aplicativo</span>
        <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${t.clients}, ${t.services.toLowerCase()}, lançamentos…`}
          className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </label>
      <p className="sr-only" aria-live="polite">{short ? '' : r.total ? `${r.total} ${r.total === 1 ? 'resultado' : 'resultados'}` : 'Nenhum resultado'}</p>
      {short ? (
        <p className="text-sm text-muted">Digite pelo menos {MIN_QUERY} letras. A busca funciona sem internet e procura só neste aparelho{hidden ? '; com “Ocultar valores”, valores não são pesquisados' : ''}.</p>
      ) : r.total === 0 ? (
        <div className="rounded-2xl bg-surface-2 p-4 text-sm" data-search-empty>
          <p className="font-semibold">Nada encontrado para “{query.trim()}”.</p>
          <p className="mt-1 text-muted">Confira a grafia ou tente uma parte do nome, do serviço ou da descrição.{hidden ? ' Valores não são pesquisados enquanto “Ocultar valores” estiver ligado.' : ''}</p>
        </div>
      ) : (
        <>
          {r.clients.total > 0 && (
            <section aria-labelledby="sr-cli">
              <h3 id="sr-cli" className="mb-1.5 font-sans text-xs font-bold uppercase tracking-wider text-muted">{t.clients} ({r.clients.total})</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {r.clients.items.map((c) => (
                  <li key={c.id}><button type="button" className={row} onClick={() => setClient(c.id)}>
                    <User size={18} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.name}</span>{c.phone && <span className="num block text-xs text-muted">{c.phone}</span>}</span>
                  </button></li>
                ))}
              </ul>
              {more(r.clients.items.length, r.clients.total)}
            </section>
          )}
          {r.appointments.total > 0 && (
            <section aria-labelledby="sr-apt">
              <h3 id="sr-apt" className="mb-1.5 font-sans text-xs font-bold uppercase tracking-wider text-muted">{t.services} ({r.appointments.total})</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {r.appointments.items.map((a) => (
                  <li key={a.id}><button type="button" className={row} onClick={() => setAppt(a.id)}>
                    <CalendarDays size={18} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={a.status === 'cancelado' ? 'block truncate font-semibold text-muted line-through' : 'block truncate font-semibold'}>{a.title}</span>
                      <span className="block truncate text-xs text-muted">{formatDateShort(a.date)}{a.time ? ` · ${a.time}` : ''} · {STATUS[a.status]}{clientName(a.clientId) ? ` · ${clientName(a.clientId)}` : ''}</span>
                    </span>
                  </button></li>
                ))}
              </ul>
              {more(r.appointments.items.length, r.appointments.total)}
            </section>
          )}
          {r.serviceTypes.total > 0 && (
            <section aria-labelledby="sr-typ">
              <h3 id="sr-typ" className="mb-1.5 font-sans text-xs font-bold uppercase tracking-wider text-muted">Tipos de serviço ({r.serviceTypes.total})</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {r.serviceTypes.items.map((s) => (
                  <li key={s.id}><button type="button" className={row} onClick={() => setTypes(true)}>
                    <Tag size={18} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                    {s.price ? <Money cents={s.price} className="text-sm text-muted" /> : null}
                  </button></li>
                ))}
              </ul>
              {more(r.serviceTypes.items.length, r.serviceTypes.total)}
            </section>
          )}
          {r.transactions.total > 0 && (
            <section aria-labelledby="sr-tx">
              <h3 id="sr-tx" className="mb-1.5 font-sans text-xs font-bold uppercase tracking-wider text-muted">Lançamentos ({r.transactions.total})</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {r.transactions.items.map((x) => {
                  const kind = movementKind(x);
                  return (
                    <li key={x.id}><button type="button" className={row} onClick={() => setTx(x)}>
                      {kind === 'receita' ? <CirclePlus size={18} className="shrink-0 text-income" aria-hidden="true" /> : kind === 'estorno' ? <Undo2 size={18} className="shrink-0 text-muted" aria-hidden="true" /> : <CircleMinus size={18} className="shrink-0 text-expense" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{x.description.trim() || x.category}</span>
                        <span className="block truncate text-xs text-muted">{formatDateShort(x.date)} · {kind === 'estorno' ? 'Estorno' : x.category}</span>
                      </span>
                      <Money cents={x.amount} kind={kind === 'receita' ? 'income' : 'expense'} className="shrink-0 font-semibold" />
                    </button></li>
                  );
                })}
              </ul>
              {more(r.transactions.items.length, r.transactions.total)}
            </section>
          )}
        </>
      )}
      {openClient && <ClientDetail client={openClient} onClose={() => setClient(null)} />}
      {openAppt && <AppointmentActions a={openAppt} open onClose={() => setAppt(null)} />}
      <TransactionFormSheet open={!!tx} transaction={tx ?? undefined} onClose={() => setTx(null)} />
      <ServiceTypesSheet open={types} onClose={() => setTypes(false)} />
    </div>
  );
}
