import { act, render, screen, waitFor, within } from '@testing-library/react';
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

describe('auditoria: proteção na troca de conta e desconexão (interface)', () => {
  async function connected(t: ReturnType<typeof setup>) {
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    const view = await openSettings(t);
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /conectar seus dados/i })).getByRole('button', { name: /enviar e conectar/i }));
    await screen.findByText('Sincronizado');
    return { user, view };
  }

  it('sessão encerrada: mostra a conta associada; outra conta é recusada sem misturar dados', async () => {
    const t = setup();
    const { user } = await connected(t);
    await act(() => t.auth.signOut()); // sessão expira
    expect(await screen.findByText(/associado a ana@example.com/i)).toBeInTheDocument();
    t.auth.next = { uid: 'uid-bruno', name: 'Bruno', email: 'bruno@example.com', photoURL: null };
    await user.click(screen.getByRole('button', { name: /entrar novamente com google/i }));
    expect(await screen.findByText(/associado a outra conta/i)).toBeInTheDocument();
    expect(t.auth.current()).toBeNull();
    expect(await t.remote.hasData('uid-bruno')).toBe(false);
  });

  it('desconectar sem internet avisa sobre alterações não enviadas', async () => {
    const t = setup();
    const { user } = await connected(t);
    t.remote.offline = true;
    window.location.hash = '#/clientes';
    await user.click(await screen.findByRole('button', { name: /^cliente$/i }));
    const form = await screen.findByRole('dialog', { name: /novo cliente/i });
    await user.type(within(form).getByLabelText(/^nome/i), 'Sem rede');
    await user.click(within(form).getByRole('button', { name: /cadastrar cliente/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /novo cliente/i })).not.toBeInTheDocument());
    window.location.hash = '#/ajustes';
    await user.click(await screen.findByRole('button', { name: /^desconectar$/i }));
    const confirm = await screen.findByRole('dialog', { name: /desconectar conta/i });
    expect(within(confirm).getByText(/ainda não fo(i|ram) enviada/i)).toBeInTheDocument();
  });
});

describe('Ciclo de vida ao desmontar (regressão: setState após o fim do ambiente)', () => {
  afterEach(() => vi.useRealTimers());

  it('desmontar o app com um aviso ainda visível não deixa temporizadores ativos', async () => {
    // Só setTimeout/clearTimeout são simulados; o tempo real continua correndo para o IndexedDB e o Testing Library.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const errors = vi.spyOn(console, 'error');
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = await openSettings(t);

    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    const sheet = await screen.findByRole('dialog', { name: /conectar seus dados/i });
    await user.click(within(sheet).getByRole('button', { name: /enviar e conectar/i }));
    expect(await screen.findByText('Conta conectada')).toBeInTheDocument(); // aviso de 3,2 s pendente

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('Sincronização e nuvem (botão de nuvem do topo)', () => {
  it('sem conta conectada: o botão abre a folha e diz que os dados ficam só no aparelho', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    await openSettings(t);
    await user.click(screen.getByRole('button', { name: /sincronização e nuvem: somente neste aparelho/i }));
    const sheet = await screen.findByRole('dialog', { name: /sincronização e nuvem/i });
    expect(within(sheet).getAllByText(/somente neste aparelho/i).length).toBeGreaterThan(0);
    expect(within(sheet).getByText(/só neste aparelho e no backup/i)).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /sincronizar agora/i })).not.toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /conectar conta google/i })).toBeInTheDocument();
  });

  it('conectada: mostra sincronizado sem pendências; com alteração nova, o topo indica pendente', async () => {
    const t = setup();
    await seedLocal(t.dbName);
    const user = userEvent.setup();
    await openSettings(t);
    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /conectar seus dados/i })).getByRole('button', { name: /enviar e conectar/i }));
    await screen.findByText('Sincronizado');
    await user.click(screen.getByRole('button', { name: /sincronização e nuvem: sincronizado/i }));
    const sheet = await screen.findByRole('dialog', { name: /sincronização e nuvem/i });
    expect(within(sheet).getByText('Nenhuma alteração aguardando envio')).toBeInTheDocument();
    expect(within(sheet).getByText(/última sincronização confirmada/i)).toBeInTheDocument();
    expect(within(sheet).getByText('ana@example.com', { exact: false })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /sincronizar agora/i }));
    expect(await within(sheet).findByText('Nenhuma alteração aguardando envio')).toBeInTheDocument();
    // a nuvem não "mente": rede fora → nova alteração fica pendente, não sincronizada
    t.remote.offline = true;
    await user.click(within(sheet).getByRole('button', { name: /fechar/i }));
    await user.click(screen.getByRole('navigation').querySelector('a[href="#/painel"]') as HTMLElement);
    await user.click(await screen.findByRole('button', { name: /^cliente$/i }));
    const form = await screen.findByRole('dialog', { name: /novo cliente/i });
    await user.type(within(form).getByLabelText(/^nome/i), 'Cliente Novo');
    await user.click(within(form).getByRole('button', { name: /cadastrar cliente/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /sincronização e nuvem: (aguardando conexão|alterações pendentes)/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /sincronização e nuvem: sincronizado/i })).not.toBeInTheDocument();
  });
});
