/**
 * 0.5.0-beta.5 — "Personalizar Painel" na interface: mostrar/ocultar, subir/descer com nomes claros, efeito
 * imediato, mantido ao reabrir, restaurar padrão, avisos críticos sempre visíveis e "Ocultar valores".
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { todayKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function setup(prep?: (s: AppService) => Promise<void>) {
  const dbName = `ui-dash-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await prep?.(s);
  return dbName;
}
async function open(dbName: string) {
  window.location.hash = '#/painel';
  const view = render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { view, user: userEvent.setup() };
}
const cards = () => [...document.querySelectorAll('[data-dashboard-card]')].map((e) => e.getAttribute('data-dashboard-card'));

describe('beta.5: Painel personalizável', () => {
  it('padrão igual ao aprovado; ocultar, mostrar, subir e restaurar mudam na hora e ficam salvos', async () => {
    const db = await setup();
    const { view, user } = await open(db);
    expect(cards()).toEqual(['saldo', 'nivel', 'atalhos', 'semana', 'proximos', 'missoes', 'dica']); // saldo inclui receitas e despesas
    await user.click(screen.getByRole('button', { name: /personalizar painel/i }));
    const sheet = await screen.findByRole('dialog', { name: 'Personalizar Painel' });
    expect(within(sheet).getByRole('button', { name: /restaurar padrão/i })).toBeDisabled();
    await user.click(within(sheet).getByRole('switch', { name: /nível e experiência/i }));
    await user.click(within(sheet).getByRole('switch', { name: /^a receber/i }));
    await waitFor(() => expect(cards()).not.toContain('nivel'));
    expect(cards()).toContain('receber');
    // Subir "Próximos atendimentos" duas vezes: passa por "Meta do mês" (oculto) e "A receber".
    await user.click(within(sheet).getByRole('button', { name: /^subir próximos atendimentos/i }));
    await user.click(within(sheet).getByRole('button', { name: /^subir próximos atendimentos/i }));
    await waitFor(() => expect(cards().indexOf('proximos')).toBeLessThan(cards().indexOf('receber')));
    expect(within(sheet).getByRole('button', { name: /^subir saldo do mês/i })).toBeDisabled();
    await user.click(within(sheet).getByRole('button', { name: 'Concluir' }));
    const after = cards();
    view.unmount();

    // Reabrir o app: a organização continua.
    const again = await open(db);
    expect(cards()).toEqual(after);
    await again.user.click(screen.getByRole('button', { name: /personalizar painel/i }));
    const sheet2 = await screen.findByRole('dialog', { name: 'Personalizar Painel' });
    await again.user.click(within(sheet2).getByRole('button', { name: /restaurar padrão/i }));
    await waitFor(() => expect(cards()).toEqual(['saldo', 'nivel', 'atalhos', 'semana', 'proximos', 'missoes', 'dica']));
  });

  it('saldo e movimento separados quando não estão lado a lado; totais iguais', async () => {
    const db = await setup(async (s) => {
      await s.saveTransaction({ type: 'receita', amount: '250,00', description: 'x', category: 'Serviço', date: todayKey() });
      await s.updateDashboard((l, at) => ({ ...l, order: ['movimento', 'nivel', 'saldo'], orderAt: at }));
    });
    await open(db);
    const order = cards();
    expect(order.indexOf('movimento')).toBeLessThan(order.indexOf('saldo'));
    expect(document.querySelector('[data-dashboard-card="movimento"]')).toHaveTextContent(/Receitas.*250,00/);
    expect(document.querySelector('[data-dashboard-card="saldo"]')).toHaveTextContent(/Saldo do mês.*250,00/);
    expect(document.querySelector('[data-dashboard-card="saldo"]')).not.toHaveTextContent(/Despesas/);
  });

  it('todos ocultos: estado vazio, e o aviso de estornos para revisar continua no topo', async () => {
    const db = await setup(async (s) => {
      const a = (await s.saveAppointment({ title: 'Corte', clientId: '', date: todayKey(), time: '', price: '100,00', notes: '' })).appointment;
      const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000 });
      await s.refundPayment(p!.id, { amount: 'total' });
      // Segundo estorno do mesmo pagamento vindo de outro aparelho (backup): acima do pago → revisão.
      const json = JSON.parse(s.exportBackup());
      const r = json.data.transactions.find((t: { payment?: { kind?: string } }) => t.payment?.kind === 'estorno');
      json.data.transactions.push({ ...r, id: 'outro', amount: 5_000 });
      await s.importBackup(JSON.stringify(json));
      await s.updateDashboard((l, at) => ({ ...l, hidden: [...l.order], hiddenAt: at }));
    });
    await open(db);
    expect(cards()).toEqual([]);
    expect(screen.getByText(/todos os cartões estão ocultos/i)).toBeInTheDocument();
    expect(document.querySelector('[data-dashboard-alert="estornos"]')).toHaveTextContent(/estornos para revisar/i);
    expect(screen.getByRole('button', { name: /personalizar painel/i })).toBeInTheDocument();
  });

  it('"Ocultar valores" vale para os cartões novos (A receber e Meta do mês)', async () => {
    const db = await setup(async (s) => {
      const a = (await s.saveAppointment({ title: 'Corte', clientId: '', date: todayKey(), time: '', price: '300,00', notes: '' })).appointment;
      await s.completeAppointment(a.id, { payment: { mode: 'parcial', amount: 10_000 } });
      await s.updateDashboard((l, at) => ({ ...l, hidden: [], hiddenAt: at }));
      await s.updateDevicePrefs({ hideValues: true });
    });
    await open(db);
    const receber = document.querySelector('[data-dashboard-card="receber"]')!;
    const meta = document.querySelector('[data-dashboard-card="meta-mes"]')!;
    expect(receber).not.toHaveTextContent(/200,00/);
    expect(meta).not.toHaveTextContent(/100,00|3\.000,00/);
    expect(receber).toHaveTextContent(/1 atendimento concluído/);
  });
});
