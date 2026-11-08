/**
 * 0.5.0-beta.3 — recorrência na interface: criar pela Agenda, ver a regra, escolher o alcance (nada
 * pré-selecionado) ao editar e ao cancelar, e a visão Dia continuar abrindo no topo.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from '../App';
import { addDaysKey, weekdayIndex } from '../domain/agenda';
import { seriesOf } from '../domain/recurrence';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const today = toDateKey(new Date());

async function start(seed?: (s: AppService) => Promise<void>) {
  const dbName = `ui-rec-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await seed?.(s);
  window.location.hash = '#/agenda';
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { user: userEvent.setup(), reload: async () => AppService.load(await createIndexedDbAdapter(dbName)) };
}
const weekly = (s: AppService) => s.saveAppointment({ title: 'Manicure', clientId: '', date: today, time: '10:00', price: '50,00', notes: '', duration: '', repeat: { freq: 'semanal', interval: '1', days: [weekdayIndex(today)], end: 'vezes', until: '', count: '4' } });

describe('beta.3: recorrência na Agenda', () => {
  it('agendar toda semana, 4 vezes: cria as datas, mostra "recorrente" e a regra no painel', async () => {
    const { user, reload } = await start();
    await user.click(screen.getByRole('button', { name: /^agendar atendimento$/i }));
    const form = await screen.findByRole('dialog', { name: /agendar atendimento/i });
    await user.type(within(form).getByLabelText(/descrição/i), 'Manicure');
    await user.selectOptions(within(form).getByLabelText(/^repetir/i), 'semanal');
    expect(within(form).getByRole('button', { name: ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][weekdayIndex(today)] })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(form).getByRole('radio', { name: /depois de n vezes/i }));
    await user.type(within(form).getByLabelText(/quantas vezes/i), '4');
    await user.click(within(form).getByRole('button', { name: /^agendar$/i }));
    expect(await screen.findByText('Atendimentos recorrentes agendados')).toBeInTheDocument();
    const data = (await reload()).data.appointments;
    expect(data.map((a) => a.date).sort()).toEqual([0, 7, 14, 21].map((n) => addDaysKey(today, n)));
    expect(data.filter((a) => !seriesOf(a)!.auto)).toHaveLength(1);
    const items = await screen.findAllByRole('button', { name: /manicure/i });
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByRole('img', { name: 'Recorrente' })).toBeInTheDocument();
    await user.click(items[0]!);
    const panel = await screen.findByRole('dialog', { name: 'Manicure' });
    expect(panel).toHaveTextContent(/Repete.*Toda semana.*4 vezes/);
  });

  it('cancelar pede o alcance (nada marcado); "esta e as próximas" encerra a série e oferece Desfazer', async () => {
    const { user, reload } = await start(async (s) => { await weekly(s); });
    const items = await screen.findAllByRole('button', { name: /manicure/i });
    await user.click(items[1]!);
    const panel = await screen.findByRole('dialog', { name: 'Manicure' });
    await user.click(within(panel).getByRole('button', { name: /^cancelar$/i }));
    const scope = await screen.findByRole('dialog', { name: /cancelar atendimento recorrente/i });
    expect(within(scope).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    const go = within(scope).getByRole('button', { name: /cancelar atendimentos/i });
    expect(go).toBeDisabled();
    await user.click(within(scope).getByRole('radio', { name: /esta e as próximas/i }));
    await user.click(go);
    await screen.findByRole('button', { name: /^desfazer: esta e as próximas canceladas/i });
    const data = (await reload()).data.appointments;
    expect(data.filter((a) => a.status === 'agendado')).toHaveLength(1);
    expect(data.filter((a) => a.status === 'cancelado')).toHaveLength(1);
    expect(data).toHaveLength(2); // as duas seguintes, intocadas e sem pagamento, saíram
  });

  it('editar "só esta" usa o formulário comum; "toda a série" trava a data e mostra a repetição', async () => {
    const { user } = await start(async (s) => { await weekly(s); });
    await user.click((await screen.findAllByRole('button', { name: /manicure/i }))[2]!);
    const panel = await screen.findByRole('dialog', { name: 'Manicure' });
    await user.click(within(panel).getByRole('button', { name: /editar/i }));
    let scope = await screen.findByRole('dialog', { name: /editar atendimento recorrente/i });
    await user.click(within(scope).getByRole('radio', { name: /toda a série/i }));
    await user.click(within(scope).getByRole('button', { name: /continuar/i }));
    const form = await screen.findByRole('dialog', { name: 'Editar toda a série' });
    expect(within(form).getByLabelText(/data \(desta\)/i)).toBeDisabled();
    expect(within(form).getByLabelText(/^repetir/i)).toHaveValue('semanal');
    await user.keyboard('{Escape}');
    await user.click((await screen.findAllByRole('button', { name: /manicure/i }))[2]!);
    await user.click(within(await screen.findByRole('dialog', { name: 'Manicure' })).getByRole('button', { name: /editar/i }));
    scope = await screen.findByRole('dialog', { name: /editar atendimento recorrente/i });
    await user.click(within(scope).getByRole('radio', { name: /só esta/i }));
    await user.click(within(scope).getByRole('button', { name: /continuar/i }));
    const one = await screen.findByRole('dialog', { name: /editar atendimento$/i });
    expect(within(one).queryByLabelText(/^repetir/i)).not.toBeInTheDocument();
    expect(within(one).getByLabelText(/^data$/i)).toBeEnabled();
  });

  it('com séries, a visão Dia continua abrindo no topo, sem rolagem automática', async () => {
    const scroll = vi.fn();
    window.scrollTo = scroll as unknown as typeof window.scrollTo;
    const { user } = await start(async (s) => { await weekly(s); });
    scroll.mockClear();
    await user.click(screen.getByRole('radio', { name: 'Dia' }));
    await screen.findByRole('list', { name: /horários de/i });
    expect(scroll).not.toHaveBeenCalled();
    window.scrollTo = () => undefined;
  });
});
