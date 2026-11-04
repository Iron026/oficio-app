import { useEffect, useState } from 'react';
import { Check, Crown, Database, ExternalLink, Info, Lock, Smartphone } from 'lucide-react';
import { CATEGORY_LABEL, FEATURES } from '../../monetization/catalog';
import { canUse, freeEntitlements } from '../../monetization/entitlements';
import { appBuildInfo, platformName } from '../../platform/native';
import { useApp } from '../../state/AppContext';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { Card } from '../../ui/Misc';
import { Sheet } from '../../ui/Sheet';
import { APP_VERSION, PRIVACY_POLICY_URL } from './pages';
import { Group, SettingsSubpage } from './shared';

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line p-3.5 last:border-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand-600 dark:text-brand-300" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted [overflow-wrap:anywhere]">{value}</span>
      </span>
    </div>
  );
}

/** Informações reais do app instalado: versão, compilação, plataforma e armazenamento. */
export function AboutPage() {
  const { persistent } = useApp();
  const [build, setBuild] = useState<{ version: string; build: string } | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const ent = freeEntitlements();
  useEffect(() => {
    let alive = true;
    void appBuildInfo().then((b) => alive && setBuild(b));
    return () => { alive = false; };
  }, []);
  const android = platformName() === 'android';
  return (
    <SettingsSubpage id="sobre">
      <Card className="!p-0">
        <InfoRow icon={<Info size={18} />} label="Versão" value={`v${APP_VERSION}`} />
        {build && <InfoRow icon={<Info size={18} />} label="Compilação" value={`nº ${build.build}${build.version !== APP_VERSION ? ` · ${build.version}` : ''}`} />}
        <InfoRow icon={<Smartphone size={18} />} label="Plataforma" value={android ? 'Android' : 'Web (navegador)'} />
        <InfoRow icon={<Database size={18} />} label="Armazenamento" value={persistent ? 'Local e persistente' : 'Temporário (o navegador pode apagar)'} />
      </Card>
      <Group title="Plano">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Check size={20} aria-hidden="true" /></span>
            <div className="flex-1">
              <p className="font-semibold">Plano Gratuito</p>
              <p className="text-sm text-muted">Todos os recursos desta versão estão liberados.</p>
            </div>
          </div>
          <Button variant="secondary" block className="mt-3" icon={<Crown size={18} className="text-xp-500" />} onClick={() => setPlansOpen(true)}>Conhecer o Premium (em breve)</Button>
        </Card>
      </Group>
      <p className="text-sm">
        <a className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300" href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} aria-hidden="true" /> Ler Política de Privacidade
        </a>
      </p>
      <Sheet open={plansOpen} onClose={() => setPlansOpen(false)} title="Recursos do Ofício">
        <p className="mb-4 rounded-xl bg-xp-100/60 p-3 text-sm text-xp-700 dark:bg-xp-500/10 dark:text-xp-400">
          Nenhuma compra ou assinatura está disponível nesta versão. Os itens “Em breve” estão em desenvolvimento e não podem ser adquiridos.
        </p>
        {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((cat) => {
          const items = FEATURES.filter((f) => f.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">{CATEGORY_LABEL[cat]}</h3>
              <ul className="space-y-2">
                {items.map((f) => {
                  const on = canUse(f, ent);
                  return (
                    <li key={f.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                      <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', on ? 'bg-brand-500 text-white' : 'bg-surface-2 text-muted')}>
                        {on ? <Check size={16} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{f.name}</p>
                        <p className="text-sm text-muted">{f.description}</p>
                      </div>
                      <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold', on ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-surface-2 text-muted')}>
                        {on ? 'Incluído' : f.unlock.kind === 'purchase' ? 'Em breve · compra única' : 'Em breve · Premium'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </Sheet>
    </SettingsSubpage>
  );
}
