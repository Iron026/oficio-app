/**
 * 0.5 — agenda inteligente: visões dia/semana/mês, navegação, duração, conflitos (avisam, nunca
 * bloqueiam), atendimento que atravessa a meia-noite e situação financeira visível.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { signed } from '../test/backupFile';
import { vi } from 'vitest';
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

async function start(seed?: (s: AppService) => Promise<void>) {
  const dbName = `agenda-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await seed?.(s);
  window.location.hash = '#/agenda';
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { user: userEvent.setup(), reload: async () => AppService.load(await createIndexedDbAdapter(dbName)) };
}
const appt = (s: AppService, title: string, date: string, time: string, duration = '60', price = '100,00') =>
  s.saveAppointment({ title, clientId: '', date, time, price, notes: '', duration }).then((r) => r.appointment);

describe('0.5: visões da agenda', () => {
  it('dia: grade de 24 h com o atendimento da noite anterior, conflito marcado e pagamento visível', async () => {
    const { user } = await start(async (s) => {
      await appt(s, 'Noiva', addDaysKey(today, -1), '23:00', '120');
      const a = await appt(s, 'Corte', today, '09:00');
      await appt(s, 'Escova', today, '09:30');
      await s.registerPayment(a.id, { amount: 4_000 });
    });
    await user.click(screen.getByRole('radio', { name: 'Dia' }));
    const grid = await screen.findByRole('list', { name: /horários de/i });
    const blocks = within(grid).getAllByRole('button');
    expect(blocks.map((b) => b.textContent)).toEqual([
      expect.stringMatching(/↑ 23:00–01:00 \(\+1 dia\).*Noiva/),
      expect.stringMatching(/09:00–10:00.*Corte.*Conflito/),
      expect.stringMatching(/09:30–10:30.*Escova.*Conflito/),
    ]);
    // Sobrepostos ficam lado a lado.
    const [corte, escova] = [blocks[1]!.parentElement!, blocks[2]!.parentElement!];
    expect(corte.style.left).not.toBe(escova.style.left);
    // Toque abre o mesmo painel do atendimento, com horário, duração e pagamento.
    await user.click(blocks[1]!);
    const sheet = await screen.findByRole('dialog', { name: 'Corte' });
    expect(sheet).toHaveTextContent(/09:00–10:00.*1 h/);
    expect(within(sheet).getByRole('region', { name: 'Pagamento' })).toHaveTextContent(/Recebido.*R\$\s40,00/);
  });

  it('navegação: setas e "Hoje"; semana de segunda a domingo; mês leva ao dia tocado', async () => {
    const { user } = await start(async (s) => { await appt(s, 'Manicure', addDaysKey(today, 1), '10:00'); });
    await user.click(screen.getByRole('radio', { name: 'Dia' }));
    const hoje = screen.getByRole('button', { name: 'Hoje' });
    expect(hoje).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
    expect(await screen.findByRole('button', { name: /10:00–11:00.*manicure/i })).toBeInTheDocument();
    expect(hoje).toBeEnabled();
    await user.click(hoje);
    await waitFor(() => expect(screen.queryByRole('button', { name: /manicure/i })).not.toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: 'Semana' }));
    const week = document.querySelector('[data-week]')!;
    expect(within(week as HTMLElement).getAllByRole('region')).toHaveLength(7);

    await user.click(screen.getByRole('radio', { name: 'Mês' }));
    const target = addDaysKey(today, 1);
    if (target.slice(0, 7) !== today.slice(0, 7)) await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    const cell = document.querySelector(`[data-month-day="${target}"]`) as HTMLElement;
    expect(cell).toHaveAccessibleName(/1 atendimento/);
    await user.click(cell);
    expect(await screen.findByRole('button', { name: /manicure/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dia' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('0.5: duração e conflitos ao agendar', () => {
  it('duração configurável; conflito avisa com quem coincide e deixa salvar mesmo assim ou mudar o horário', async () => {
    const { user, reload } = await start(async (s) => { await appt(s, 'Corte', today, '14:00', '60'); });
    await user.click(screen.getByRole('button', { name: /^agendar$/i }));
    const form = await screen.findByRole('dialog', { name: /agendar atendimento/i });
    await user.type(within(form).getByLabelText(/descrição/i), 'Coloração');
    await user.type(within(form).getByLabelText(/horário/i), '14:30');
    expect(within(form).getByLabelText(/duração/i)).toHaveValue(''); // beta.2: nada presumido
    await user.selectOptions(within(form).getByLabelText(/duração/i), '90');
    await user.click(within(form).getByRole('button', { name: /^agendar$/i }));
    const warn = await screen.findByRole('dialog', { name: /conflito de horário/i });
    expect(warn).toHaveTextContent(/Corte · 14:00–15:00/);
    await user.click(within(warn).getByRole('button', { name: /mudar horário/i }));
    expect((await reload()).data.appointments).toHaveLength(1); // não salvou; o formulário continua aberto
    const time = within(form).getByLabelText(/horário/i);
    await user.clear(time);
    await user.type(time, '15:00');
    await user.click(within(form).getByRole('button', { name: /^agendar$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /agendar atendimento/i })).not.toBeInTheDocument());
    const saved = (await reload()).data.appointments.find((a) => a.title === 'Coloração')!;
    expect(saved).toMatchObject({ time: '15:00', duration: 90, payments: true });
  });

  it('salvar mesmo assim grava o conflito sem bloquear; editar um atendimento antigo não grava duração sozinho', async () => {
    const { user, reload } = await start(async (s) => {
      await appt(s, 'Corte', today, '14:00');
      const json = JSON.parse(s.exportBackup());
      json.data.appointments.push({ id: 'old', title: 'Antigo', clientId: null, date: today, time: '08:00', price: 0, status: 'agendado', notes: '', completedAt: null, transactionId: null, createdAt: 'x', updatedAt: 'x' });
      await s.importBackup(signed(json));
    });
    await user.click(screen.getByRole('button', { name: /^agendar$/i }));
    const form = await screen.findByRole('dialog', { name: /agendar atendimento/i });
    await user.type(within(form).getByLabelText(/descrição/i), 'Encaixe');
    await user.type(within(form).getByLabelText(/horário/i), '14:15');
    await user.click(within(form).getByRole('button', { name: /^agendar$/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /conflito de horário/i })).getByRole('button', { name: /salvar mesmo assim/i }));
    await waitFor(async () => expect((await reload()).data.appointments.map((a) => a.title)).toContain('Encaixe'));

    await user.click(await screen.findByRole('button', { name: /antigo/i }));
    const sheet = await screen.findByRole('dialog', { name: 'Antigo' });
    expect(sheet).toHaveTextContent(/08:00.*Duração não informada/);
    expect(sheet).not.toHaveTextContent(/08:00–/);
    await user.click(within(sheet).getByRole('button', { name: /editar/i }));
    const edit = await screen.findByRole('dialog', { name: /editar atendimento/i });
    expect(within(edit).getByLabelText(/duração/i)).toHaveValue('');
    await user.click(within(edit).getByRole('button', { name: /salvar alterações/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /editar atendimento/i })).not.toBeInTheDocument());
    expect((await reload()).data.appointments.find((a) => a.id === 'old')!.duration).toBeUndefined();
  });
});

describe('beta.2: duração opcional e visão Dia sem rolagem automática', () => {
  it('agendar sem duração não grava duração nem presume término; não acusa conflito com quem vem depois', async () => {
    const { user, reload } = await start(async (s) => { await appt(s, 'Corte', today, '14:00', ''); });
    await user.click(screen.getByRole('button', { name: /^agendar$/i }));
    const form = await screen.findByRole('dialog', { name: /agendar atendimento/i });
    await user.type(within(form).getByLabelText(/descrição/i), 'Escova');
    await user.type(within(form).getByLabelText(/horário/i), '14:30');
    expect(within(form).getByRole('option', { name: 'Não informar' })).toBeInTheDocument();
    expect(form).toHaveTextContent(/não presume o término/);
    await user.click(within(form).getByRole('button', { name: /^agendar$/i }));
    // Sem duração no "Corte", 14:30 não é conflito: o término dele é desconhecido.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /agendar atendimento/i })).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: /conflito de horário/i })).not.toBeInTheDocument();
    const saved = (await reload()).data.appointments;
    for (const a of saved) expect('duration' in a).toBe(false);
    await user.click(screen.getByRole('radio', { name: 'Dia' }));
    const blocks = within(await screen.findByRole('list', { name: /horários de/i })).getAllByRole('button');
    expect(blocks.map((b) => b.textContent)).toEqual([expect.stringMatching(/^14:00, duração não informada.*Corte/), expect.stringMatching(/^14:30, duração não informada.*Escova/)]);
    expect(blocks.some((b) => /Conflito/.test(b.textContent ?? ''))).toBe(false);
  });

  it('editar e escolher "Não informar" apaga a duração (grava null); manter preserva', async () => {
    const { user, reload } = await start(async (s) => { await appt(s, 'Corte', today, '14:00', '90'); await appt(s, 'Manicure', today, '16:00', '45'); });
    await user.click(await screen.findByRole('button', { name: /corte/i }));
    let sheet = await screen.findByRole('dialog', { name: 'Corte' });
    await user.click(within(sheet).getByRole('button', { name: /editar/i }));
    let edit = await screen.findByRole('dialog', { name: /editar atendimento/i });
    expect(within(edit).getByLabelText(/duração/i)).toHaveValue('90');
    await user.selectOptions(within(edit).getByLabelText(/duração/i), '');
    await user.click(within(edit).getByRole('button', { name: /salvar alterações/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /editar atendimento/i })).not.toBeInTheDocument());
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: /manicure/i }));
    sheet = await screen.findByRole('dialog', { name: 'Manicure' });
    await user.click(within(sheet).getByRole('button', { name: /editar/i }));
    edit = await screen.findByRole('dialog', { name: /editar atendimento/i });
    await user.click(within(edit).getByRole('button', { name: /salvar alterações/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /editar atendimento/i })).not.toBeInTheDocument());
    const data = (await reload()).data.appointments;
    expect(data.find((a) => a.title === 'Corte')!.duration).toBeNull();
    expect(data.find((a) => a.title === 'Manicure')!.duration).toBe(45);
  });

  it('entrar na visão Dia (e trocar de dia ou de visão) não rola a página; só "Primeiro atendimento" rola', async () => {
    const scroll = vi.fn();
    window.scrollTo = scroll as unknown as typeof window.scrollTo;
    const { user } = await start(async (s) => { await appt(s, 'Noiva', today, '18:00'); await appt(s, 'Amanhã', addDaysKey(today, 1), '20:00'); });
    scroll.mockClear();
    await user.click(screen.getByRole('radio', { name: 'Dia' }));
    await screen.findByRole('list', { name: /horários de/i });
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
    await screen.findByRole('button', { name: /amanhã/i });
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    await user.click(screen.getByRole('radio', { name: 'Semana' }));
    await user.click(screen.getByRole('radio', { name: 'Dia' }));
    await screen.findByRole('button', { name: /noiva/i });
    expect(scroll).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Primeiro atendimento (18:00)' }));
    expect(scroll).toHaveBeenCalledTimes(1);
    // Outro dia: o botão acompanha o primeiro atendimento daquele dia e só rola quando tocado.
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
    await screen.findByRole('button', { name: /amanhã/i });
    expect(scroll).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Primeiro atendimento (20:00)' }));
    expect(scroll).toHaveBeenCalledTimes(2);
    window.scrollTo = () => undefined;
  });
});
