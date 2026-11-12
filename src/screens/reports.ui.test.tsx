/**
 * 0.5.0-beta.4 — Relatórios na interface: acesso por Finanças (sem nova área), caixa × pendente × previsto,
 * gráfico com equivalente em texto, estornos em revisão sinalizados e "Ocultar valores".
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const today = toDateKey(new Date());

async function start({ hide = false, conflict = false } = {}) {
  const dbName = `ui-rep-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const a = (await s.saveAppointment({ title: 'Coloração', clientId: '', date: today, time: '10:00', price: '300,00', notes: '' })).appointment;
  await s.completeAppointment(a.id, { payment: { mode: 'parcial', amount: 10_000, date: today } });
  await s.saveAppointment({ title: 'Escova', clientId: '', date: today, time: '23:00', price: '80,00', notes: '' }); // previsto no mês
  await s.saveTransaction({ type: 'despesa', amount: '40,00', description: 'Tintas', category: 'Produtos', date: today });
  if (conflict) {
    const p = s.data.transactions.find((t) => t.type === 'receita')!;
    await s.refundPayment(p.id, { amount: 'total', date: today });
    const json = JSON.parse(s.exportBackup());
    const r = json.data.transactions.find((t: { payment?: { kind?: string } }) => t.payment?.kind === 'estorno');
    json.data.transactions.push({ ...r, id: 'outro', amount: 5_000, createdAt: new Date(Date.now() + 1000).toISOString() });
    await s.importBackup(JSON.stringify(json));
  }
  if (hide) await s.updateDevicePrefs({ hideValues: true });
  window.location.hash = '#/financas';
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /^relatórios$/i }));
  await screen.findByText('Caixa do mês');
  return { user };
}

describe('beta.4: relatórios', () => {
  it('abre por Finanças (5 áreas na navegação); caixa, fora do caixa e ticket médio com a fórmula', async () => {
    const { user } = await start();
    expect(window.location.hash).toBe('#/financas/relatorios');
    expect(within(screen.getByRole('navigation', { name: /navegação principal/i })).getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Relatórios');
    const caixa = screen.getByText('Caixa do mês').closest('section')!;
    expect(caixa).toHaveTextContent(/Receita bruta \(recebimentos\).*R\$\s100,00/);
    expect(caixa).toHaveTextContent(/Despesas operacionais.*R\$\s40,00/);
    expect(caixa).toHaveTextContent(/Saldo.*R\$\s60,00/);
    const fora = document.querySelector('[data-report-offcash]')!;
    expect(fora).toHaveTextContent(/A receber \(pendente\)\s*R\$\s200,00/);
    expect(fora).toHaveTextContent(/Previsto no mês\s*R\$\s80,00/);
    expect(document.body).toHaveTextContent(/Ticket médio: Soma do valor líquido recebido/);
    // Gráfico acessível e equivalente em texto.
    expect(screen.getByRole('img', { name: /recebimentos, estornos, despesas e saldo por mês/i })).toBeInTheDocument();
    await user.click(screen.getByText('Ver valores em texto'));
    expect(screen.getByRole('table')).toHaveTextContent(/Recebido.*Estornos.*Despesas.*Saldo/);
    await user.click(screen.getByRole('radio', { name: '12 meses' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(13);
  });

  it('estornos em revisão: aviso de totais não reconciliados', async () => {
    await start({ conflict: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/Totais ainda não reconciliados/);
  });

  it('"Ocultar valores" mascara o caixa, o gráfico e a tabela', async () => {
    const { user } = await start({ hide: true });
    expect(screen.getByText('Caixa do mês').closest('section')!).not.toHaveTextContent(/R\$\s\d/);
    expect(screen.getByRole('img', { name: /valores ocultos/i })).toBeInTheDocument();
    await user.click(screen.getByText('Ver valores em texto'));
    expect(screen.getByRole('table')).not.toHaveTextContent(/R\$\s\d/);
  });
});
