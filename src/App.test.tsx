import { render, screen, within } from '@testing-library/react';
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
