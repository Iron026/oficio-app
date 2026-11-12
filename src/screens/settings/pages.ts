/** Central de Ajustes (rodada 5): páginas internas e seus títulos. Rotas: #/ajustes/<página>. */
export const APP_VERSION = __APP_VERSION__;

/** Política de privacidade pública (abre no navegador). */
export const PRIVACY_POLICY_URL = 'https://github.com/Iron026/oficio-app/blob/main/docs/PRIVACIDADE.md';

export type SettingsPageId = 'aparencia' | 'aparencia/paleta' | 'perfil' | 'privacidade' | 'lembretes' | 'conta' | 'dados' | 'sobre';

export const SETTINGS_PAGES: Record<SettingsPageId, { title: string; parent: SettingsPageId | null; parentLabel: string }> = {
  aparencia: { title: 'Aparência e personalização', parent: null, parentLabel: 'Ajustes' },
  'aparencia/paleta': { title: 'Paleta de cores', parent: 'aparencia', parentLabel: 'Aparência' },
  perfil: { title: 'Perfil e negócio', parent: null, parentLabel: 'Ajustes' },
  privacidade: { title: 'Privacidade e acessibilidade', parent: null, parentLabel: 'Ajustes' },
  lembretes: { title: 'Lembretes', parent: null, parentLabel: 'Ajustes' },
  conta: { title: 'Conta e sincronização', parent: null, parentLabel: 'Ajustes' },
  dados: { title: 'Backup e dados', parent: null, parentLabel: 'Ajustes' },
  sobre: { title: 'Sobre o Ofício', parent: null, parentLabel: 'Ajustes' },
};

/** Página interna pelo caminho do hash; desconhecida → índice (null). */
export function settingsPage(sub: string): SettingsPageId | null {
  return Object.hasOwn(SETTINGS_PAGES, sub) ? (sub as SettingsPageId) : null;
}

export function settingsTitle(sub: string): string {
  const id = settingsPage(sub);
  return id ? SETTINGS_PAGES[id].title : 'Ajustes';
}
