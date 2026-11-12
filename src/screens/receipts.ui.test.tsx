/**
 * 0.5.0-beta.4 — recibos na interface: emitir a partir do pagamento no atendimento e do lançamento em Finanças,
 * baixar o PDF no navegador, sem lançar nada; despesa e estorno não oferecem recibo.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { todayKey } from '../lib/dates';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

async function start(hash: string) {
  const dbName = `ui-rec-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana', businessName: 'Studio Ana', professionId: 'beleza' });
  const a = (await s.saveAppointment({ title: 'Coloração', clientId: '', date: todayKey(), time: '10:00', price: '300,00', notes: '' })).appointment;
  const { transaction: p } = await s.registerPayment(a.id, { amount: 10_000, method: 'pix', date: todayKey() });
  await s.refundPayment(p!.id, { amount: 2_000 });
  // Lido do armazenamento (mesma ordem que a leitura depois), para comparar só o conteúdo.
  const before = JSON.stringify((await AppService.load(await createIndexedDbAdapter(dbName))).data);
  window.location.hash = hash;
  render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return { user: userEvent.setup(), before, reload: async () => JSON.stringify((await AppService.load(await createIndexedDbAdapter(dbName))).data) };
}

function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = ((b: Blob) => { blobs.push(b); return 'blob:x'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => undefined;
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { names.push(this.download); };
  return { blobs, names, restore: () => { HTMLAnchorElement.prototype.click = orig; } };
}

describe('beta.4: recibos', () => {
  it('no atendimento: recibo do pagamento com a situação de estorno; baixa o PDF sem lançar nada', async () => {
    const dl = captureDownloads();
    try {
      const { user, before, reload } = await start('#/agenda');
      await user.click(await screen.findByRole('button', { name: /coloração/i }));
      const panel = await screen.findByRole('dialog', { name: 'Coloração' });
      await user.click(within(panel).getByRole('button', { name: /^recibo do pagamento/i }));
      const sheet = await screen.findByRole('dialog', { name: 'Recibo' });
      expect(sheet).toHaveTextContent(/REC-\d{8}-[0-9A-Z]{4}/);
      expect(sheet).toHaveTextContent(/R\$\s100,00.*Pix/);
      expect(sheet).toHaveTextContent(/Pagamento parcial/);
      expect(sheet).toHaveTextContent(/estornado em parte/);
      expect(sheet).toHaveTextContent(/Não é nota fiscal/);
      await user.click(within(sheet).getByRole('button', { name: /baixar pdf/i }));
      await waitFor(() => expect(dl.names).toHaveLength(1));
      expect(dl.names[0]).toMatch(/^recibo-REC-\d{8}-[0-9A-Z]{4}\.pdf$/);
      expect(dl.blobs[0]!.type).toBe('application/pdf');
      expect(new TextDecoder('latin1').decode(new Uint8Array(await dl.blobs[0]!.arrayBuffer())).startsWith('%PDF-1.4')).toBe(true);
      expect(await reload()).toBe(before);
    } finally {
      dl.restore();
    }
  });

  it('em Finanças: receita oferece "Emitir recibo"; estorno não', async () => {
    const { user } = await start('#/financas');
    await user.click(await screen.findByRole('button', { name: /^coloração/i }));
    const edit = await screen.findByRole('dialog', { name: /editar lançamento/i });
    expect(within(edit).getByRole('button', { name: /emitir recibo/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: /estorno: coloração/i }));
    const refund = await screen.findByRole('dialog', { name: /editar lançamento/i });
    expect(within(refund).queryByRole('button', { name: /emitir recibo/i })).not.toBeInTheDocument();
  });
});
