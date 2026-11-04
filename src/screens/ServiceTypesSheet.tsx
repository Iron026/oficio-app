import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react';
import { serviceNameKey, sortServiceTypes } from '../domain/serviceTypes';
import type { ServiceType } from '../domain/types';
import { centsToInput, formatMoney } from '../lib/money';
import { hasErrors, validateServiceType, type Errors, type ServiceTypeInput } from '../lib/validation';
import { useApp, useErrorHandler } from '../state/AppContext';
import { ValidationError } from '../state/service';
import { sealsPhotoSyncEnabled } from '../sync/features';
import { Button, IconButton } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { cx } from '../ui/cx';
import { TextField } from '../ui/Field';
import { useHideValues } from '../ui/privacy';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const priceLabel = (price: number | null, hidden: boolean) => (price === null ? 'Sem valor sugerido' : hidden ? 'R$ •••••' : formatMoney(price));

function ServiceTypeForm({ initial, onDone }: { initial?: ServiceType; onDone: () => void }) {
  const { service } = useApp();
  const onError = useErrorHandler();
  const [v, setV] = useState<ServiceTypeInput>({ name: initial?.name ?? '', price: initial?.price ? centsToInput(initial.price) : '' });
  const [errors, setErrors] = useState<Errors<ServiceTypeInput>>({});
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // nunca envia um formulário de fora (o painel é aberto por cima do agendamento)
    const errs = validateServiceType(v);
    setErrors(errs);
    if (hasErrors(errs)) return;
    setSaving(true);
    try {
      await service.saveServiceType(v, initial?.id);
      onDone();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors as Errors<ServiceTypeInput>);
      else onError(err);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-3">
      <TextField label="Nome do serviço" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} maxLength={60} autoFocus />
      <TextField label="Valor sugerido" optional prefix="R$" inputMode="decimal" placeholder="0,00" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} error={errors.price} />
      <div className="flex gap-2">
        <Button variant="secondary" block onClick={onDone}>Cancelar</Button>
        <Button type="submit" block disabled={saving}>{initial ? 'Salvar' : 'Adicionar'}</Button>
      </div>
    </form>
  );
}

/** Gerenciar tipos de serviço: criar, editar, fixar, reordenar, excluir e buscar. */
export function ServiceTypesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, service, profession } = useApp();
  const onError = useErrorHandler();
  const confirm = useConfirm();
  const toast = useToast();
  const hidden = useHideValues();
  const [editing, setEditing] = useState<ServiceType | 'novo' | null>(null);
  const [query, setQuery] = useState('');
  const t = profession.terms;

  const types = useMemo(() => sortServiceTypes(data.serviceTypes), [data.serviceTypes]);
  const q = serviceNameKey(query);
  const shown = q ? types.filter((x) => serviceNameKey(x.name).includes(q)) : types;
  const used = new Set(types.map((x) => serviceNameKey(x.name)));
  const suggestions = profession.serviceTemplates.filter((s) => !used.has(serviceNameKey(s.name)) && (!q || serviceNameKey(s.name).includes(q)));

  const run = (fn: () => Promise<void>) => () => void fn().catch(onError);

  async function remove(x: ServiceType) {
    const ok = await confirm({
      title: 'Excluir tipo de serviço?',
      message: `"${x.name}" sai dos atalhos da agenda. ${t.services} já agendad${t.serviceArticle}s com esse nome não mudam.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    await service.deleteServiceType(x.id).catch(onError);
    toast({ title: 'Tipo de serviço excluído', tone: 'info' });
  }

  return (
    <Sheet open={open} onClose={() => { setEditing(null); onClose(); }} title="Tipos de serviço">
      <p className="mb-3 text-sm text-muted">
        Atalhos de nome e valor para agendar mais rápido. Os fixados aparecem primeiro.
        {!sealsPhotoSyncEnabled() && ' Nesta versão, ficam só neste aparelho e no arquivo de backup.'}
      </p>
      {types.length > 6 && (
        <label className="relative mb-3 block">
          <span className="sr-only">Buscar tipo de serviço</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25" />
        </label>
      )}

      {editing === 'novo' ? (
        <ServiceTypeForm onDone={() => setEditing(null)} />
      ) : (
        <Button variant="tonal" block icon={<Plus size={18} />} onClick={() => setEditing('novo')}>Adicionar tipo de serviço</Button>
      )}

      <h3 className="mb-2 mt-5 font-sans text-xs font-bold uppercase tracking-wider text-muted">Seus tipos ({types.length})</h3>
      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">{types.length ? 'Nenhum tipo encontrado.' : 'Você ainda não criou tipos de serviço. Adicione um ou use uma sugestão abaixo.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((x, i) => (
            <li key={x.id} className={cx('rounded-2xl border p-3', x.pinned ? 'border-brand-500' : 'border-line')}>
              {editing !== 'novo' && editing?.id === x.id ? (
                <ServiceTypeForm initial={x} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="flex items-center gap-1.5 font-semibold [overflow-wrap:anywhere]">
                      {x.pinned && <Pin size={14} className="shrink-0 text-brand-600 dark:text-brand-300" aria-label="Fixado" />}
                      {x.name}
                    </p>
                    <p className="text-sm text-muted">{priceLabel(x.price, hidden)}</p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <IconButton label={x.pinned ? `Desafixar ${x.name}` : `Fixar ${x.name}`} aria-pressed={x.pinned} onClick={run(() => service.setServiceTypePinned(x.id, !x.pinned))}>
                      {x.pinned ? <PinOff size={18} /> : <Pin size={18} />}
                    </IconButton>
                    {!q && (
                      <>
                        <IconButton label={`Mover ${x.name} para cima`} disabled={i === 0 || shown[i - 1]!.pinned !== x.pinned} onClick={run(() => service.moveServiceType(x.id, -1))} className="disabled:opacity-30"><ArrowUp size={18} /></IconButton>
                        <IconButton label={`Mover ${x.name} para baixo`} disabled={i === shown.length - 1 || shown[i + 1]!.pinned !== x.pinned} onClick={run(() => service.moveServiceType(x.id, 1))} className="disabled:opacity-30"><ArrowDown size={18} /></IconButton>
                      </>
                    )}
                    <IconButton label={`Editar ${x.name}`} onClick={() => setEditing(x)}><Pencil size={18} /></IconButton>
                    <IconButton label={`Excluir ${x.name}`} onClick={() => void remove(x)} className="text-red-700 dark:text-red-300"><Trash2 size={18} /></IconButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 font-sans text-xs font-bold uppercase tracking-wider text-muted">Sugestões para {profession.name.toLowerCase()}</h3>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line p-3">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="font-medium [overflow-wrap:anywhere]">{s.name}</p>
                  <p className="text-sm text-muted">{priceLabel(s.suggestedPrice, hidden)}</p>
                </div>
                <Button variant="secondary" size="sm" icon={<Plus size={16} />} aria-label={`Adicionar ${s.name}`} onClick={run(() => service.saveServiceType({ name: s.name, price: centsToInput(s.suggestedPrice) }).then(() => undefined))}>Adicionar</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
