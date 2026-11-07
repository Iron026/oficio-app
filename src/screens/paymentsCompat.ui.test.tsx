/**
 * 0.5 — fluxos de pagamento na interface: concluir sem pré-seleção, antecipado, parcial, registrar
 * pagamento, estorno, reabrir/excluir preservando valores, legado "não registrado" e ocultar valores.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { paymentSummary } from '../domain/payments';
import type { AppData } from '../domain/types';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const today = toDateKey(new Date());

async function start(hash: string, seed?: (s: AppService) => Promise<void>) {
  const dbName = `ui-pay-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await seed?.(s);
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  const reload = async () => AppService.load(await createIndexedDbAdapter(dbName));
  return { user: userEvent.setup(), reload };
}
const coloracao = (s: AppService) => s.saveAppointment({ title: 'Coloração', clientId: '', date: today, time: '14:00', price: '300,00', notes: '' }).then((r) => r.appointment);
const openItem = async (user: ReturnType<typeof userEvent.setup>, name = /coloração/i) => {
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Coloração' });
};
const summaryOf = async (reload: () => Promise<AppService>) => { const s = await reload(); return paymentSummary(s.data.appointments[0]!, s.data.transactions); };

describe('0.5: concluir exige escolher o recebimento', () => {
  it('nenhuma opção vem marcada e Concluir fica desabilitado; "Recebi uma parte" registra só o valor informado', async () => {
    const { user, reload } = await start('#/agenda', async (s) => { await coloracao(s); });
    const sheet = await openItem(user);
    await user.click(within(sheet).getByRole('button', { name: /concluir atendimento/i }));
    const done = await screen.findByRole('dialog', { name: /concluir: coloração/i });
    const group = within(done).getByRole('radiogroup', { name: /recebimento/i });
    expect(within(group).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    const confirmBtn = within(done).getByRole('button', { name: /concluir atendimento/i });
    expect(confirmBtn).toBeDisabled();
    await user.click(within(group).getByRole('radio', { name: /recebi uma parte/i }));
    expect(confirmBtn).toBeDisabled(); // falta o valor
    await user.type(within(done).getByLabelText(/valor recebido/i), '100');
    await user.click(within(done).getByRole('radio', { name: 'Pix' }));
    await user.click(confirmBtn);
    expect(await screen.findByText(/R\$\s100,00 recebidos; R\$\s200,00 a receber/)).toBeInTheDocument();
    const sum = await summaryOf(reload);
    expect(sum).toMatchObject({ received: 10_000, pending: 20_000, state: 'parcial' });
    expect(sum.entries[0]!.method).toBe('Pix');
  });

  it('com antecipado, "Recebi tudo que faltava" registra só o restante; o item mostra "Pago"', async () => {
    const { user, reload } = await start('#/agenda', async (s) => {
      const a = await coloracao(s);
      await s.registerPayment(a.id, { amount: 10_000, date: today });
    });
    const sheet = await openItem(user);
    expect(within(sheet).getByRole('region', { name: 'Pagamento' })).toHaveTextContent(/Recebido.*R\$\s100,00/);
    await user.click(within(sheet).getByRole('button', { name: /concluir atendimento/i }));
    const done = await screen.findByRole('dialog', { name: /concluir: coloração/i });
    await user.click(within(done).getByRole('radio', { name: /recebi tudo que faltava/i }));
    expect(within(done).getByRole('radio', { name: /recebi tudo/i })).toHaveTextContent(/Registra R\$\s200,00.*já havia R\$\s100,00/);
    await user.click(within(done).getByRole('button', { name: /concluir atendimento/i }));
    await screen.findByText(/R\$\s200,00 registrados como recebidos/);
    expect((await reload()).data.transactions.map((t) => t.amount)).toEqual([10_000, 20_000]);
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    expect(await screen.findByRole('button', { name: /coloração/i })).toHaveTextContent(/Pago/);
  });

  it('"Ainda não recebi" conclui sem lançamento e o item mostra o valor a receber', async () => {
    const { user, reload } = await start('#/agenda', async (s) => { await coloracao(s); });
    const sheet = await openItem(user);
    await user.click(within(sheet).getByRole('button', { name: /concluir atendimento/i }));
    const done = await screen.findByRole('dialog', { name: /concluir: coloração/i });
    await user.click(within(done).getByRole('radio', { name: /ainda não recebi/i }));
    await user.click(within(done).getByRole('button', { name: /concluir atendimento/i }));
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    expect(await screen.findByRole('button', { name: /coloração/i })).toHaveTextContent(/A receber R\$\s300,00/);
    expect((await reload()).data.transactions).toEqual([]);
  });
});

describe('0.5: registrar pagamento e estornar', () => {
  it('registrar o que falta (com Desfazer), estornar em parte e ver o histórico e os totais', async () => {
    const { user, reload } = await start('#/agenda', async (s) => {
      const a = await coloracao(s);
      await s.completeAppointment(a.id, { payment: { mode: 'nenhum' } });
    });
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    let sheet = await openItem(user);
    await user.click(within(sheet).getByRole('button', { name: /^registrar pagamento$/i }));
    const pay = await screen.findByRole('dialog', { name: /registrar pagamento/i });
    await user.click(within(pay).getByRole('button', { name: /usar o que falta/i }));
    await user.click(within(pay).getByRole('button', { name: /^registrar pagamento$/i }));
    expect(await screen.findByText(/Pagamento de R\$\s300,00 registrado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^desfazer: pagamento de r\$\s300,00 registrado/i })).toBeInTheDocument();
    expect(await summaryOf(reload)).toMatchObject({ received: 30_000, pending: 0, state: 'pago' });

    sheet = await screen.findByRole('dialog', { name: 'Coloração' });
    const history = within(sheet).getByRole('list', { name: /histórico financeiro/i });
    await user.click(within(history).getByRole('button', { name: /estornar r\$\s300,00/i }));
    const refund = await screen.findByRole('dialog', { name: /estornar pagamento/i });
    const field = within(refund).getByLabelText(/valor a estornar/i);
    await user.clear(field);
    await user.type(field, '50');
    await user.click(within(refund).getByRole('button', { name: /registrar estorno/i }));
    expect(await screen.findByText(/Estorno de R\$\s50,00 registrado/)).toBeInTheDocument();
    const sum = await summaryOf(reload);
    expect(sum).toMatchObject({ received: 30_000, refunded: 5_000, net: 25_000, pending: 5_000 });
    sheet = await screen.findByRole('dialog', { name: 'Coloração' });
    expect(within(sheet).getByRole('region', { name: 'Pagamento' })).toHaveTextContent(/Estornado.*R\$\s50,00/);
    expect(within(sheet).getAllByText('Estorno')).toHaveLength(1);
  });

  it('não deixa estornar mais do que o pagamento', async () => {
    const { user } = await start('#/agenda', async (s) => {
      const a = await coloracao(s);
      await s.registerPayment(a.id, { amount: 10_000 });
    });
    const sheet = await openItem(user);
    await user.click(within(sheet).getByRole('button', { name: /estornar/i }));
    const refund = await screen.findByRole('dialog', { name: /estornar pagamento/i });
    const field = within(refund).getByLabelText(/valor a estornar/i);
    await user.clear(field);
    await user.type(field, '150');
    await user.click(within(refund).getByRole('button', { name: /registrar estorno/i }));
    expect(await within(refund).findByText(/No máximo R\$\s100,00/)).toBeInTheDocument();
  });
});

describe('0.5: reabrir, cancelar e excluir nunca apagam dinheiro', () => {
  it('reabrir avisa que os valores continuam; excluir mantém em Finanças como "serviço excluído"', async () => {
    const { user, reload } = await start('#/agenda', async (s) => {
      const a = await coloracao(s);
      await s.registerPayment(a.id, { amount: 10_000 });
      await s.completeAppointment(a.id, { payment: { mode: 'parcial', amount: 5_000 } });
    });
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    let sheet = await openItem(user);
    await user.click(within(sheet).getByRole('button', { name: /reabrir/i }));
    const dlg = await screen.findByRole('dialog', { name: 'Reabrir?' });
    expect(dlg).toHaveTextContent(/Os valores recebidos \(R\$\s150,00\) continuam em Finanças e no histórico/);
    await user.click(within(dlg).getByRole('button', { name: /continuar/i }));
    await screen.findByText('Reaberto');
    expect((await reload()).data.transactions).toHaveLength(2);

    await user.click(await screen.findByRole('radio', { name: /a fazer/i }));
    sheet = await openItem(user);
    await user.click(within(sheet).getByRole('button', { name: /excluir/i }));
    const del = await screen.findByRole('dialog', { name: /excluir atendimento/i });
    expect(del).toHaveTextContent(/continuam em Finanças.*serviço excluído/);
    await user.click(within(del).getByRole('button', { name: /^excluir$/i }));
    await screen.findByRole('button', { name: /^desfazer:/i });
    expect((await reload()).data.transactions.map((t) => t.amount).sort()).toEqual([10_000, 5_000].sort());
    window.location.hash = '#/financas';
    expect(await screen.findAllByText(/serviço excluído/)).toHaveLength(2);
  });
});

describe('0.5: legado e privacidade', () => {
  it('serviço concluído antes da 0.5 sem receita: "Pagamento não registrado", fora do a receber', async () => {
    const { user } = await start('#/agenda', async (s) => {
      const json = JSON.parse(s.exportBackup()) as { data: AppData };
      json.data.appointments.push({ id: 'old', title: 'Coloração', clientId: null, date: today, time: '', price: 30_000, status: 'concluido', notes: '', completedAt: new Date().toISOString(), transactionId: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' });
      await s.importBackup(JSON.stringify(json));
    });
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    const item = await screen.findByRole('button', { name: /coloração/i });
    expect(item).toHaveTextContent(/Pagamento não registrado/);
    expect(item).not.toHaveTextContent(/A receber/);
    const sheet = await openItem(user);
    expect(within(sheet).getByRole('region', { name: 'Pagamento' })).toHaveTextContent(/não presume se foi pago/);
    window.location.hash = '#/financas';
    await screen.findByRole('heading', { name: /saldo do mês|novembro|outubro|dezembro/i }).catch(() => undefined);
    expect(document.querySelector('[data-receivables]')).toBeNull();
  });

  it('com "Ocultar valores", o resumo do pagamento não mostra quantias', async () => {
    const { user } = await start('#/agenda', async (s) => {
      const a = await coloracao(s);
      await s.registerPayment(a.id, { amount: 12_345 });
      await s.updateDevicePrefs({ hideValues: true });
    });
    const sheet = await openItem(user);
    const panel = within(sheet).getByRole('region', { name: 'Pagamento' });
    expect(panel).not.toHaveTextContent(/123,45|300,00/);
    expect(panel).toHaveTextContent(/R\$ •••••/);
    await waitFor(() => expect(screen.getByRole('button', { name: /coloração/i })).not.toHaveTextContent(/123,45/));
  });
});
