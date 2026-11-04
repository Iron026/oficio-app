import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

describe('Ajustes > Privacidade', () => {
  it('mostra "Ler Política de Privacidade" com link público (sem caminho técnico)', async () => {
    const dbName = `set-${Math.random()}`;
    const s = await AppService.load(await createIndexedDbAdapter(dbName));
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    window.location.hash = '#/ajustes';
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    const link = await screen.findByRole('link', { name: /ler política de privacidade/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByText(/docs\/PRIVACIDADE\.md/)).not.toBeInTheDocument();
  });
});

describe('Ajustes > central de controle (0.4)', () => {
  async function open() {
    const dbName = `set-${Math.random()}`;
    const s = await AppService.load(await createIndexedDbAdapter(dbName));
    await s.completeOnboarding({ name: 'Ana Souza', businessName: 'Studio', professionId: 'beleza' });
    window.location.hash = '#/ajustes';
    render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
    await screen.findByText('Conta e sincronização');
    return { dbName };
  }

  it('escolhe um avatar do Ofício, volta às iniciais e o perfil anuncia a escolha', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: /alterar imagem de perfil/i }));
    const sheet = await screen.findByRole('dialog', { name: /imagem de perfil/i });
    // Sincronização de foto desligada nesta versão: o texto não pode prometer nuvem.
    expect(within(sheet).getByText(/fica só neste aparelho e no arquivo de backup/i)).toBeInTheDocument();
    expect(within(sheet).queryByText(/é sincronizada/i)).not.toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: /tesoura/i })).toBeInTheDocument(); // Beleza e Estética
    expect(within(sheet).getByRole('radio', { name: /borrifador/i })).toBeInTheDocument(); // Limpeza
    await user.click(within(sheet).getByRole('radio', { name: /^medicina$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('img', { name: /avatar medicina/i }).length).toBeGreaterThan(0);
    expect(screen.getByText('Avatar: Medicina')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /alterar imagem de perfil/i }));
    await user.click(within(await screen.findByRole('dialog', { name: /imagem de perfil/i })).getByRole('radio', { name: /^iniciais$/i }));
    await waitFor(() => expect(screen.getAllByRole('img', { name: /\(iniciais\)/i }).length).toBeGreaterThan(0));
  });

  it('ocultar valores, cor de destaque e animações reduzidas aplicam na hora', async () => {
    const user = userEvent.setup();
    await open();
    const sw = screen.getByRole('switch', { name: /ocultar valores/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await user.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));

    await user.click(screen.getByRole('radio', { name: /índigo/i }));
    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('indigo'));

    await user.click(screen.getByRole('radio', { name: /^reduzir$/i }));
    await waitFor(() => expect(document.documentElement.dataset.motion).toBe('reduce'));
  });

  it('selo em destaque: sem selos, só o automático está disponível', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: /selo em destaque/i }));
    const sheet = await screen.findByRole('dialog', { name: /selo em destaque/i });
    expect(within(sheet).getByRole('radio', { name: /automático/i })).toHaveAttribute('aria-checked', 'true');
    expect(within(sheet).getByRole('radio', { name: /carteira/i })).toBeDisabled();
  });
});
