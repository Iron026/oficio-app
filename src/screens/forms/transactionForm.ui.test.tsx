import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { AppService } from '../../state/service';
import { createIndexedDbAdapter } from '../../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function open(extra?: (s: AppService) => Promise<void>) {
  const dbName = `tx-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await extra?.(s);
  window.location.hash = '#/financas';
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { dbName, user: userEvent.setup() };
}
const reload = async (dbName: string) => AppService.load(await createIndexedDbAdapter(dbName));

describe('Lançamento: categoria obrigatória, descrição opcional', () => {
  it('sem categoria mostra o erro; com categoria e sem descrição registra e aparece pelo nome da categoria', async () => {
    const { dbName, user } = await open();
    await user.click(screen.getByRole('button', { name: /^despesa$/i }));
    const form = await screen.findByRole('dialog', { name: /nova despesa/i });
    expect(within(form).getByLabelText(/descrição/i)).not.toBeRequired();
    expect(within(form).getByText('(opcional)')).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/valor/i), '85,00');
    await user.click(within(form).getByRole('button', { name: /registrar/i }));
    expect(await within(form).findByText(/escolha uma categoria/i)).toBeInTheDocument();
    expect(within(form).queryByText(/descreva o lançamento/i)).not.toBeInTheDocument();
    expect((await reload(dbName)).data.transactions).toHaveLength(0);

    const chips = within(form).getByRole('radiogroup', { name: /categoria/i });
    const first = within(chips).getAllByRole('radio')[0]!;
    const category = first.textContent!;
    await user.click(first);
    expect(first).toHaveAttribute('aria-checked', 'true');
    await user.click(within(form).getByRole('button', { name: /registrar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /nova despesa/i })).not.toBeInTheDocument());

    const [t] = (await reload(dbName)).data.transactions;
    expect(t).toMatchObject({ type: 'despesa', amount: 8500, description: '', category });
    const item = await screen.findByRole('button', { name: new RegExp(`^${category}.*despesa`, 'i') });
    expect(within(item).getByText(category)).toBeInTheDocument();
  });

  it('chips de categoria respondem às setas do teclado', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /^receita$/i }));
    const form = await screen.findByRole('dialog', { name: /nova receita/i });
    const radios = within(within(form).getByRole('radiogroup', { name: /categoria/i })).getAllByRole('radio');
    radios[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveFocus();
  });

  it('lançamentos antigos com descrição continuam iguais e editáveis', async () => {
    const { dbName, user } = await open(async (s) => {
      await s.saveTransaction({ type: 'receita', amount: '120,00', description: 'Corte e escova', category: 'Atendimento', date: '2026-11-02' });
    });
    const before = (await reload(dbName)).data.transactions[0]!;
    await user.click(await screen.findByRole('button', { name: /corte e escova/i }));
    const form = await screen.findByRole('dialog', { name: /editar lançamento/i });
    expect(within(form).getByLabelText(/descrição/i)).toHaveValue('Corte e escova');
    expect(within(within(form).getByRole('radiogroup', { name: /categoria/i })).getByRole('radio', { name: /atendimento/i })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(form).getByRole('button', { name: /salvar alterações/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const after = (await reload(dbName)).data.transactions[0]!;
    expect({ ...after, updatedAt: '' }).toEqual({ ...before, updatedAt: '' });
  });
});
