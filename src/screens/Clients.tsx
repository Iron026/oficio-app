import { useMemo, useState } from 'react';
import { CalendarPlus, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import type { Client } from '../domain/types';
import { useApp, useErrorHandler } from '../state/AppContext';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { Avatar } from '../ui/Avatar';
import { DemoBadge, EmptyState } from '../ui/Misc';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { AppointmentItem, whatsappLink } from './AppointmentItem';
import { AppointmentFormSheet } from './forms/AppointmentForm';
import { ClientFormSheet } from './forms/ClientForm';
import { Fab } from './Shell';

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
  const countFor = (id: string) => data.appointments.filter((a) => a.clientId === id && a.status === 'concluido').length;
  const selectedClient = data.clients.find((c) => c.id === selected);

  return (
    <div>
      {data.clients.length > 0 && (
        <label className="relative block">
          <span className="sr-only">Buscar cliente</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
        </label>
      )}
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
          <p className="mb-2 mt-4 text-sm text-muted">{list.length} {list.length === 1 ? t.client.toLowerCase() : t.clients.toLowerCase()}</p>
          <ul className="space-y-2.5">
            {list.map((c) => {
              const n = countFor(c.id);
              return (
                <li key={c.id} className="flex items-stretch gap-1 rounded-2xl border border-line bg-surface">
                  <button type="button" onClick={() => setSelected(c.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface-2 active:scale-[0.99]">
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
      <Fab label="Cliente" icon={<Plus size={20} />} onClick={() => setCreating(true)} />
      <ClientFormSheet open={creating} onClose={() => setCreating(false)} />
      {selectedClient && <ClientDetail client={selectedClient} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ClientDetail({ client, onClose }: { client: Client; onClose: () => void }) {
  const { data, service, profession } = useApp();
  const t = profession.terms;
  const confirm = useConfirm();
  const toast = useToast();
  const onError = useErrorHandler();
  const [mode, setMode] = useState<'view' | 'edit' | 'schedule'>('view');
  const history = data.appointments.filter((a) => a.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date));
  const completed = history.filter((a) => a.status === 'concluido');
  const billed = completed.reduce((s, a) => s + a.price, 0);
  const wa = whatsappLink(client.phone);

  async function remove() {
    const ok = await confirm({ title: 'Excluir cliente?', message: `${client.name} será removido. O histórico de ${t.services.toLowerCase()} e o financeiro são mantidos, sem vínculo com o cliente.`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      await service.deleteClient(client.id);
      toast({ title: 'Cliente excluído', tone: 'info' });
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
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-sm text-muted">{t.services} {t.completedLabelPlural}</p><p className="num text-lg font-bold">{completed.length}</p></div>
          <div className="rounded-xl bg-surface-2 p-3"><p className="text-sm text-muted">Total faturado</p><p className="text-lg font-bold"><Money cents={billed} /></p></div>
        </div>
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
        <h3 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-muted">Histórico</h3>
        {history.length ? (
          <div className="space-y-2">{history.map((a) => <AppointmentItem key={a.id} a={a} showDate />)}</div>
        ) : (
          <p className="text-sm text-muted">Nenhum {t.service.toLowerCase()} registrado para este cliente.</p>
        )}
      </Sheet>
      <ClientFormSheet open={mode === 'edit'} client={client} onClose={() => setMode('view')} />
      <AppointmentFormSheet open={mode === 'schedule'} defaultClientId={client.id} onClose={() => setMode('view')} />
    </>
  );
}
