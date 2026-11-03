import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function emptyApp() {
  const dbName = `ui-vazio-${Math.random()}`;
  const service = await AppService.load(await createIndexedDbAdapter(dbName));
  await service.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true });
}

describe('estados vazios sem ação duplicada', () => {
  it('Agenda vazia: só o botão do estado vazio; com itens, o botão flutuante volta', async () => {
    const factory = await emptyApp();
    const user = userEvent.setup();
    window.location.hash = '#/agenda';
    render(<App storageFactory={factory} />);
    const cta = await screen.findByRole('button', { name: /agendar atendimento/i });
    const main = screen.getByRole('main');
    expect(within(document.body).queryByRole('button', { name: /^agendar$/i })).not.toBeInTheDocument();
    expect(within(main).getAllByRole('button', { name: /agendar/i })).toHaveLength(1);

    await user.click(cta);
    const form = await screen.findByRole('dialog');
    await user.type(within(form).getByLabelText(/descrição/i), 'Corte');
    await user.click(within(form).getByRole('button', { name: /^agendar$/i }));
    expect(await screen.findByRole('button', { name: /^agendar$/i })).toBeInTheDocument();
  });

  it('Clientes vazio: só "Cadastrar cliente"; com clientes, o botão flutuante volta', async () => {
    const factory = await emptyApp();
    const user = userEvent.setup();
    window.location.hash = '#/clientes';
    render(<App storageFactory={factory} />);
    const cta = await screen.findByRole('button', { name: /cadastrar cliente/i });
    expect(screen.queryByRole('button', { name: /^cliente$/i })).not.toBeInTheDocument();

    await user.click(cta);
    const form = await screen.findByRole('dialog', { name: /novo cliente/i });
    await user.type(within(form).getByLabelText(/^nome/i), 'Maria');
    await user.click(within(form).getByRole('button', { name: /cadastrar cliente/i }));
    expect(await screen.findByRole('button', { name: /^cliente$/i })).toBeInTheDocument();
  });
});
