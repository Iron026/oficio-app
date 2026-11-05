import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import type { AppData, Transaction } from '../domain/types';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const today = toDateKey(new Date());
const pay = (id: string, appointmentId: string, amount: number): Transaction & { payment: Record<string, unknown> } => ({
  id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'receita', amount,
  description: 'Pagamento', category: 'Serviços', date: today, appointmentId, payment: { method: 'pix' },
});

/** Dados como a 0.5 os deixará: serviço com pagamento parcial registrado (via backup, o caminho real). */
async function seed(paid: number[]) {
  const dbName = `ui-pay-${Math.random()}`;
  const service = await AppService.load(await createIndexedDbAdapter(dbName));
  await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const { appointment } = await service.saveAppointment({ title: 'Coloração', clientId: '', date: today, time: '', price: '300,00', notes: '' });
  const json = JSON.parse(service.exportBackup()) as { data: AppData };
  json.data.appointments = json.data.appointments.map((a) => ({ ...a, payments: true }));
  json.data.transactions = paid.map((v, i) => pay(`pg-${i}`, appointment.id, v));
  await service.importBackup(JSON.stringify(json));
  const factory = async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true });
  return { factory };
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /coloração/i }));
  return screen.findByRole('dialog', { name: 'Coloração' });
}

describe('beta.4: serviço com pagamentos registrados pela 0.5', () => {
  it('concluir oferece só o que falta e lança R$ 200; reabrir avisa que o pagamento continua', async () => {
    const { factory } = await seed([10_000]);
    const user = userEvent.setup();
    window.location.hash = '#/agenda';
    render(<App storageFactory={factory} />);

    let sheet = await open(user);
    expect(within(sheet).getByText(/Lançar receita de/)).toHaveTextContent(/R\$\s200,00/);
    expect(within(sheet).getByText(/já recebidos/)).toHaveTextContent(/R\$\s100,00/);
    await user.click(within(sheet).getByRole('button', { name: /concluir atendimento/i }));
    expect(await screen.findByText(/Receita de R\$\s200,00 lançada/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Coloração' })).not.toBeInTheDocument());

    window.location.hash = '#/agenda';
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    sheet = await open(user);
    await user.click(within(sheet).getByRole('button', { name: /reabrir/i }));
    const dlg = await screen.findByRole('dialog', { name: 'Reabrir?' });
    expect(dlg).toHaveTextContent(/\(R\$\s200,00\) será removida/);
    expect(dlg).toHaveTextContent(/O pagamento registrado \(R\$\s100,00\) continua em Finanças/);
  });

  it('já pago por inteiro: não oferece lançar receita e informa o valor recebido', async () => {
    const { factory } = await seed([10_000, 20_000]);
    const user = userEvent.setup();
    window.location.hash = '#/agenda';
    render(<App storageFactory={factory} />);
    const sheet = await open(user);
    expect(within(sheet).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(sheet).getByText(/Já recebido/)).toHaveTextContent(/R\$\s300,00.*Nenhuma receita nova/);
  });

  it('excluir avisa que os pagamentos continuam em Finanças', async () => {
    const { factory } = await seed([10_000, 5_000]);
    const user = userEvent.setup();
    window.location.hash = '#/agenda';
    render(<App storageFactory={factory} />);
    const sheet = await open(user);
    await user.click(within(sheet).getByRole('button', { name: /excluir/i }));
    const dlg = await screen.findByRole('dialog', { name: /excluir/i });
    expect(dlg).toHaveTextContent(/Os 2 pagamentos registrados \(R\$\s150,00\) continuam em Finanças/);
  });
});
