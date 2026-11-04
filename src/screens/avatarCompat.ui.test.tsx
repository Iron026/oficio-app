import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import type { AvatarChoice } from '../domain/types';
import { AppService } from '../state/service';
import { createIndexedDbAdapter } from '../storage/indexeddb';
import { INTERNAL_AVATARS, getInternalAvatar } from '../ui/avatarCatalog';

/**
 * Padronização dos avatares: perfis que já usam um avatar da coleção anterior (ou foto,
 * iniciais, id desconhecido) continuam exatamente como estavam — imagem, moldura e selo.
 */
beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

const LEGACY = INTERNAL_AVATARS.filter((a) => a.legacy);

async function profileWith(avatar: AvatarChoice, extra?: (s: AppService) => Promise<void>) {
  const dbName = `compat-${Math.random()}`;
  const s = await AppService.load(await createIndexedDbAdapter(dbName));
  await s.completeOnboarding({ name: 'Ana Souza', businessName: 'Studio', professionId: 'beleza' });
  await extra?.(s);
  await s.updateSettings({ avatar });
  return dbName;
}
async function open(dbName: string, hash = '#/ajustes') {
  window.location.hash = hash;
  const view = render(<App storageFactory={async () => ({ storage: await createIndexedDbAdapter(dbName), persistent: true })} />);
  await screen.findByRole('navigation', { name: /navegação principal/i });
  return view;
}
/** Imagem dentro do avatar do perfil (cabeçalho da Central). */
const profileImg = () => screen.getAllByRole('img', { name: /imagem de perfil de ana souza/i })[0]!;

describe('Compatibilidade com perfis existentes', () => {
  it.each(LEGACY.map((a) => [a.id, a] as const))('%s (coleção anterior): o perfil continua com a mesma imagem e nome', async (_id, a) => {
    const dbName = await profileWith({ kind: 'interno', id: a.id });
    const view = await open(dbName);
    const avatar = profileImg();
    expect(avatar).toHaveAccessibleName(new RegExp(`\\(avatar ${a.name.toLowerCase()}\\), moldura`, 'i'));
    expect(avatar.querySelector('img')?.getAttribute('src')).toBe(a.src);
    expect(avatar.querySelector('svg.frame')).not.toBeNull(); // moldura da categoria preservada
    view.unmount();
    // A escolha gravada não foi alterada pela abertura do app.
    expect((await AppService.load(await createIndexedDbAdapter(dbName))).data.settings.avatar).toEqual({ kind: 'interno', id: a.id });
  });

  it('na galeria: aviso da coleção anterior, sem misturar estilos; trocar e voltar não perde nada', async () => {
    const legacy = getInternalAvatar('retrato-consultoria')!;
    const dbName = await profileWith({ kind: 'interno', id: legacy.id });
    await open(dbName, '#/ajustes/perfil');
    expect(await screen.findByText('Avatar: Consultoria')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /imagem de perfil/i }));
    const sheet = await screen.findByRole('dialog', { name: /imagem de perfil/i });
    expect(within(sheet).getByText('Consultoria', { selector: '[data-avatar-current]' })).toBeInTheDocument();
    expect(within(sheet).getByText(/coleção anterior/i)).toBeInTheDocument();
    expect(sheet.querySelector(`[data-avatar-id="${legacy.id}"]`)).toBeNull();
    expect(within(sheet).getAllByRole('radio').filter((r) => r.hasAttribute('data-avatar-id') && r.getAttribute('aria-checked') === 'true')).toHaveLength(0);
    await user.click(within(sheet).getByRole('radio', { name: 'Geral, mulher' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Avatar: Geral, mulher')).toBeInTheDocument();
    // Depois de escolher um da coleção atual, o aviso some.
    await user.click(screen.getByRole('button', { name: /imagem de perfil/i }));
    const again = await screen.findByRole('dialog', { name: /imagem de perfil/i });
    expect(within(again).queryByText(/coleção anterior/i)).not.toBeInTheDocument();
  });

  it('foto própria e iniciais continuam como estavam', async () => {
    const photo = { id: 'atual' as const, mime: 'image/webp' as const, data: 'A'.repeat(400), bytes: 300, width: 320, height: 320, hash: 'h1', createdAt: 'x', updatedAt: 'x' };
    const withPhoto = await profileWith({ kind: 'foto' }, (s) => s.setProfileImage(photo));
    let view = await open(withPhoto);
    expect(profileImg()).toHaveAccessibleName(/\(foto\)/);
    expect(profileImg().querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/webp;base64,/);
    view.unmount();
    const withInitials = await profileWith({ kind: 'iniciais' });
    view = await open(withInitials);
    expect(profileImg()).toHaveAccessibleName(/\(iniciais\)/);
    expect(within(profileImg()).getByText('AS')).toBeInTheDocument();
    view.unmount();
  });

  it('id desconhecido (ex.: de uma versão mais nova) mostra e anuncia as iniciais, sem apagar a escolha', async () => {
    const dbName = await profileWith({ kind: 'interno', id: 'personagem-futuro-x' });
    const view = await open(dbName);
    expect(profileImg()).toHaveAccessibleName(/\(iniciais\)/);
    view.unmount();
    expect((await AppService.load(await createIndexedDbAdapter(dbName))).data.settings.avatar).toEqual({ kind: 'interno', id: 'personagem-futuro-x' });
  });

  it('backup com avatar da coleção anterior importa e mantém a escolha', async () => {
    const source = await AppService.load(await createIndexedDbAdapter(`src-${Math.random()}`));
    await source.completeOnboarding({ name: 'Bia', businessName: '', professionId: 'beleza' });
    await source.updateSettings({ avatar: { kind: 'interno', id: 'retrato-bombeiros' } });
    const target = await AppService.load(await createIndexedDbAdapter(`dst-${Math.random()}`));
    await target.completeOnboarding({ name: 'Outra', businessName: '', professionId: 'beleza' });
    await target.importBackup(source.exportBackup());
    expect(target.data.settings.avatar).toEqual({ kind: 'interno', id: 'retrato-bombeiros' });
    expect(getInternalAvatar('retrato-bombeiros')?.legacy).toBe(true);
  });
});
