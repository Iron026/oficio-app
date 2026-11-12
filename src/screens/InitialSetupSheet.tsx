import { useId, useMemo, useState } from 'react';
import { Check, Star } from 'lucide-react';
import { accentOf, avatarOf } from '../domain/preferences';
import { choiceSummary, setupSuggestions, type AgendaView, type SetupChoice } from '../domain/initialSetup';
import { centsToInput } from '../lib/money';
import { serviceNameKey } from '../domain/serviceTypes';
import { useApp, useErrorHandler, usePrefs } from '../state/AppContext';
import { ValidationError } from '../state/service';
import { getInternalAvatar } from '../ui/avatarCatalog';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { SelectField, TextField } from '../ui/Field';
import { getPalette } from '../ui/palettes';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const VIEW_LABEL: Record<AgendaView, string> = { lista: 'Lista', dia: 'Dia', semana: 'Semana', mes: 'Mês' };
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

interface ServiceRow { selected: boolean; name: string; price: string; pinned: boolean; duration: string; exists: boolean; editing: boolean }

/**
 * Configuração inicial por profissão (beta.5). Mostra sugestões editáveis; nada é aplicado antes de "Aplicar
 * escolhas", e "Pular" fica sempre visível no rodapé. Também abre em Ajustes › Perfil e negócio.
 */
export function InitialSetupSheet({ open, onClose, onSkip, welcome = false }: { open: boolean; onClose: () => void; onSkip?: () => void; welcome?: boolean }) {
  const { data } = useApp();
  if (!open || !data.profile) return null;
  return <SetupForm onClose={onClose} onSkip={onSkip ?? onClose} welcome={welcome} />;
}

function SetupForm({ onClose, onSkip, welcome }: { onClose: () => void; onSkip: () => void; welcome: boolean }) {
  const { data, service, profession } = useApp();
  const prefs = usePrefs();
  const onError = useErrorHandler();
  const toast = useToast();
  const t = profession.terms;
  const sug = useMemo(() => setupSuggestions(data), [data]);
  const currentAccent = accentOf(data.settings);
  const currentAvatar = avatarOf(data.settings);
  const [services, setServices] = useState<ServiceRow[]>(() =>
    sug.services.map((s) => ({ selected: !s.exists, name: s.name, price: centsToInput(s.price), pinned: false, duration: '', exists: s.exists, editing: false })),
  );
  const [organize, setOrganize] = useState(sug.dashboardIsDefault);
  const [view, setView] = useState<AgendaView | null>(sug.agendaView === prefs.agendaView ? null : sug.agendaView);
  const [accent, setAccent] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const groupId = useId();

  const choice: SetupChoice = {
    accent: accent && accent !== currentAccent ? (accent as SetupChoice['accent']) : null,
    avatarId,
    organizeDashboard: organize && sug.dashboardIsDefault,
    agendaView: view && view !== prefs.agendaView ? view : null,
    services: services.filter((s) => s.selected && !s.exists).map(({ name, price, pinned, duration }) => ({ name, price, pinned, duration })),
  };
  const summary = choiceSummary(choice);
  const set = (i: number, patch: Partial<ServiceRow>) => setServices((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const palette = getPalette(sug.accent);
  const existingKeys = useMemo(() => new Set(data.serviceTypes.map((x) => serviceNameKey(x.name))), [data.serviceTypes]);

  async function apply() {
    setBusy(true);
    setErrors({});
    try {
      const r = await service.applyInitialSetup(choice);
      const parts = [
        r.created ? `${r.created} ${r.created === 1 ? 'tipo de serviço criado' : 'tipos de serviço criados'}` : '',
        r.skipped ? `${r.skipped} já ${r.skipped === 1 ? 'existia e não foi duplicado' : 'existiam e não foram duplicados'}` : '',
      ].filter(Boolean);
      toast({ title: 'Personalização aplicada', description: parts.length ? `${parts.join('; ')}.` : undefined, tone: 'success' });
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) {
        // Erro por serviço: o índice vem da lista enviada (só os marcados).
        const sent = services.map((s, i) => ({ s, i })).filter((x) => x.s.selected && !x.s.exists);
        const map: Record<string, string> = {};
        for (const [k, msg] of Object.entries(err.errors as Record<string, string>)) {
          const n = Number(k.replace('servico', ''));
          if (Number.isInteger(n) && sent[n]) map[String(sent[n]!.i)] = msg;
        }
        setErrors(map);
        setServices((list) => list.map((x, i) => (map[String(i)] ? { ...x, editing: true } : x)));
      } else onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onSkip}
      title={`Sugestões para ${sug.professionName.toLowerCase()}`}
      footer={
        <div className="space-y-2">
          <p className="text-sm text-muted" aria-live="polite" data-setup-summary>{summary.length ? `Ao aplicar: ${summary.join(', ')}.` : 'Nada selecionado. Você pode pular e voltar depois em Ajustes.'}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onSkip} disabled={busy}>Pular</Button>
            <Button onClick={() => void apply()} disabled={busy || summary.length === 0}>Aplicar escolhas</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-sm" data-initial-setup>
        {welcome && <p className="font-display text-lg font-bold">Tudo pronto, {data.profile!.name.split(' ')[0]}! Quer deixar o Ofício do seu jeito?</p>}
        <p className="text-muted">Escolha o que quiser usar e ajuste antes de aplicar. Nada muda sem você confirmar, e tudo pode ser alterado depois em Ajustes. Nenhum cliente, {t.service.toLowerCase()} ou lançamento é criado.</p>

        <section aria-labelledby={`${groupId}-serv`} className="space-y-2">
          <h3 id={`${groupId}-serv`} className="font-display text-base font-bold">Tipos de serviço</h3>
          <p className="text-muted">Atalhos de nome e valor para agendar. Os valores são só uma referência inicial do Ofício, não preços de mercado: ajuste aos seus ou deixe em branco.</p>
          <ul className="space-y-2">
            {services.map((s, i) => (
              <li key={i} className={cx('rounded-xl border p-3', s.selected && !s.exists ? 'border-brand-500' : 'border-line')} data-setup-service={s.name}>
                <div className="flex items-start gap-3">
                  <input id={`${groupId}-s${i}`} type="checkbox" checked={s.selected && !s.exists} disabled={s.exists} onChange={(e) => set(i, { selected: e.target.checked })} className="mt-1 h-5 w-5 shrink-0 accent-brand-600" />
                  <label htmlFor={`${groupId}-s${i}`} className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{s.name}{s.pinned && <Star size={14} className="ml-1 inline fill-current align-[-2px] text-brand-600 dark:text-brand-300" aria-label="favorito" />}</span>
                    <span className="block text-muted">{s.exists ? 'Já cadastrado' : [s.price.trim() ? `R$ ${s.price.trim()}` : 'Sem valor', s.duration ? `${s.duration} min` : null].filter(Boolean).join(' · ')}</span>
                  </label>
                  {s.selected && !s.exists && (
                    <button type="button" aria-expanded={s.editing} aria-label={`Editar ${s.name}`} onClick={() => set(i, { editing: !s.editing })} className="press-soft -my-1 min-h-11 shrink-0 rounded-lg px-2 font-semibold text-brand-700 dark:text-brand-300">
                      {s.editing ? 'Fechar' : 'Editar'}
                    </button>
                  )}
                </div>
                {errors[String(i)] && !s.editing && <p role="alert" className="mt-1 text-red-700 dark:text-red-300">{errors[String(i)]}</p>}
                {s.selected && !s.exists && s.editing && (
                  <div className="mt-2 grid gap-2">
                    <TextField label="Nome" value={s.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={60}
                      error={errors[String(i)] ?? (existingKeys.has(serviceNameKey(s.name)) ? 'Você já tem um tipo com esse nome; ele não será duplicado.' : undefined)} />
                    <div className="grid grid-cols-2 gap-2">
                      <TextField label="Valor de referência" prefix="R$" inputMode="decimal" value={s.price} onChange={(e) => set(i, { price: e.target.value })} optional />
                      <SelectField label="Duração" value={s.duration} onChange={(e) => set(i, { duration: e.target.value })} optional>
                        <option value="">Sem duração</option>
                        {DURATIONS.map((d) => <option key={d} value={String(d)}>{d < 60 ? `${d} min` : `${d / 60} h${d % 60 ? ` ${d % 60} min` : ''}`}</option>)}
                      </SelectField>
                    </div>
                    <button type="button" aria-pressed={s.pinned} onClick={() => set(i, { pinned: !s.pinned })} className={cx('press-soft inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-3 font-semibold', s.pinned ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'text-muted')}>
                      <Star size={16} aria-hidden="true" className={s.pinned ? 'fill-current' : ''} /> Favorito (aparece primeiro ao agendar)
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${groupId}-painel`} className="space-y-2">
          <h3 id={`${groupId}-painel`} className="font-display text-base font-bold">Painel</h3>
          {sug.dashboardIsDefault ? (
            <label className="flex items-start gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" checked={organize} onChange={(e) => setOrganize(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
              <span><span className="block font-semibold">Organizar o Painel para {sug.professionName.toLowerCase()}</span><span className="text-muted">{sug.dashboardNote}</span></span>
            </label>
          ) : (
            <p className="rounded-xl bg-surface-2 p-3 text-muted">Seu Painel já está personalizado e não será alterado.</p>
          )}
        </section>

        <section aria-labelledby={`${groupId}-agenda`} className="space-y-2">
          <h3 id={`${groupId}-agenda`} className="font-display text-base font-bold">Agenda</h3>
          <div role="radiogroup" aria-labelledby={`${groupId}-agenda`} className="grid grid-cols-2 gap-2">
            {(['lista', 'dia', 'semana', 'mes'] as const).map((v) => {
              const current = (view ?? prefs.agendaView) === v;
              return (
                <button key={v} type="button" role="radio" aria-checked={current} onClick={() => setView(v === prefs.agendaView ? null : v)}
                  className={cx('press-soft min-h-12 rounded-xl border px-3 font-semibold', current ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'border-line')}>
                  Abrir em {VIEW_LABEL[v]}{v === sug.agendaView ? ' · sugerido' : ''}
                </button>
              );
            })}
          </div>
          <p className="text-muted">Vale para este aparelho. A duração dos atendimentos continua opcional.</p>
        </section>

        <section aria-labelledby={`${groupId}-visual`} className="space-y-2">
          <h3 id={`${groupId}-visual`} className="font-display text-base font-bold">Cor e imagem</h3>
          <div role="radiogroup" aria-label="Cor de destaque" className="grid grid-cols-2 gap-2">
            {[{ id: null, label: `Manter ${getPalette(currentAccent).name}`, swatch: getPalette(currentAccent).scale[6] }, ...(sug.accent !== currentAccent ? [{ id: sug.accent, label: `Usar ${palette.name} · sugerida`, swatch: palette.scale[6] }] : [])].map((o) => (
              <button key={o.id ?? 'manter'} type="button" role="radio" aria-checked={(accent ?? null) === o.id} onClick={() => setAccent(o.id)}
                className={cx('press-soft flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left font-semibold', (accent ?? null) === o.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-line')}>
                <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: o.swatch }} aria-hidden="true" />
                <span className="min-w-0">{o.label}</span>
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Imagem de perfil" className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={avatarId === null} onClick={() => setAvatarId(null)}
              className={cx('press-soft flex min-h-12 items-center gap-2 rounded-xl border px-3 font-semibold', avatarId === null ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-line')}>
              {avatarId === null && <Check size={16} aria-hidden="true" />} Manter {currentAvatar.kind === 'foto' ? 'minha foto' : currentAvatar.kind === 'interno' ? 'a atual' : 'as iniciais'}
            </button>
            {sug.avatarIds.map((id) => {
              const a = getInternalAvatar(id);
              if (!a) return null;
              return (
                <button key={id} type="button" role="radio" aria-checked={avatarId === id} aria-label={a.name} onClick={() => setAvatarId(id)}
                  className={cx('press-soft rounded-full border-2 p-0.5', avatarId === id ? 'border-brand-500' : 'border-transparent')}>
                  <img src={a.src} alt="" className="h-12 w-12 rounded-full bg-surface-2" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
