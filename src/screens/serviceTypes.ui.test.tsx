import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function open(hash: string) {
  const dbName = `stp-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { dbName, user: userEvent.setup() };
}
const reload = async (dbName: string) => AppService.load(await createIndexedDbAdapter(dbName));

describe('Tipos de serviço na agenda', () => {
  it('criar e fixar no "Gerenciar" do agendamento não agenda nada; o atalho preenche nome e valor', async () => {
    const { dbName, user } = await open('#/painel');
    await user.click(await screen.findByRole('button', { name: /^agendar$/i }));
    const form = await screen.findByRole('dialog', { name: /agendar/i });
    await user.click(within(form).getByRole('button', { name: /gerenciar/i }));
    const mgr = await screen.findByRole('dialog', { name: /tipos de serviço/i });
    await user.click(within(mgr).getByRole('button', { name: /adicionar tipo de serviço/i }));
    await user.type(within(mgr).getByLabelText(/nome do serviço/i), 'Hora de trabalho');
    await user.type(within(mgr).getByLabelText(/valor sugerido/i), '80,00');
    await user.click(within(mgr).getByRole('button', { name: /^adicionar$/i }));
    await within(mgr).findByText('Hora de trabalho');
    // Salvar o tipo não envia o agendamento que está por baixo.
    expect((await reload(dbName)).data.appointments).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: /agendar/i })).toBeInTheDocument();

    await user.click(within(mgr).getByRole('button', { name: /^fixar hora de trabalho$/i }));
    await waitFor(async () => expect((await reload(dbName)).data.serviceTypes[0]?.pinned).toBe(true));
    // Nome repetido é recusado com mensagem clara.
    await user.click(within(mgr).getByRole('button', { name: /adicionar tipo de serviço/i }));
    await user.type(within(mgr).getByLabelText(/nome do serviço/i), 'hora de TRABALHO');
    await user.click(within(mgr).getByRole('button', { name: /^adicionar$/i }));
    expect(await within(mgr).findByText(/já existe um serviço com esse nome/i)).toBeInTheDocument();
    await user.click(within(mgr).getByRole('button', { name: /cancelar/i }));
    await user.click(within(mgr).getByRole('button', { name: /fechar/i }));

    // O fixado vem primeiro, com o nome inteiro (chips quebram linha).
    const chips = within(form).getAllByRole('button', { pressed: false });
    expect(chips[0]).toHaveTextContent('Hora de trabalho · R$ 80,00');
    await user.click(chips[0]!);
    expect(within(form).getByLabelText(/descrição d/i)).toHaveValue('Hora de trabalho');
    expect(within(form).getByLabelText(/valor/i)).toHaveValue('80,00');
  });

  it('Perfil e negócio › Tipos de serviço abre o mesmo painel; sugestão vira tipo próprio; excluir pede confirmação', async () => {
    const { dbName, user } = await open('#/ajustes/perfil');
    await user.click(await screen.findByRole('button', { name: /tipos de serviço/i }));
    const mgr = await screen.findByRole('dialog', { name: /tipos de serviço/i });
    await user.click(within(mgr).getAllByRole('button', { name: /^adicionar (?!tipo)/i })[0]!);
    await waitFor(async () => expect((await reload(dbName)).data.serviceTypes).toHaveLength(1));
    const name = (await reload(dbName)).data.serviceTypes[0]!.name;
    await user.click(within(mgr).getByRole('button', { name: new RegExp(`^excluir ${name}$`, 'i') }));
    const confirm = await screen.findByRole('dialog', { name: /excluir tipo de serviço/i });
    expect(within(confirm).getByText(/já agendados com esse nome não mudam/i)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: /cancelar/i }));
    expect((await reload(dbName)).data.serviceTypes).toHaveLength(1);
  });
});

describe('beta.5: troca de sugestões no agendamento (regressão do teste no S26)', () => {
  it('cada sugestão escolhida atualiza descrição e preço, mesmo depois de editar o preço; a edição manual continua livre', async () => {
    const { dbName, user } = await open('#/painel');
    await user.click(await screen.findByRole('button', { name: /^agendar$/i }));
    const form = await screen.findByRole('dialog', { name: /agendar/i });
    const title = within(form).getByLabelText(/descrição/i);
    const price = within(form).getByLabelText(/^valor/i);

    await user.click(within(form).getByRole('button', { name: /^corte/i }));
    expect(title).toHaveValue('Corte');
    expect(price).toHaveValue('60,00');

    await user.clear(price);
    await user.type(price, '75,00'); // editado à mão
    await user.click(within(form).getByRole('button', { name: /^escova/i }));
    expect(title).toHaveValue('Escova');
    expect(price).toHaveValue('50,00'); // antes da correção ficava 75,00

    await user.click(within(form).getByRole('button', { name: /^manicure e pedicure/i }));
    expect(title).toHaveValue('Manicure e pedicure');
    expect(price).toHaveValue('55,00');

    await user.clear(price);
    await user.type(price, '58,00');
    await user.type(title, ' com esmaltação');
    await user.click(within(form).getByRole('button', { name: /^agendar$/i }));
    await waitFor(async () => {
      const s = await reload(dbName);
      expect(s.data.appointments.map((a) => [a.title, a.price])).toEqual([['Manicure e pedicure com esmaltação', 5_800]]);
    });
  });
});
