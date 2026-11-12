import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { dashboardEntries, isDefaultDashboard, moveCard, readDashboard, resetDashboard, setCardVisible, type DashboardCardId } from '../domain/dashboard';
import { useApp, useErrorHandler } from '../state/AppContext';
import { Button, IconButton } from '../ui/Button';
import { Switch } from '../ui/Misc';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

/**
 * "Personalizar Painel" (beta.5): mostrar/ocultar e subir/descer com botões nomeados (sem depender de arrastar).
 * Cada toque grava na hora; o Painel atrás da folha muda junto. Avisos críticos não aparecem aqui: são fixos.
 */
export function DashboardCustomizer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, service, profession } = useApp();
  const onError = useErrorHandler();
  const toast = useToast();
  const t = profession.terms;
  const layout = readDashboard(data.settings.dashboard);
  const entries = dashboardEntries(layout);

  const info: Record<DashboardCardId, { label: string; detail: string }> = {
    saldo: { label: 'Saldo do mês', detail: 'Recebimentos menos estornos e despesas.' },
    movimento: { label: 'Receitas, estornos e despesas', detail: 'Os totais do mês, um por linha.' },
    nivel: { label: 'Nível e experiência', detail: 'Nível, categoria e XP até o próximo nível.' },
    atalhos: { label: 'Atalhos', detail: 'Agendar, cliente, receita e despesa.' },
    semana: { label: `${t.services} da semana`, detail: 'Progresso da meta semanal.' },
    receber: { label: 'A receber', detail: `Valor pendente de ${t.services.toLowerCase()} ${t.completedLabelPlural}.` },
    'meta-mes': { label: 'Meta do mês', detail: 'Receita do mês em relação à sua meta.' },
    proximos: { label: `Próxim${t.serviceArticle}s ${t.services.toLowerCase()}`, detail: 'Os três próximos da agenda.' },
    missoes: { label: 'Missões', detail: 'Missões da semana em andamento.' },
    dica: { label: `Dica para ${profession.name.toLowerCase()}`, detail: 'Uma sugestão do dia.' },
  };

  const apply = (change: Parameters<typeof service.updateDashboard>[0]) => service.updateDashboard(change).catch(onError);

  async function restore() {
    await apply((l, at) => resetDashboard(l, at));
    toast({ title: 'Organização padrão restaurada', tone: 'info' });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Personalizar Painel"
      footer={
        <div className="grid gap-2">
          <Button block variant="secondary" icon={<RotateCcw size={18} />} disabled={isDefaultDashboard(layout)} onClick={() => void restore()}>Restaurar padrão</Button>
          <Button block onClick={onClose}>Concluir</Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted">As mudanças valem na hora e ficam salvas neste aparelho e na sua conta. Avisos importantes, como estornos para revisar, continuam aparecendo no topo.</p>
      <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Cartões do Painel">
        {entries.map((e, i) => {
          const { label, detail } = info[e.id];
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-x-2 px-3 py-1" data-customize-card={e.id}>
              <div className="min-w-[12rem] flex-1">
                <Switch checked={e.visible} onChange={(v) => void apply((l, at) => setCardVisible(l, e.id, v, at))} label={label} description={detail} />
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton label={`Subir ${label}`} disabled={i === 0} onClick={() => void apply((l, at) => moveCard(l, e.id, -1, at))} className="disabled:opacity-30">
                  <ArrowUp size={18} />
                </IconButton>
                <IconButton label={`Descer ${label}`} disabled={i === entries.length - 1} onClick={() => void apply((l, at) => moveCard(l, e.id, 1, at))} className="disabled:opacity-30">
                  <ArrowDown size={18} />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
