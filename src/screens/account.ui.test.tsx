import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { FakeAuth, type CloudUser } from '../cloud/auth';
import type { Cloud } from '../cloud';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { MemoryRemote } from '../sync/memoryRemote';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const ANA: CloudUser = { uid: 'uid-ana', name: 'Ana Souza', email: 'ana@example.com', photoURL: null };

function setup(opts: { dbName?: string; remote?: MemoryRemote; auth?: FakeAuth } = {}) {
  const dbName = opts.dbName ?? `acc-${Math.random()}`;
  const remote = opts.remote ?? new MemoryRemote();
  const auth = opts.auth ?? new FakeAuth();
  auth.next = ANA;
  const storageFactory = async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true });
  const cloudFactory = async (): Promise<Cloud> => ({ auth, remote, projectId: 'demo' });
  return { dbName, remote, auth, storageFactory, cloudFactory };
}

async function seedLocal(dbName: string) {
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await s.saveClient({ name: 'Cliente Local', phone: '', email: '', address: '', notes: '' });
  await s.saveTransaction({ type: 'receita', amount: '120,00', description: 'Corte', category: 'Atendimento', date: '2026-11-02' });
}

async function openSettings(t: ReturnType<typeof setup>) {
  window.location.hash = '#/ajustes';
  const view = render(<App storageFactory={t.storageFactory} cloudFactory={t.cloudFactory} />);
  await screen.findByText('Conta e sincronização');
  return view;
}

describe('Conta Google e sincronização (interface)', () => {
  it('login → explica o que será sincronizado → conecta e confirma backup na nuvem', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    await openSettings(t);

    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    const sheet = await screen.findByRole('dialog', { name: /conectar seus dados/i });
    expect(within(sheet).getByText(/cópia dos seus dados do Ofício/i)).toBeInTheDocument();
    expect(within(sheet).getByText(/guarda uma cópia de segurança/i)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /enviar e conectar/i }));

    expect(await screen.findByText('Sincronizado')).toBeInTheDocument();
    expect(screen.getByText(/último backup confirmado na nuvem/i)).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(await t.remote.hasData('uid-ana')).toBe(true);
  });

  it('cancelar a escolha de conta não altera nada', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    t.auth.next = 'cancel';
    const user = userEvent.setup();
    await openSettings(t);
    t.auth.next = 'cancel';
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    expect(await screen.findByText(/login cancelado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar com google/i })).toBeInTheDocument();
    expect(await t.remote.hasData('uid-ana')).toBe(false);
  });

  it('cancelar o assistente de associação: sai da conta e não envia nada', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    await openSettings(t);
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    const sheet = await screen.findByRole('dialog', { name: /conectar seus dados/i });
    await user.click(within(sheet).getByRole('button', { name: /^cancelar$/i }));
    expect(await screen.findByText(/conexão cancelada/i)).toBeInTheDocument();
    expect(t.auth.current()).toBeNull();
    expect(await t.remote.hasData('uid-ana')).toBe(false);
  });

  it('sessão persiste ao reabrir o app (continua conectado e sincronizado)', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    const first = await openSettings(t);
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /conectar seus dados/i })).getByRole('button', { name: /enviar e conectar/i }));
    await screen.findByText('Sincronizado');
    first.unmount();

    // Reabertura: mesma sessão (FakeAuth mantém o usuário) e mesmo armazenamento.
    await openSettings(t);
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    expect(await screen.findByText('Sincronizado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('recuperação em nova instalação pela tela de boas-vindas', async () => {
    const remote = new MemoryRemote();
    const a = setup({ remote });
    await seedLocal(a.dbName);
    const user = userEvent.setup();
    const first = await openSettings(a);
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /conectar seus dados/i })).getByRole('button', { name: /enviar e conectar/i }));
    await screen.findByText('Sincronizado');
    first.unmount();

    const b = setup({ remote }); // celular novo, app recém-instalado
    window.location.hash = '#/painel';
    render(<App storageFactory={b.storageFactory} cloudFactory={b.cloudFactory} />);
    await user.click(await screen.findByRole('button', { name: /recuperar com google/i }));
    const sheet = await screen.findByRole('dialog', { name: /recuperar seus dados/i });
    expect(within(sheet).getByText('1 clientes')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /^recuperar$/i }));
    expect(await screen.findByText('Ana', { selector: 'h2' })).toBeInTheDocument(); // painel com o perfil recuperado
    window.location.hash = '#/clientes';
    expect(await screen.findByText('Cliente Local')).toBeInTheDocument();
  });

  it('desconectar mantém os dados no aparelho', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    await openSettings(t);
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /conectar seus dados/i })).getByRole('button', { name: /enviar e conectar/i }));
    await screen.findByText('Sincronizado');
    await user.click(screen.getByRole('button', { name: /^desconectar$/i }));
    const confirm = await screen.findByRole('dialog', { name: /desconectar conta/i });
    expect(within(confirm).getByText(/continuam neste aparelho/i)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: /^desconectar$/i }));
    expect(await screen.findByRole('button', { name: /continuar com google/i })).toBeInTheDocument();
    window.location.hash = '#/clientes';
    expect(await screen.findByText('Cliente Local')).toBeInTheDocument();
    expect(await t.remote.hasData('uid-ana')).toBe(true);
  });

  it('excluir conta pede confirmação clara e apaga os dados da nuvem', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    await openSettings(t);
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /conectar seus dados/i })).getByRole('button', { name: /enviar e conectar/i }));
    await screen.findByText('Sincronizado');
    await user.click(screen.getByRole('button', { name: /excluir conta e dados na nuvem/i }));
    const confirm = await screen.findByRole('dialog', { name: /excluir conta/i });
    expect(within(confirm).getByText(/não pode ser desfeita/i)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: /excluir permanentemente/i }));
    await waitFor(() => expect(t.auth.deleted).toEqual(['uid-ana']));
    expect(await t.remote.hasData('uid-ana')).toBe(false);
    window.location.hash = '#/clientes';
    expect(await screen.findByText('Cliente Local')).toBeInTheDocument();
  });

  it('sem Firebase configurado: informa que os dados ficam só no aparelho', async () => {
    window.location.hash = '#/ajustes';
    const dbName = `acc-${Math.random()}`;
    await seedLocal(dbName);
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    expect(await screen.findByText(/conta google em breve/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continuar com google/i })).not.toBeInTheDocument();
  });
});
