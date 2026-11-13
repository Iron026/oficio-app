/* eslint-disable @typescript-eslint/no-explicit-any -- os testes editam o JSON bruto dos arquivos, sem tipo */
/**
 * Auditoria pré-RC (0.5.0): todo arquivo que a restauração aceita abre todas as telas sem erro. Antes, um cliente sem
 * telefone derrubava Painel, Agenda e Clientes, e um lançamento sem descrição derrubava Finanças (tela em branco).
 * Esses arquivos agora são recusados; os casos de borda aceitos de propósito são conferidos aqui, tela por tela.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../App';
import { todayKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { createMemoryAdapter } from '../storage/memory';
import { signed } from '../test/backupFile';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const ROUTES = ['#/painel', '#/agenda', '#/clientes', '#/financas', '#/financas/relatorios', '#/evolucao', '#/ajustes/perfil', '#/ajustes/dados'];

async function backup() {
  const s = await AppService.load(createMemoryAdapter());
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const c = (await s.saveClient({ name: 'Carla', phone: '11999990000', email: '', address: '', notes: '' })).client;
  const a = (await s.saveAppointment({ title: 'Corte', clientId: c.id, date: todayKey(), time: '10:00', price: '100,00', notes: '' })).appointment;
  const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000 });
  await s.refundPayment(p!.id, { amount: 2_000 });
  await s.saveServiceType({ name: 'Escova', price: '50,00' });
  return s.exportBackup();
}

const accepted: [string, (r: any) => void][] = [
  ['estorno de pagamento que não existe mais (vai para revisão)', (r) => { r.data.transactions = r.data.transactions.filter((t: any) => t.payment?.kind !== 'pagamento'); }],
  ['selo e campos de versão mais nova', (r) => {
    r.data.sealAwards = [{ id: 'selo-futuro', stage: 1, reachedAt: [null], createdAt: 'x', updatedAt: 'x' }];
    r.data.clients[0].fidelidade = { pontos: 3 };
    r.data.serviceTypes[0].cor = 'azul';
    r.data.settings.dashboard = { v: 2, futuro: true };
  }],
  ['marcador sem "kind" numa receita vinculada (contrato da 0.4.0-beta.4)', (r) => { delete r.data.transactions.find((t: any) => t.payment?.kind === 'pagamento').payment.kind; }],
];

describe('auditoria pré-RC: dados restaurados abrem todas as telas', () => {
  it.each(accepted)('%s', async (_n, edit) => {
    const raw = JSON.parse(await backup());
    edit(raw);
    const dbName = `rest-${Math.random()}`;
    const t = await AppService.load(await createIndexedDbAdapter(dbName));
    await t.importBackup(signed(raw));
    for (const route of ROUTES) {
      const errors: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(String(a[0])); });
      window.location.hash = route;
      render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
      await screen.findByRole('navigation', { name: /navegação principal/i });
      await new Promise((r) => setTimeout(r, 30));
      spy.mockRestore();
      cleanup();
      expect(errors.filter((e) => !/not wrapped in act/.test(e)), route).toEqual([]);
    }
  }, 60_000);
});
