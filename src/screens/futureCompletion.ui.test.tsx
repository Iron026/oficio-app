import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { addDays, toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function seed() {
  const dbName = `ui-fut-${Math.random()}`;
  const service = await AppService.load(await createIndexedDbAdapter(dbName));
  await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const base = { clientId: '', time: '', notes: '' };
  await service.saveAppointment({ ...base, title: 'Corte amanhã', date: toDateKey(addDays(new Date(), 1)), price: '60,00' });
  await service.saveAppointment({ ...base, title: 'Escova hoje', date: toDateKey(new Date()), price: '50,00' });
  await service.saveAppointment({ ...base, title: 'Manicure ontem', date: toDateKey(addDays(new Date(), -1)), price: '40,00' });
  const factory = async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true });
  return { factory };
}

async function openAndComplete(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: new RegExp(title, 'i') }));
  const sheet = await screen.findByRole('dialog', { name: title });
  await user.click(within(sheet).getByRole('button', { name: /concluir atendimento/i }));
}

describe('aviso ao concluir serviço com data futura', () => {
  it('mostra o aviso, permite voltar e depois concluir mesmo assim; Finanças marca "Data futura"', async () => {
    const { factory } = await seed();
    const user = userEvent.setup();
    window.location.hash = '#/agenda';
    render(<App storageFactory={factory} />);

    await openAndComplete(user, 'Corte amanhã');
    const aviso = await screen.findByRole('dialog', { name: 'Data futura' });
    expect(within(aviso).getByText(/está agendado para uma data futura/i)).toBeInTheDocument();

    // 2. Voltar: nada muda
    await user.click(within(aviso).getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Data futura' })).not.toBeInTheDocument());
    const sheet = screen.getByRole('dialog', { name: 'Corte amanhã' });
    expect(within(sheet).getByRole('button', { name: /concluir atendimento/i })).toBeInTheDocument();

    // 3. Concluir mesmo assim
    await user.click(within(sheet).getByRole('button', { name: /concluir atendimento/i }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Data futura' })).getByRole('button', { name: /concluir mesmo assim/i }));
    expect(await screen.findByText(/atendimento concluído!/i)).toBeInTheDocument();

    // 5. Indicador discreto em Finanças
    window.location.hash = '#/financas';
    const badge = await screen.findByTestId('data-futura');
    expect(badge).toHaveTextContent(/data futura/i);
    expect(screen.getByText('Corte amanhã')).toBeInTheDocument();
  });

  it('4. serviço de hoje ou de data anterior conclui sem aviso e sem indicador', async () => {
    const { factory } = await seed();
    const user = userEvent.setup();
    window.location.hash = '#/agenda';
    render(<App storageFactory={factory} />);

    for (const title of ['Escova hoje', 'Manicure ontem']) {
      await openAndComplete(user, title);
      expect(screen.queryByRole('dialog', { name: 'Data futura' })).not.toBeInTheDocument();
      // concluído direto: o painel fecha sem passar por confirmação
      await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument());
      expect(screen.queryByRole('dialog', { name: 'Data futura' })).not.toBeInTheDocument();
    }
    window.location.hash = '#/financas';
    await screen.findByText('Escova hoje');
    expect(screen.getByText('Manicure ontem')).toBeInTheDocument();
    expect(screen.queryByTestId('data-futura')).not.toBeInTheDocument();
  });
});
