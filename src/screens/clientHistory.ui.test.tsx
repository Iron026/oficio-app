/**
 * 0.5.0-beta.3 — histórico do cliente na interface: resumo financeiro, próximos, linha do tempo navegável
 * (abre o atendimento e o lançamento) e "Ocultar valores".
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { addDaysKey } from '../domain/agenda';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const today = toDateKey(new Date());

async function start(hide = false) {
  const dbName = `ui-ch-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const { client } = await s.saveClient({ name: 'Carla Mendes', phone: '', email: '', address: '', notes: '' });
  const ap = (title: string, date: string, price: string) => s.saveAppointment({ title, clientId: client.id, date, time: '10:00', price, notes: '' }).then((r) => r.appointment);
  const corte = await ap('Corte', addDaysKey(today, -10), '60,00');
  await s.completeAppointment(corte.id, { payment: { mode: 'parcial', amount: 2_000 } });
  const escova = await ap('Escova', addDaysKey(today, 5), '80,00');
  await s.registerPayment(escova.id, { amount: 3_000, date: today });
  if (hide) await s.updateDevicePrefs({ hideValues: true });
  window.location.hash = '#/clientes';
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /carla mendes/i }));
  return { user, sheet: await screen.findByRole('dialog', { name: 'Carla Mendes' }) };
}

describe('beta.3: histórico do cliente', () => {
  it('resumo com recebido (inclui antecipado), pendente e último atendimento; linha do tempo abre o lançamento', async () => {
    const { user, sheet } = await start();
    const summary = within(sheet).getByLabelText('Resumo do cliente');
    expect(summary).toHaveTextContent(/atendimentos concluídos\s*1/i);
    expect(summary).toHaveTextContent(/Contratado\s*R\$\s60,00/);
    expect(summary).toHaveTextContent(/Recebido\s*R\$\s50,00\s*inclui R\$\s30,00 antecipado/);
    expect(summary).toHaveTextContent(/Pendente\s*R\$\s40,00/);
    expect(within(sheet).getByRole('region', { name: 'Próximos' })).toHaveTextContent(/Escova/);
    const timeline = within(sheet).getByRole('list', { name: 'Histórico do cliente' });
    // Mais recente primeiro: os dois pagamentos foram registrados hoje; o Corte foi há 10 dias.
    expect(within(timeline).getAllByRole('button').map((b) => b.getAttribute('data-timeline'))).toEqual(['antecipado', 'parcial', 'atendimento']);
    await user.click(within(timeline).getByRole('button', { name: /pagamento parcial/i }));
    expect(await screen.findByRole('dialog', { name: /editar lançamento/i })).toBeInTheDocument();
  });

  it('a linha do tempo abre o atendimento; "Ocultar valores" mascara o resumo e o histórico', async () => {
    const { user, sheet } = await start(true);
    expect(within(sheet).getByLabelText('Resumo do cliente')).not.toHaveTextContent(/R\$\s\d/);
    expect(within(sheet).getByRole('list', { name: 'Histórico do cliente' })).not.toHaveTextContent(/R\$\s\d/);
    await user.click(within(sheet).getByRole('button', { name: /^corte/i }));
    expect(await screen.findByRole('dialog', { name: 'Corte' })).toBeInTheDocument();
  });
});
