/**
 * 0.5.0-beta.2 — Finanças: estornos como movimentação própria (resumo, filtro, gráfico de gastos,
 * Painel) e identificação textual dos lançamentos vinculados a serviços (sem o ícone de corrente).
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

async function start(hash: string, seed: (s: AppService) => Promise<void>) {
  const dbName = `ui-b2-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await seed(s);
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { user: userEvent.setup() };
}

async function seed(s: AppService) {
  const a = (await s.saveAppointment({ title: 'Coloração', clientId: '', date: today, time: '14:00', price: '300,00', notes: '' })).appointment;
  const { transaction: p } = await s.registerPayment(a.id, { amount: 25_000, date: today });
  await s.refundPayment(p!.id, { amount: 3_000, date: today });
  await s.saveTransaction({ type: 'despesa', amount: '40,00', description: 'Tintas', category: 'Produtos', date: today });
  await s.saveTransaction({ type: 'receita', amount: '50,00', description: 'Venda avulsa', category: 'Venda de produtos', date: today });
}

describe('beta.2: estornos em Finanças', () => {
  it('resumo com recebimentos brutos, estornos e despesas; gastos sem estornos; filtro próprio', async () => {
    const { user } = await start('#/financas', seed);
    const card = (await screen.findByText('Saldo do mês')).closest('section, div')!.parentElement!;
    const dl = within(card).getAllByRole('term').map((dt) => [dt.textContent!.trim(), dt.nextElementSibling!.textContent!.replace(/\s/g, ' ')]);
    expect(dl).toEqual([['Receitas', '+mais R$ 300,00'], ['Estornos', '−menos R$ 30,00'], ['Despesas', '−menos R$ 40,00']]);
    expect(card).toHaveTextContent(/\+mais R\$\s230,00/);
    // "Para onde foi o dinheiro": só a despesa operacional, 100%.
    expect(card).toHaveTextContent(/Para onde foi o dinheiro\s*Produtos.*R\$\s40,00 · 100%/);
    expect(screen.getByLabelText('Despesas com Produtos')).toBeInTheDocument();
    expect(screen.queryByLabelText(/despesas com estorno/i)).not.toBeInTheDocument();

    const filter = screen.getByRole('radiogroup', { name: /filtrar lançamentos/i });
    await user.click(within(filter).getByRole('radio', { name: 'Despesas' }));
    expect(document.querySelectorAll('[data-movement]')).toHaveLength(1);
    expect(document.querySelector('[data-movement]')!.getAttribute('data-movement')).toBe('despesa');
    await user.click(within(filter).getByRole('radio', { name: 'Estornos' }));
    const rows = [...document.querySelectorAll('[data-movement]')];
    expect(rows.map((r) => r.getAttribute('data-movement'))).toEqual(['estorno']);
    expect(rows[0]).toHaveTextContent(/Estorno: Coloração.*Estorno de pagamento.*−menos R\$\s30,00/);
  });

  it('identificação textual: "Pagamento de atendimento" e "Estorno de pagamento", sem o ícone de corrente', async () => {
    await start('#/financas', seed);
    await screen.findByText('Saldo do mês');
    const labels = [...document.querySelectorAll('[data-link-label]')].map((e) => e.textContent);
    expect(labels.sort()).toEqual(['Estorno de pagamento', 'Pagamento de atendimento']);
    expect(screen.queryByLabelText(/vinculado a um serviço/i)).not.toBeInTheDocument();
    // Lançamento avulso continua mostrando a categoria.
    const avulsa = [...document.querySelectorAll('[data-movement="receita"]')].find((r) => /Venda avulsa/.test(r.textContent ?? ''))!;
    expect(avulsa).toHaveTextContent(/Venda de produtos/);
    expect(avulsa.querySelector('[data-link-label]')).toBeNull();
  });

  it('Painel mostra a linha de estornos só quando há estorno no mês', async () => {
    await start('#/painel', seed);
    const terms = (await screen.findAllByRole('term')).map((t) => t.textContent!.trim());
    expect(terms).toEqual(expect.arrayContaining(['Receitas', 'Estornos', 'Despesas']));
  });
});
