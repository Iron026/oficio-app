/**
 * 0.5.0-beta.3 — busca global na interface: botão discreto no cabeçalho, sem acentos, agrupada, abre o
 * registro, estado vazio, "Ocultar valores" e nenhuma chamada de rede (funciona offline).
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from '../App';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const today = toDateKey(new Date());

async function start(hide = false) {
  const dbName = `ui-search-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const { client } = await s.saveClient({ name: 'Conceição Araújo', phone: '11 98765-4321', email: '', address: '', notes: '' });
  await s.saveAppointment({ title: 'Coloração', clientId: client.id, date: today, time: '10:00', price: '300,00', notes: '' });
  await s.saveTransaction({ type: 'despesa', amount: '45,50', description: 'Tintas', category: 'Produtos', date: today });
  if (hide) await s.updateDevicePrefs({ hideValues: true });
  window.location.hash = '#/painel';
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Buscar' }));
  const sheet = await screen.findByRole('dialog', { name: 'Buscar' });
  return { user, sheet, box: within(sheet).getByRole('searchbox', { name: /buscar no aplicativo/i }) };
}

describe('beta.3: busca global', () => {
  it('fica no cabeçalho (sem sexta área na navegação); sem acentos; agrupa e abre o registro; não usa a rede', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user, sheet, box } = await start();
    expect(within(screen.getByRole('navigation', { name: /navegação principal/i })).getAllByRole('link')).toHaveLength(5);
    await user.type(box, 'CONCEICAO');
    expect(await within(sheet).findByRole('heading', { name: /clientes \(1\)/i })).toBeInTheDocument();
    expect(within(sheet).getByRole('heading', { name: /atendimentos \(1\)/i })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /coloração/i }));
    expect(await screen.findByRole('dialog', { name: 'Coloração' })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('estado vazio compreensível; abre cliente e lançamento', async () => {
    const { user, sheet, box } = await start();
    await user.type(box, 'xyzw');
    expect(within(sheet).getByText(/nada encontrado para “xyzw”/i)).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, 'tintas');
    await user.click(await within(sheet).findByRole('button', { name: /tintas/i }));
    expect(await screen.findByRole('dialog', { name: /editar lançamento/i })).toBeInTheDocument();
  });

  it('com "Ocultar valores", não encontra pelo valor e mascara os valores exibidos', async () => {
    const { user, sheet, box } = await start(true);
    await user.type(box, '45,50');
    expect(within(sheet).getByText(/nada encontrado/i)).toBeInTheDocument();
    expect(sheet).toHaveTextContent(/valores não são pesquisados/i);
    await user.clear(box);
    await user.type(box, 'tintas');
    expect(await within(sheet).findByRole('button', { name: /tintas/i })).not.toHaveTextContent(/R\$\s\d/);
  });
});
