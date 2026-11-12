/**
 * 0.5.0-beta.4 — tela de Lembretes: no navegador explica a limitação (sem prometer avisos com a página fechada);
 * no Android, desligado por padrão, permissão só ao ligar, recusa respeitada (sem pedir de novo sozinho).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryReminderPlatform, type NotifyPermission } from '../platform/reminders';
import { setReminderPlatform } from '../platform/reminderSync';
import { AppProvider } from '../state/AppContext';
import { AppService } from '../state/service';
import { createMemoryAdapter } from '../storage/memory';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { ToastProvider } from '../ui/Toast';
import { RemindersPage } from './settings/RemindersPage';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});
afterEach(() => setReminderPlatform(null));

async function native(initial: NotifyPermission, answer: NotifyPermission) {
  const s = await AppService.load(createMemoryAdapter());
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const m = memoryReminderPlatform(initial, answer);
  setReminderPlatform(m.platform);
  render(<ToastProvider><AppProvider service={s} persistent><RemindersPage native /></AppProvider></ToastProvider>);
  return { s, m, user: userEvent.setup() };
}
const master = () => screen.getByRole('switch', { name: /lembretes de atendimentos/i });

describe('beta.4: tela de Lembretes', () => {
  it('Android: desligado por padrão e sem pedir permissão ao abrir', async () => {
    const { m } = await native('prompt', 'granted');
    expect(master()).not.toBeChecked();
    expect(within(screen.getByRole('group', { name: /antecedência/i })).getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('switch', { name: /mostrar detalhes/i })).not.toBeChecked();
    expect(screen.getByText(/pode atrasar os avisos/i)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 10));
    expect(m.state.requests).toBe(0);
  });

  it('ligar pede a permissão uma vez; concedida, ativa com 30 minutos e permite combinar antecedências', async () => {
    const { s, m, user } = await native('prompt', 'granted');
    await user.click(master());
    await waitFor(() => expect(master()).toBeChecked());
    expect(m.state.requests).toBe(1);
    expect(s.devicePrefs.reminders).toEqual({ enabled: true, offsets: [30], showDetails: false });
    const group = screen.getByRole('group', { name: /antecedência/i });
    await user.click(within(group).getByRole('button', { name: '1 dia antes' }));
    await user.click(within(group).getByRole('button', { name: '15 minutos antes' }));
    await waitFor(() => expect(s.devicePrefs.reminders.offsets).toEqual([15, 30, 1440]));
    expect(within(group).getByRole('button', { name: '1 dia antes' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(master());
    await waitFor(() => expect(s.devicePrefs.reminders.enabled).toBe(false));
    expect(m.state.requests).toBe(1);
  });

  it('recusada: mostra o bloqueio, não liga e não pede de novo sozinho', async () => {
    const { s, m, user } = await native('prompt', 'denied');
    await user.click(master());
    expect(await screen.findByText(/estão bloqueadas no android/i)).toBeInTheDocument();
    expect(master()).not.toBeChecked();
    expect(s.devicePrefs.reminders.enabled).toBe(false);
    expect(m.state.requests).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(m.state.requests).toBe(1);
  });

  it('já bloqueada ao abrir: mostra o estado sem pedir', async () => {
    const { m } = await native('denied', 'denied');
    expect(await screen.findByText(/estão bloqueadas no android/i)).toBeInTheDocument();
    expect(m.state.requests).toBe(0);
  });

  it('navegador: explica que lembretes funcionam no app Android e não oferece o interruptor', async () => {
    const dbName = `ui-lem-${Math.random()}`;
    const s = await AppService.load(await createIndexedDbAdapter(dbName));
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    window.location.hash = '#/ajustes/lembretes';
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    expect(await screen.findByText(/lembretes funcionam no app android/i)).toBeInTheDocument();
    expect(screen.getByText(/não consegue avisar com a página fechada/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /lembretes de atendimentos/i })).not.toBeInTheDocument();
  });

  it('Ajustes lista Lembretes com o estado atual', async () => {
    const dbName = `ui-lem-${Math.random()}`;
    const s = await AppService.load(await createIndexedDbAdapter(dbName));
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    window.location.hash = '#/ajustes';
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    const row = await screen.findByRole('link', { name: /lembretes/i }).catch(() => screen.findByRole('button', { name: /lembretes/i }));
    expect(row).toHaveTextContent(/desligados/i);
  });
});
