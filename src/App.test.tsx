import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createIndexedDbAdapter } from './storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

describe('fluxo principal', () => {
  it('cadastro inicial, adaptação à profissão e persistência após recarregar', async () => {
    const dbName = `ui-${Math.random()}`;
    const factory = async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true });
    const user = userEvent.setup();
    const { unmount } = render(<App storageFactory={factory} />);

    await user.click(await screen.findByRole('button', { name: /começar/i }));
    await user.click(screen.getByRole('radio', { name: /alimentação/i }));
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    // validação: nome obrigatório
    await user.click(screen.getByRole('button', { name: /entrar no ofício/i }));
    expect(await screen.findByText(/como podemos te chamar\?/i, { selector: '[role=alert]' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/seu nome/i), 'Joana');
    await user.click(screen.getByRole('button', { name: /entrar no ofício/i }));
    // beta.5: configuração inicial opcional logo depois do cadastro.
    await user.click(within(await screen.findByRole('dialog', { name: /sugestões para alimentação/i })).getByRole('button', { name: 'Pular' }));

    expect(await screen.findByText('Joana')).toBeInTheDocument();
    // terminologia de alimentação
    expect(screen.getByText(/encomendas na semana/i)).toBeInTheDocument();

    // cadastra cliente pelo atalho
    await user.click(screen.getByRole('button', { name: /^cliente$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^nome/i), 'Carla');
    await user.click(within(dialog).getByRole('button', { name: /cadastrar cliente/i }));
    expect(await screen.findByText(/cliente cadastrado/i)).toBeInTheDocument();

    unmount();
    window.location.hash = '#/clientes';
    render(<App storageFactory={factory} />);
    expect(await screen.findByText('Carla')).toBeInTheDocument();
  });
});

describe('Android: botão Voltar fecha painéis', () => {
  it('painel aberto registra-se na pilha de voltar e fecha com popBack', async () => {
    const { popBack } = await import('./platform/backStack');
    const dbName = `ui-back-${Math.random()}`;
    const factory = async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true });
    const user = userEvent.setup();
    window.location.hash = '#/painel';
    render(<App storageFactory={factory} />);
    await user.click(await screen.findByRole('button', { name: /começar/i }));
    // no passo de profissão, Voltar retorna às boas-vindas
    expect(popBack()).toBe(true);
    expect(await screen.findByRole('button', { name: /começar/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /começar/i }));
    await user.click(screen.getByRole('radio', { name: /limpeza/i }));
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    await user.type(screen.getByLabelText(/seu nome/i), 'Rita');
    await user.click(screen.getByRole('button', { name: /entrar no ofício/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /sugestões para limpeza/i })).getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByText('Rita');
    await user.click(screen.getByRole('button', { name: /^agendar$/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(popBack()).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
