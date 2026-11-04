import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { decideBack, popBack } from '../platform/backStack';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

let scrollY = 0;
beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = ((a: number | ScrollToOptions, b?: number) => {
    scrollY = typeof a === 'number' ? (b ?? 0) : (a.top ?? 0);
  }) as typeof window.scrollTo;
  Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
});
afterEach(() => {
  while (popBack()) { /* esvazia a pilha do Voltar entre testes */ }
});

async function seed(extra?: (s: AppService) => Promise<void>) {
  const dbName = `set-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana Souza', businessName: 'Studio', professionId: 'beleza' });
  await extra?.(s);
  return dbName;
}

async function open(hash: string, extra?: (s: AppService) => Promise<void>) {
  const dbName = await seed(extra);
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { dbName, user: userEvent.setup() };
}

const reload = async (dbName: string) => AppService.load(await createIndexedDbAdapter(dbName));
const hashIs = (h: string) => waitFor(() => expect(window.location.hash).toBe(h));

describe('Central de Ajustes — índice', () => {
  it('mostra as 6 categorias com resumos reais e abre cada página interna', async () => {
    const { user } = await open('#/ajustes');
    const index = screen.getAllByRole('button').filter((b) => /aparência e personalização|perfil e negócio|privacidade e acessibilidade|conta e sincronização|backup e dados|sobre o ofício/i.test(b.textContent ?? ''));
    expect(index).toHaveLength(6);
    expect(screen.getByRole('button', { name: /aparência e personalização.*sistema · petróleo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /perfil e negócio.*beleza/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /privacidade e acessibilidade.*valores visíveis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /backup e dados.*nenhum backup exportado/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`sobre o ofício.*v${__APP_VERSION__.replace(/\./g, '\\.')}`, 'i') })).toBeInTheDocument();
    // Nada de funções que ainda não existem.
    expect(screen.queryByText(/personalizar o painel|tela inicial|preferências da agenda/i)).not.toBeInTheDocument();

    for (const [name, hash, heading] of [
      [/aparência e personalização/i, '#/ajustes/aparencia', 'Aparência e personalização'],
      [/perfil e negócio/i, '#/ajustes/perfil', 'Perfil e negócio'],
      [/privacidade e acessibilidade/i, '#/ajustes/privacidade', 'Privacidade e acessibilidade'],
      [/conta e sincronização/i, '#/ajustes/conta', 'Conta e sincronização'],
      [/backup e dados/i, '#/ajustes/dados', 'Backup e dados'],
      [/sobre o ofício/i, '#/ajustes/sobre', 'Sobre o Ofício'],
    ] as const) {
      await user.click(screen.getByRole('button', { name }));
      await hashIs(hash);
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toHaveFocus();
      await user.click(screen.getByRole('link', { name: /^ajustes$/i }));
      await hashIs('#/ajustes');
      await screen.findByRole('button', { name: /sobre o ofício/i });
    }
  });

  it('Voltar (Android e "‹ Ajustes") leva ao índice na mesma posição de rolagem', async () => {
    const { user } = await open('#/ajustes');
    scrollY = 420;
    await user.click(screen.getByRole('button', { name: /backup e dados/i }));
    await hashIs('#/ajustes/dados');
    await screen.findByRole('button', { name: /exportar backup/i });
    // Botão Voltar do Android: a página interna volta ao índice (não ao Painel).
    expect(decideBack('ajustes', false)).toBe('handled');
    await hashIs('#/ajustes');
    await screen.findByRole('button', { name: /sobre o ofício/i });
    await waitFor(() => expect(scrollY).toBe(420));
    // No índice, o Voltar segue a regra normal (Painel).
    expect(decideBack('ajustes', false)).toBe('home');
  });

  it('Voltar fecha primeiro o painel aberto por cima da página interna', async () => {
    const { user } = await open('#/ajustes/perfil');
    await user.click(await screen.findByRole('button', { name: /selo em destaque/i }));
    await screen.findByRole('dialog', { name: /selo em destaque/i });
    act(() => void decideBack('ajustes', false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.location.hash).toBe('#/ajustes/perfil');
    act(() => void decideBack('ajustes', false));
    await hashIs('#/ajustes');
  });

  it('endereço de página desconhecida mostra o índice', async () => {
    await open('#/ajustes/nao-existe');
    expect(await screen.findByRole('button', { name: /aparência e personalização/i })).toBeInTheDocument();
  });
});

describe('Central de Ajustes — páginas internas', () => {
  it('Privacidade: link público da política (sem caminho técnico)', async () => {
    await open('#/ajustes/privacidade');
    const link = await screen.findByRole('link', { name: /ler política de privacidade/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByText(/docs\/PRIVACIDADE\.md/)).not.toBeInTheDocument();
  });

  it('ocultar valores e animações reduzidas aplicam na hora', async () => {
    const { user } = await open('#/ajustes/privacidade');
    const sw = await screen.findByRole('switch', { name: /ocultar valores/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await user.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    await user.click(screen.getByRole('radio', { name: /^reduzir$/i }));
    await waitFor(() => expect(document.documentElement.dataset.motion).toBe('reduce'));
  });

  it('Aparência: tema do aparelho e paleta com prévia, troca e restauração do Petróleo', async () => {
    const { dbName, user } = await open('#/ajustes/aparencia');
    await user.click(await screen.findByRole('radio', { name: /escuro/i }));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    await user.click(screen.getByRole('button', { name: /paleta de cores.*petróleo/i }));
    await hashIs('#/ajustes/aparencia/paleta');
    const restore = await screen.findByRole('button', { name: /restaurar petróleo/i });
    expect(restore).toBeDisabled();
    const group = screen.getByRole('radiogroup', { name: /paleta de cores/i });
    expect(within(group).getAllByRole('radio')).toHaveLength(8);
    await user.click(within(group).getByRole('radio', { name: /índigo/i }));
    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('indigo'));
    await waitFor(async () => expect((await reload(dbName)).data.settings.accent).toBe('indigo'));
    expect(restore).toBeEnabled();
    await user.click(restore);
    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('petroleo'));
    // Voltar da paleta leva à Aparência, não ao índice.
    await user.click(screen.getByRole('link', { name: /^aparência$/i }));
    await hashIs('#/ajustes/aparencia');
    document.documentElement.classList.remove('dark');
  });

  it('Perfil: avatar, selo em destaque e metas (o mesmo editor da Evolução)', async () => {
    const { user } = await open('#/ajustes/perfil');
    await user.click(await screen.findByRole('button', { name: /imagem de perfil/i }));
    const sheet = await screen.findByRole('dialog', { name: /imagem de perfil/i });
    // Sincronização de foto desligada nesta versão: o texto não pode prometer nuvem.
    expect(within(sheet).getByText(/fica só neste aparelho e no arquivo de backup/i)).toBeInTheDocument();
    expect(within(sheet).queryByText(/é sincronizada/i)).not.toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: /tesoura/i })).toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: /borrifador/i })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('radio', { name: /^medicina$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Avatar: Medicina')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /selo em destaque/i }));
    const seal = await screen.findByRole('dialog', { name: /selo em destaque/i });
    expect(within(seal).getByRole('radio', { name: /automático/i })).toHaveAttribute('aria-checked', 'true');
    expect(within(seal).getByRole('radio', { name: /carteira/i })).toBeDisabled();
    await user.click(within(seal).getByRole('button', { name: /fechar/i }));

    await user.click(screen.getByRole('button', { name: /^metas/i }));
    expect(await screen.findByRole('dialog', { name: /suas metas/i })).toBeInTheDocument();
  });

  it('o atalho de foto do índice abre a mesma "Imagem de perfil"', async () => {
    const { user } = await open('#/ajustes');
    await user.click(await screen.findByRole('button', { name: /alterar imagem de perfil/i }));
    expect(await screen.findByRole('dialog', { name: /imagem de perfil/i })).toBeInTheDocument();
  });

  it('Conta: "Sincronização e nuvem" abre a mesma folha do botão de nuvem', async () => {
    const { user } = await open('#/ajustes/conta');
    await user.click(await screen.findByRole('button', { name: /^sincronização e nuvem/i }));
    const sheet = await screen.findByRole('dialog', { name: /sincronização e nuvem/i });
    expect(within(sheet).getAllByText(/somente neste aparelho/i).length).toBeGreaterThan(0);
  });

  it('Sobre: versão real, plataforma, armazenamento e plano sem compra', async () => {
    const { user } = await open('#/ajustes/sobre');
    expect(await screen.findByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.getByText('Web (navegador)')).toBeInTheDocument();
    expect(screen.getByText('Local e persistente')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /conhecer o premium/i }));
    const sheet = await screen.findByRole('dialog', { name: /recursos do ofício/i });
    expect(within(sheet).getByText(/nenhuma compra ou assinatura está disponível/i)).toBeInTheDocument();
  });
});

describe('Backup e dados — ações destrutivas protegidas', () => {
  const withClient = async (s: AppService) => {
    await s.saveClient({ name: 'Cliente Guardada', phone: '', email: '', address: '', notes: '' });
  };

  it('Apagar todos os dados: exige digitar APAGAR; cancelar preserva tudo', async () => {
    const { dbName, user } = await open('#/ajustes/dados', withClient);
    await user.click(await screen.findByRole('button', { name: /apagar todos os dados/i }));
    const dialog = await screen.findByRole('dialog', { name: /apagar todos os dados/i });
    const ok = within(dialog).getByRole('button', { name: /apagar tudo/i });
    expect(ok).toBeDisabled();
    await user.click(ok); // toque acidental não faz nada
    await user.type(within(dialog).getByLabelText(/digite apagar/i), 'apaga');
    expect(ok).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await reload(dbName)).data.clients.map((c) => c.name)).toEqual(['Cliente Guardada']);

    // Reabrir começa sem texto digitado.
    await user.click(screen.getByRole('button', { name: /apagar todos os dados/i }));
    const again = await screen.findByRole('dialog', { name: /apagar todos os dados/i });
    expect(within(again).getByLabelText(/digite apagar/i)).toHaveValue('');
    await user.type(within(again).getByLabelText(/digite apagar/i), 'APAGAR');
    await user.click(within(again).getByRole('button', { name: /apagar tudo/i }));
    await hashIs('#/painel');
    await waitFor(async () => expect((await reload(dbName)).data.profile).toBeNull());
  });

  it('Importar: arquivo inválido não altera nada; válido mostra o resumo e cancelar preserva os dados', async () => {
    const { dbName, user } = await open('#/ajustes/dados', withClient);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['{"isto":"não é backup"}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText(/não é um backup do ofício/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /importar/i })).not.toBeInTheDocument();

    const other = await AppService.load(await createIndexedDbAdapter(`other-${Math.random()}`));
    await other.completeOnboarding({ name: 'Outra', businessName: '', professionId: 'beleza' });
    await other.saveClient({ name: 'Bruna Alves', phone: '', email: '', address: '', notes: '' });
    await other.saveClient({ name: 'Carla Dias', phone: '', email: '', address: '', notes: '' });
    await user.upload(input, new File([other.exportBackup()], 'b.json', { type: 'application/json' }));
    const dialog = await screen.findByRole('dialog', { name: /importar e restaurar/i });
    const clientsRow = within(dialog).getByText('Clientes').parentElement!;
    expect(within(clientsRow).getByText('1')).toBeInTheDocument(); // agora
    expect(within(clientsRow).getByText('2')).toBeInTheDocument(); // no arquivo
    expect(within(dialog).getByText(/cópia de segurança/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const after = await reload(dbName);
    expect(after.data.clients.map((c) => c.name)).toEqual(['Cliente Guardada']);
    expect(after.data.profile?.name).toBe('Ana Souza');
  });

  it('cópias de segurança automáticas: lista real (vazia no início)', async () => {
    const { user } = await open('#/ajustes/dados');
    await user.click(await screen.findByRole('button', { name: /cópias de segurança automáticas.*0/i }));
    const sheet = await screen.findByRole('dialog', { name: /cópias de segurança automáticas/i });
    expect(within(sheet).getByText(/nenhuma cópia automática ainda/i)).toBeInTheDocument();
  });
});
