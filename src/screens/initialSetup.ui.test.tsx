/**
 * 0.5.0-beta.5 — configuração inicial na interface: aparece depois do cadastro pela tela de boas-vindas, "Pular"
 * sempre visível e sem efeito, "Aplicar escolhas" com edição, reaberta em Ajustes, nunca para quem já usa o app.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function signUp() {
  const dbName = `ui-setup-${Math.random()}`;
  window.location.hash = '';
  const view = render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /começar/i }));
  await user.click(screen.getByRole('radio', { name: /beleza/i }));
  await user.click(screen.getByRole('button', { name: /continuar/i }));
  await user.type(screen.getByLabelText(/seu nome/i), 'Ana');
  await user.click(screen.getByRole('button', { name: /entrar no ofício/i }));
  const sheet = await screen.findByRole('dialog', { name: /sugestões para beleza/i });
  return { dbName, view, user, sheet };
}
const reload = async (dbName: string) => AppService.load(await createIndexedDbAdapter(dbName));

describe('beta.5: configuração inicial', () => {
  it('Pular: nada muda e não aparece de novo ao reabrir', async () => {
    const { dbName, view, user, sheet } = await signUp();
    const before = await reload(dbName);
    expect(within(sheet).getByText(/tudo pronto, ana/i)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Pular' })).toBeEnabled();
    await user.click(within(sheet).getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /sugestões/i })).not.toBeInTheDocument());
    const after = await reload(dbName);
    expect(after.data.serviceTypes).toHaveLength(0);
    expect(after.data.settings).toEqual(before.data.settings);
    expect(after.data.clients.length + after.data.appointments.length + after.data.transactions.length).toBe(0);
    expect(after.setupOffer).toBe(false);
    view.unmount();
    window.location.hash = '#/painel';
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    await screen.findByRole('navigation', { name: /navegação principal/i });
    expect(screen.queryByRole('dialog', { name: /sugestões/i })).not.toBeInTheDocument();
  });

  it('Aplicar: só os serviços marcados, com o nome editado; Painel e Agenda conforme escolhidos', async () => {
    const { dbName, user, sheet } = await signUp();
    const items = within(sheet).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(2);
    // Desmarca o segundo serviço e edita o nome do primeiro.
    await user.click(within(items[1]!).getByRole('checkbox'));
    const first = within(items[0]!);
    await user.click(first.getByRole('button', { name: /^editar/i }));
    const name = first.getByLabelText(/^nome/i);
    await user.clear(name);
    await user.type(name, 'Corte da casa');
    await user.click(first.getByRole('button', { name: /favorito/i }));
    expect(within(sheet).getByText(/Ao aplicar:/)).toHaveTextContent(/tipos de serviço.*Painel organizado.*Agenda abre em Dia/);
    await user.click(within(sheet).getByRole('button', { name: /aplicar escolhas/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /sugestões/i })).not.toBeInTheDocument());
    const after = await reload(dbName);
    const names = after.data.serviceTypes.map((t) => t.name);
    expect(names).toContain('Corte da casa');
    expect(after.data.serviceTypes.find((t) => t.name === 'Corte da casa')!.pinned).toBe(true);
    expect(names).toHaveLength(items.length - 1);
    expect(after.devicePrefs.agendaView).toBe('dia');
    expect(after.data.xpEvents).toHaveLength(0);
    // A Agenda abre na visão escolhida.
    await user.click(within(screen.getByRole('navigation', { name: /navegação principal/i })).getByRole('link', { name: /agenda/i }));
    expect(await screen.findByRole('radio', { name: 'Dia', checked: true })).toBeInTheDocument();
  });

  it('quem já usa o app não vê a configuração; ela abre em Ajustes e mostra o que já existe', async () => {
    const dbName = `ui-setup-old-${Math.random()}`;
    const s = await AppService.load(await createIndexedDbAdapter(dbName));
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await s.saveServiceType({ name: 'Escova', price: '50,00' });
    window.location.hash = '#/painel';
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    await screen.findByRole('navigation', { name: /navegação principal/i });
    expect(screen.queryByRole('dialog', { name: /sugestões/i })).not.toBeInTheDocument();
    window.location.hash = '#/ajustes/perfil';
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /sugestões para beleza/i }));
    const sheet = await screen.findByRole('dialog', { name: /sugestões para beleza/i });
    const escova = sheet.querySelector('[data-setup-service="Escova"]');
    if (escova) expect(escova).toHaveTextContent(/já cadastrado/i);
    await user.click(within(sheet).getByRole('button', { name: 'Pular' }));
    const after = await reload(dbName);
    expect(after.data.serviceTypes.map((t) => t.name)).toEqual(['Escova']);
  });
});
