import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function start(hash: string, seed?: (s: AppService) => Promise<void>) {
  const dbName = `b7-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  await seed?.(s);
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { user: userEvent.setup(), reload: async () => AppService.load(await createIndexedDbAdapter(dbName)) };
}
const today = toDateKey(new Date());
const undoButton = () => screen.findByRole('button', { name: /^desfazer:/i });

describe('beta.7: Desfazer ao excluir cliente', () => {
  it('o aviso oferece Desfazer (botão de 44 px com nome acessível) e devolve o cliente e o histórico', async () => {
    const { user, reload } = await start('#/clientes', async (s) => {
      const { client } = await s.saveClient({ name: 'Maria Oliveira', phone: '11912340001', email: '', address: '', notes: 'VIP' });
      await s.saveAppointment({ title: 'Corte', clientId: client.id, date: today, time: '', price: '60,00', notes: '' });
    });
    await user.click(await screen.findByRole('button', { name: /maria oliveira/i }));
    const sheet = await screen.findByRole('dialog', { name: 'Maria Oliveira' });
    await user.click(within(sheet).getByRole('button', { name: /^excluir$/i }));
    const dlg = await screen.findByRole('dialog', { name: /excluir cliente/i });
    expect(dlg).toHaveTextContent(/dá para desfazer/i);
    await user.click(within(dlg).getByRole('button', { name: /^excluir$/i }));

    const undo = await undoButton();
    expect(undo).toHaveAccessibleName('Desfazer: Cliente excluído');
    expect(undo.className).toMatch(/min-h-11/);
    expect(undo.closest('[data-toast]')).toHaveAttribute('data-toast', 'acao');
    expect((await reload()).data.clients).toEqual([]);

    await user.click(undo);
    expect(await screen.findByText('Ação desfeita')).toBeInTheDocument();
    const s = await reload();
    expect(s.data.clients.map((c) => [c.name, c.notes])).toEqual([['Maria Oliveira', 'VIP']]);
    expect(s.data.appointments[0]!.clientId).toBe(s.data.clients[0]!.id);
    expect(await screen.findByRole('button', { name: /maria oliveira/i })).toBeInTheDocument();
  });
});

describe('beta.7: Desfazer ao excluir atendimento', () => {
  it('0.5: concluído com pagamento — o aviso diz que os valores continuam; Desfazer devolve o atendimento', async () => {
    const { user, reload } = await start('#/agenda', async (s) => {
      const { appointment } = await s.saveAppointment({ title: 'Coloração', clientId: '', date: today, time: '', price: '300,00', notes: '' });
      await s.completeAppointment(appointment.id, { registerIncome: true });
    });
    await user.click(await screen.findByRole('radio', { name: /concluíd/i }));
    await user.click(await screen.findByRole('button', { name: /coloração/i }));
    const sheet = await screen.findByRole('dialog', { name: 'Coloração' });
    await user.click(within(sheet).getByRole('button', { name: /^excluir$/i }));
    const dlg = await screen.findByRole('dialog', { name: /excluir atendimento/i });
    expect(dlg).not.toHaveTextContent(/permanentemente/i);
    await user.click(within(dlg).getByRole('button', { name: /^excluir$/i }));

    const undo = await undoButton();
    expect(undo).toHaveAccessibleName('Desfazer: Atendimento excluído');
    expect(undo.closest('[data-toast]')).toHaveTextContent(/valores recebidos continuam em Finanças/i);
    let s = await reload();
    expect(s.data.appointments).toEqual([]);
    expect(s.data.transactions.map((t) => t.amount)).toEqual([30_000]);

    await user.click(undo);
    await screen.findByText('Ação desfeita');
    s = await reload();
    expect(s.data.appointments[0]).toMatchObject({ title: 'Coloração', status: 'concluido' });
    expect(s.data.transactions.map((t) => t.amount)).toEqual([30_000]);
    expect(s.data.transactions[0]!.appointmentId).toBe(s.data.appointments[0]!.id);
  });

  it('agendado: Desfazer devolve o atendimento na Agenda', async () => {
    const { user, reload } = await start('#/agenda', async (s) => {
      await s.saveAppointment({ title: 'Escova', clientId: '', date: today, time: '10:00', price: '50,00', notes: '' });
    });
    await user.click(await screen.findByRole('button', { name: /escova/i }));
    const sheet = await screen.findByRole('dialog', { name: 'Escova' });
    await user.click(within(sheet).getByRole('button', { name: /^excluir$/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /excluir atendimento/i })).getByRole('button', { name: /^excluir$/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /escova/i })).not.toBeInTheDocument());
    await user.click(await undoButton());
    expect(await screen.findByRole('button', { name: /escova/i })).toBeInTheDocument();
    expect((await reload()).data.appointments[0]).toMatchObject({ title: 'Escova', status: 'agendado', time: '10:00' });
  });
});

describe('beta.7: Ocultar valores no Painel e em Finanças', () => {
  it('o olho no cabeçalho alterna na hora, vale para as duas telas e é a mesma preferência de Ajustes (só no aparelho)', async () => {
    const { user, reload } = await start('#/painel', async (s) => {
      await s.saveTransaction({ type: 'receita', amount: '1.234,56', description: 'Corte', category: 'Serviços', date: today });
    });
    const eye = await screen.findByRole('button', { name: 'Ocultar valores' });
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    expect(document.body).toHaveTextContent(/1\.234,56/);
    await user.click(eye);
    await waitFor(() => expect(eye).toHaveAttribute('aria-pressed', 'true'));
    expect(document.body).not.toHaveTextContent(/1\.234,56/);
    expect(document.body).toHaveTextContent(/R\$\s?•••••/);
    await waitFor(async () => expect((await reload()).devicePrefs.hideValues).toBe(true));
    expect(JSON.parse((await reload()).exportBackup()).data.settings.hideValues).toBeUndefined();

    // Finanças: o mesmo botão, já ativado; mostrar de novo vale para todo o app.
    await user.click(within(screen.getByRole('navigation', { name: /navegação principal/i })).getByRole('link', { name: /finanças/i }));
    const eye2 = await screen.findByRole('button', { name: 'Ocultar valores' });
    expect(eye2).toHaveAttribute('aria-pressed', 'true');
    expect(document.body).not.toHaveTextContent(/1\.234,56/);
    await user.click(eye2);
    await waitFor(() => expect(document.body).toHaveTextContent(/1\.234,56/));

    // Ajustes › Privacidade mostra o mesmo estado; nas outras telas o botão não aparece.
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    window.location.hash = '#/ajustes/privacidade';
    expect(await screen.findByRole('switch', { name: /ocultar valores/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: 'Ocultar valores' })).not.toBeInTheDocument();
  });
});

describe('beta.7: escolher imagem de perfil ou selo não fecha a tela', () => {
  const twentyClients = async (s: AppService) => {
    for (let i = 1; i <= 20; i++) await s.saveClient({ name: `Cliente ${i}`, phone: '', email: '', address: '', notes: '' });
  };

  it('Ajustes › Perfil › Selo em destaque: aplica na hora, mostra a prévia e "Atualizado"; só Concluído fecha', async () => {
    const { user, reload } = await start('#/ajustes/perfil', twentyClients);
    await user.click(await screen.findByRole('button', { name: /selo em destaque/i }));
    const sheet = await screen.findByRole('dialog', { name: /selo em destaque/i });
    const preview = sheet.querySelector('[data-seal-preview]') as HTMLElement;
    expect(preview).toHaveTextContent(/Automático · Carteira I/);
    await user.click(within(sheet).getByRole('radio', { name: /carteira/i }));
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: /carteira/i })).toHaveAttribute('aria-checked', 'true'));
    expect(within(sheet).getByText('Selo em destaque atualizado')).toBeInTheDocument();
    expect(preview).toHaveTextContent(/^.*Carteira I/);
    expect(preview).not.toHaveTextContent(/Automático/);
    expect((await reload()).data.settings.featuredSeal).toBe('carteira');
    // Continua aberta: dá para voltar ao automático e só então sair.
    await user.click(within(sheet).getByRole('radio', { name: /automático/i }));
    await waitFor(() => expect(within(sheet).getByRole('radio', { name: /automático/i })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('dialog', { name: /selo em destaque/i })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /^concluído$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await reload()).data.settings.featuredSeal).toBe('auto');
  });

  it('Evolução › Selos: "Destacar no perfil" não fecha; o botão muda para voltar ao automático', async () => {
    const { user, reload } = await start('#/evolucao', twentyClients);
    await user.click(await screen.findByRole('radio', { name: /^selos$/i }));
    await user.click(await screen.findByRole('button', { name: /carteira/i }));
    const sheet = await screen.findByRole('dialog', { name: /selo carteira/i });
    await user.click(within(sheet).getByRole('button', { name: /fixar este selo no perfil|destacar no perfil/i }));
    expect(await within(sheet).findByRole('button', { name: /voltar ao destaque automático/i })).toBeInTheDocument();
    expect(within(sheet).getByText('Selo em destaque no perfil')).toBeInTheDocument();
    expect((await reload()).data.settings.featuredSeal).toBe('carteira');
    await user.click(within(sheet).getByRole('button', { name: /voltar ao destaque automático/i }));
    expect(await within(sheet).findByText('Destaque automático')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /selo carteira/i })).toBeInTheDocument();
  });
});
