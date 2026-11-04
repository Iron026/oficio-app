import { CalendarPlus, Check, CircleMinus, CirclePlus, LayoutDashboard, Monitor, Moon, Palette, RotateCcw, Sun, UserPlus } from 'lucide-react';
import { accentOf } from '../../domain/preferences';
import { monthTotals } from '../../domain/finance';
import type { ThemePreference } from '../../domain/types';
import { monthKey } from '../../lib/dates';
import { useApp, useErrorHandler, usePrefs } from '../../state/AppContext';
import { applyAccentWithTransition } from '../../ui/appearance';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { Card, Segmented } from '../../ui/Misc';
import { Money } from '../../ui/Money';
import { DEFAULT_PALETTE, PALETTES, getPalette } from '../../ui/palettes';
import { Logo } from '../Shell';
import { Group, OptionRow, SettingsSubpage, openSettings } from './shared';

export const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export const themeLabel = (t: ThemePreference) => THEME_OPTIONS.find((o) => o.value === t)?.label ?? 'Sistema';

/** Tema do aparelho: Claro, Escuro ou Sistema. */
export function ThemePicker() {
  const { service } = useApp();
  const prefs = usePrefs();
  const onError = useErrorHandler();
  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = prefs.theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => service.updateDevicePrefs({ theme: value }).catch(onError)}
            className={cx('press flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-surface text-sm font-medium transition-colors', active ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'border-line')}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function AppearancePage() {
  const { data, service } = useApp();
  const prefs = usePrefs();
  const onError = useErrorHandler();
  const palette = getPalette(accentOf(data.settings));
  return (
    <SettingsSubpage id="aparencia">
      <Group title="Tema (este aparelho)">
        <ThemePicker />
      </Group>
      <Card className="!p-0">
        <OptionRow label="Paleta de cores" detail="Muda a identidade do app inteiro" icon={<Palette size={18} />} value={palette.name} onClick={() => openSettings('aparencia', 'aparencia/paleta')} />
      </Card>
      <Group title="Densidade das listas" hint="Tema e densidade valem só para este aparelho; a paleta acompanha sua conta.">
        <Segmented label="Densidade das listas" value={prefs.density} onChange={(v) => service.updateDevicePrefs({ density: v }).catch(onError)} options={[{ value: 'confortavel', label: 'Confortável' }, { value: 'compacta', label: 'Compacta' }]} />
      </Group>
    </SettingsSubpage>
  );
}

/** Prévia ao vivo: um Painel em miniatura com os seus dados reais do mês, na paleta atual. */
function PalettePreview() {
  const { data } = useApp();
  const month = monthTotals(data.transactions, monthKey(new Date()));
  const firstName = data.profile!.name.split(/\s+/)[0];
  return (
    <div aria-hidden="true" inert className="pointer-events-none select-none overflow-hidden rounded-2xl border border-line bg-bg shadow-sm">
      <div className="hero px-3 pb-8 pt-2.5 text-white">
        <div className="flex items-center gap-2">
          <Logo size={20} onHero />
          <span className="font-display text-sm font-extrabold">Painel</span>
        </div>
        <p className="mt-2 text-xs text-on-hero-soft">Olá,</p>
        <p className="font-display text-lg font-extrabold leading-tight [overflow-wrap:anywhere]">{firstName}</p>
      </div>
      <div className="-mt-6 space-y-2 px-3 pb-3">
        <div className="rounded-xl border border-line bg-surface p-2.5 shadow-sm">
          <p className="text-xs text-muted">Saldo do mês</p>
          <p className="font-display text-lg font-extrabold"><Money cents={month.balance} kind="balance" /></p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            <span className="inline-flex items-center gap-1 text-income"><CirclePlus size={12} />Receitas</span>
            <span className="inline-flex items-center gap-1 text-expense"><CircleMinus size={12} />Despesas</span>
            <span className="font-semibold text-xp-600 dark:text-xp-400">XP</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-600 text-xs font-semibold text-white"><CalendarPlus size={14} />Agendar</span>
          <span className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-xs font-semibold"><UserPlus size={14} className="text-brand-600 dark:text-brand-300" />Cliente</span>
        </div>
        <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
          <span className="flex-1 rounded-md bg-surface py-1 text-center shadow-sm">A fazer</span>
          <span className="flex-1 py-1 text-center text-muted">Concluídos</span>
        </div>
        <div className="flex items-center justify-around rounded-lg border border-line bg-surface py-1.5">
          <span className="flex h-6 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"><LayoutDashboard size={14} /></span>
          {[0, 1, 2, 3].map((i) => <span key={i} className="h-1.5 w-6 rounded-full bg-line" />)}
        </div>
      </div>
    </div>
  );
}

export function PalettePage() {
  const { data, service } = useApp();
  const prefs = usePrefs();
  const onError = useErrorHandler();
  const accent = accentOf(data.settings);
  const choose = (id: typeof accent) => {
    applyAccentWithTransition(id, prefs.motion === 'reduzir' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    service.updateSettings({ accent: id }).catch(onError);
  };
  return (
    <SettingsSubpage id="aparencia/paleta">
      <PalettePreview />
      <Group title="Escolha a paleta" hint={getPalette(accent).note}>
        <div role="radiogroup" aria-label="Paleta de cores" className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
          {PALETTES.map((p) => {
            const active = accent === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choose(p.id)}
                className={cx('press flex min-h-12 items-center gap-2.5 rounded-xl border-2 bg-surface px-3 text-left text-sm font-medium', active ? 'border-brand-500' : 'border-line')}
              >
                <span className="h-6 w-6 shrink-0 rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--line)]" style={{ background: `linear-gradient(135deg, ${p.scale[4]}, ${p.hero[1]})` }} aria-hidden="true" />
                <span className="min-w-0 flex-1">{p.name}</span>
                {active && <Check size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </Group>
      <div>
        <Button variant="secondary" block icon={<RotateCcw size={18} />} disabled={accent === DEFAULT_PALETTE} onClick={() => choose(DEFAULT_PALETTE)}>
          Restaurar Petróleo (padrão)
        </Button>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          A paleta acompanha sua conta e muda o topo, os botões, a navegação e as seleções. Receitas, despesas, XP, alertas e medalhões de categoria mantêm as cores próprias em todas as paletas.
        </p>
      </div>
    </SettingsSubpage>
  );
}
