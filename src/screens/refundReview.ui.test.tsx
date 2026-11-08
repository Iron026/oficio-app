/**
 * 0.5.0-beta.3 — revisão de estornos na interface: aviso em Finanças, cartão no painel do atendimento,
 * decisões com confirmação e Desfazer, e respeito a "Ocultar valores".
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { refundIssues } from '../domain/refundReview';
import { toDateKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const today = toDateKey(new Date());

/** Estado depois de sincronizar dois aparelhos que estornaram o mesmo pagamento offline (R$ 100 + R$ 40 de R$ 100). */
async function start(hash: string) {
  const dbName = `ui-rr-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
  const a = (await s.saveAppointment({ title: 'Coloração', clientId: '', date: today, time: '14:00', price: '100,00', notes: '' })).appointment;
  const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000, date: today });
  await s.refundPayment(p!.id, { amount: 'total', date: today });
  const json = JSON.parse(s.exportBackup());
  const first = json.data.transactions.find((t: { type: string }) => t.type === 'despesa');
  json.data.transactions.push({ ...first, id: 'outro-aparelho', amount: 4_000, createdAt: new Date(Date.now() + 1000).toISOString() });
  await s.importBackup(JSON.stringify(json));
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { user: userEvent.setup(), reload: async () => AppService.load(await createIndexedDbAdapter(dbName)) };
}

describe('beta.3: revisão de estornos', () => {
  it('Finanças avisa; a revisão explica sem afirmar o que aconteceu; remover pede confirmação e deixa Desfazer', async () => {
    const { user, reload } = await start('#/financas');
    const banner = await screen.findByRole('button', { name: /estornos para revisar/i });
    await user.click(banner);
    const sheet = await screen.findByRole('dialog', { name: 'Revisar estornos' });
    const card = within(sheet).getByRole('region', { name: 'Revisar estornos' });
    expect(card).toHaveTextContent(/somam R\$\s140,00, R\$\s40,00 acima do valor pago \(R\$\s100,00\)/);
    expect(card).toHaveTextContent(/não tem como saber qual aconteceu de verdade/);
    await user.click(within(card).getByRole('button', { name: /remover o estorno de r\$\s40,00/i }));
    const confirm = await screen.findByRole('dialog', { name: /remover este estorno/i });
    await user.click(within(confirm).getByRole('button', { name: /remover estorno/i }));
    await screen.findByRole('button', { name: /^desfazer: estorno removido/i });
    await waitFor(() => expect(screen.queryByRole('button', { name: /estornos para revisar/i })).not.toBeInTheDocument());
    const data = (await reload()).data;
    expect(refundIssues(data.transactions)).toEqual([]);
    expect(data.transactions.filter((t) => t.type === 'despesa').map((t) => t.amount)).toEqual([10_000]);
  });

  it('o painel do atendimento mostra "Revisar estornos" e permite manter os dois', async () => {
    const { user, reload } = await start('#/agenda');
    await user.click(await screen.findByRole('button', { name: /coloração/i }));
    const panel = await screen.findByRole('dialog', { name: 'Coloração' });
    expect(within(panel).getByRole('region', { name: 'Pagamento' })).toHaveTextContent(/Revisar estornos.*Em revisão/);
    await user.click(within(panel).getByRole('button', { name: /todos aconteceram: manter/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /manter todos os estornos/i })).getByRole('button', { name: /^manter$/i }));
    await waitFor(() => expect(within(panel).queryByRole('region', { name: 'Revisar estornos' })).not.toBeInTheDocument());
    const data = (await reload()).data;
    expect(refundIssues(data.transactions)).toEqual([]);
    expect(data.transactions.filter((t) => t.type === 'despesa')).toHaveLength(2);
  });
});
