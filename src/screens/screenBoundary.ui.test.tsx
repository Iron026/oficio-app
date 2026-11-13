/**
 * Auditoria pré-RC (0.5.0) — o app não tinha limite de erro: uma falha ao desenhar qualquer tela deixava o aparelho
 * com a tela em branco, sem navegação (reproduzido com backups malformados, hoje recusados). Agora só a tela que
 * falhou mostra um aviso; a navegação continua funcionando e os dados não são tocados.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

let explode = true;
vi.mock('./Agenda', () => ({
  Agenda: () => { if (explode) throw new Error('falha simulada ao desenhar'); return <p>Agenda ok</p>; },
}));

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});
afterEach(() => { cleanup(); explode = true; });

async function ready() {
  const db = `bound-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(db));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  return db;
}

describe('auditoria pré-RC: falha numa tela', () => {
  it('mostra aviso só nessa tela, mantém a navegação e volta ao normal ao trocar de tela', async () => {
    const db = await ready();
    window.location.hash = '#/agenda';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(db), persistent: true })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível abrir esta tela/i);
    const nav = screen.getByRole('navigation', { name: /navegação principal/i });
    fireEvent.click(nav.querySelector('a[href="#/painel"]')!);
    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    // A tela volta a funcionar quando o problema some (ex.: depois de atualizar o app).
    explode = false;
    fireEvent.click(nav.querySelector('a[href="#/agenda"]')!);
    expect(await screen.findByText('Agenda ok')).toBeInTheDocument();
    spy.mockRestore();
  }, 30_000);
});
