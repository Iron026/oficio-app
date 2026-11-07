import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { DEFAULT_DEVICE_PREFS, readDevicePrefs } from '../domain/preferences';
import { toDateKey } from '../lib/dates';
import { hapticSuccess } from '../platform/native';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function start(hash: string, seed?: (s: AppService) => Promise<void>) {
  const dbName = `s26-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await seed?.(s);
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { user: userEvent.setup(), reload: async () => AppService.load(await createIndexedDbAdapter(dbName)) };
}
const today = toDateKey(new Date());
const seedCompletedWithoutIncome = async (s: AppService) => {
  const { appointment } = await s.saveAppointment({ title: 'Coloração', clientId: '', date: today, time: '', price: '300,00', notes: '' });
  await s.completeAppointment(appointment.id, { registerIncome: true });
  await s.deleteTransaction(s.data.transactions[0]!.id);
};

describe('beta.5: atendimento concluído sem receita', () => {
  it('0.5: a agenda mostra "A receber"; registrar o pagamento lança uma vez e o aviso oferece Desfazer', async () => {
    const { user, reload } = await start('#/agenda', seedCompletedWithoutIncome);
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    const item = await screen.findByRole('button', { name: /coloração/i });
    expect(item).toHaveTextContent(/A receber R\$\s300,00/);
    await user.click(item);
    const sheet = await screen.findByRole('dialog', { name: 'Coloração' });
    expect(within(sheet).getByRole('region', { name: 'Pagamento' })).toHaveTextContent(/Pendente.*R\$\s300,00/);
    await user.click(within(sheet).getByRole('button', { name: /^registrar pagamento$/i }));
    const pay = await screen.findByRole('dialog', { name: /registrar pagamento/i });
    await user.click(within(pay).getByRole('button', { name: /usar o que falta/i }));
    await user.click(within(pay).getByRole('button', { name: /^registrar pagamento$/i }));

    expect(await screen.findByText(/Pagamento de R\$\s300,00 registrado/)).toBeInTheDocument();
    let s = await reload();
    expect(s.data.transactions.map((t) => t.amount)).toEqual([30_000]);
    expect(s.data.appointments[0]).toMatchObject({ status: 'concluido' });

    await user.click(screen.getByRole('button', { name: /^desfazer/i }));
    expect(await screen.findByText('Ação desfeita')).toBeInTheDocument();
    s = await reload();
    expect(s.data.transactions).toEqual([]);
    expect(s.data.appointments[0]).toMatchObject({ status: 'concluido' });
  });

  it('excluir o pagamento em Finanças avisa que volta a ficar a receber (e sugere estornar); Desfazer devolve', async () => {
    const { user, reload } = await start('#/financas', async (s) => {
      const { appointment } = await s.saveAppointment({ title: 'Escova', clientId: '', date: today, time: '', price: '50,00', notes: '' });
      await s.completeAppointment(appointment.id, { registerIncome: true });
    });
    await user.click(await screen.findByRole('button', { name: /escova/i }));
    await user.click(await screen.findByRole('button', { name: /excluir/i }));
    const dlg = await screen.findByRole('dialog', { name: /excluir lançamento/i });
    expect(dlg).toHaveTextContent(/continua concluído, e este valor volta a ficar a receber.*Estornar/);
    await user.click(within(dlg).getByRole('button', { name: /^excluir$/i }));
    await user.click(await screen.findByRole('button', { name: /^desfazer/i }));
    await screen.findByText('Ação desfeita');
    const s = await reload();
    expect(s.data.transactions.map((t) => t.amount)).toEqual([5_000]);
    expect(s.data.transactions[0]!.appointmentId).toBe(s.data.appointments[0]!.id);
  });

  it('concluir mostra Desfazer; desfazer volta o atendimento para agendado sem receita', async () => {
    const { user, reload } = await start('#/agenda', async (s) => {
      await s.saveAppointment({ title: 'Corte', clientId: '', date: today, time: '', price: '60,00', notes: '' });
    });
    await user.click(await screen.findByRole('button', { name: /corte/i }));
    const sheet = await screen.findByRole('dialog', { name: 'Corte' });
    await user.click(within(sheet).getByRole('button', { name: /concluir atendimento/i }));
    const done = await screen.findByRole('dialog', { name: /concluir: corte/i });
    await user.click(within(done).getByRole('radio', { name: /recebi tudo que faltava/i }));
    await user.click(within(done).getByRole('button', { name: /concluir atendimento/i }));
    // Primeira conclusão: conquista e nível novos chegam num aviso só (no máximo 2 avisos).
    await screen.findByText(/conquista: primeiro atendimento/i);
    const toasts = document.querySelectorAll('[data-toast]');
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toHaveTextContent(/\+\d+ XP/);
    expect(toasts[1]).not.toHaveTextContent(/XP/);
    await user.click(await screen.findByRole('button', { name: /^desfazer/i }));
    await screen.findByText('Ação desfeita');
    const s = await reload();
    expect(s.data.appointments[0]).toMatchObject({ status: 'agendado', transactionId: null });
    expect(s.data.transactions).toEqual([]);
  });
});

describe('8. vibração desligada por padrão', () => {
  it('padrão e quem atualiza de versões anteriores ficam sem vibração; só true explícito liga', () => {
    expect(DEFAULT_DEVICE_PREFS.haptics).toBe(false);
    expect(readDevicePrefs(undefined, 'system').haptics).toBe(false);
    expect(readDevicePrefs({ version: 1, theme: 'dark', density: 'compacta', hideValues: false, motion: 'sistema' }, undefined).haptics).toBe(false);
    expect(readDevicePrefs({ haptics: 'sim' }, undefined).haptics).toBe(false);
    expect(readDevicePrefs({ haptics: true }, undefined).haptics).toBe(true);
  });

  it('desligada, nenhuma chamada nativa é feita', async () => {
    const cap = (window as unknown as { Capacitor?: unknown }).Capacitor;
    const perform = vi.fn(async () => ({ performed: true }));
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: () => ({ perform }), Plugins: {} };
    try {
      await hapticSuccess(false, true);
      expect(perform).not.toHaveBeenCalled();
    } finally {
      (window as unknown as { Capacitor?: unknown }).Capacitor = cap;
    }
  });

  it('Ajustes › Privacidade e acessibilidade: interruptor "Vibração" começa desligado e grava a escolha só no aparelho', async () => {
    const { user, reload } = await start('#/ajustes/privacidade');
    const sw = await screen.findByRole('switch', { name: /vibração/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await user.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await waitFor(async () => expect((await reload()).devicePrefs.haptics).toBe(true));
    expect(JSON.parse((await reload()).exportBackup()).data.settings.haptics).toBeUndefined(); // não vai para o backup
  });
});
