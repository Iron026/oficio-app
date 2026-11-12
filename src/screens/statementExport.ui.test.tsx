import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { todayKey } from '../lib/dates';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

describe('Finanças > Exportar extrato', () => {
  it('baixa o CSV e o PDF do mês exibido, sem alterar os dados', async () => {
    const dbName = `st-${Math.random()}`;
    const s = await AppService.load(await createIndexedDbAdapter(dbName));
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await s.saveTransaction({ type: 'receita', amount: '120,00', description: 'Corte; escova', category: 'Atendimento', date: todayKey() });
    const before = JSON.stringify((await AppService.load(await createIndexedDbAdapter(dbName))).data);

    const blobs: Blob[] = [];
    const names: string[] = [];
    URL.createObjectURL = ((b: Blob) => { blobs.push(b); return 'blob:x'; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = () => undefined;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { names.push(this.download); };
    try {
      window.location.hash = '#/financas';
      render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /^exportar extrato/i }));
      const sheet = await screen.findByRole('dialog', { name: /exportar extrato/i });
      expect(within(sheet).getByText(/1 lançamento/)).toBeInTheDocument();
      await user.click(within(sheet).getByRole('radio', { name: /planilha/i }));
      await user.click(within(sheet).getByRole('button', { name: /baixar csv/i }));
      await waitFor(() => expect(names).toHaveLength(1));
      const month = todayKey().slice(0, 7);
      expect(names[0]).toBe(`oficio-extrato-${month}.csv`);
      expect(blobs[0]!.type).toBe('text/csv');
      const csv = await blobs[0]!.text();
      expect(csv).toContain('Receita;Atendimento;"Corte; escova";120,00');

      await user.click(await screen.findByRole('button', { name: /^exportar extrato/i }));
      const again = await screen.findByRole('dialog', { name: /exportar extrato/i });
      await user.click(within(again).getByRole('radio', { name: /pdf/i }));
      await user.click(within(again).getByRole('button', { name: /baixar pdf/i }));
      await waitFor(() => expect(names).toHaveLength(2));
      expect(names[1]).toBe(`oficio-extrato-${month}.pdf`);
      expect(blobs[1]!.type).toBe('application/pdf');
      const head = new Uint8Array(await blobs[1]!.arrayBuffer()).slice(0, 8);
      expect(String.fromCharCode(...head)).toBe('%PDF-1.4');

      const after = JSON.stringify((await AppService.load(await createIndexedDbAdapter(dbName))).data);
      expect(after).toBe(before);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
