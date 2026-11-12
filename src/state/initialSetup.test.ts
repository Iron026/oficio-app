/**
 * 0.5.0-beta.5 — configuração inicial por profissão: só aplica o que foi confirmado, não duplica, não cria registros
 * fictícios nem XP, não mexe no perfil, não sobrescreve o que a pessoa já tem e só é oferecida a cadastros novos.
 */
import { DEFAULT_DASHBOARD, dashboardEntries, readDashboard, setCardVisible } from '../domain/dashboard';
import { EMPTY_CHOICE, choiceSummary, professionDashboard, setupSuggestions, suggestedServiceId, type SetupChoice } from '../domain/initialSetup';
import { totalXp } from '../gamification/engine';
import { createMemoryAdapter } from '../storage/memory';
import { MemoryRemote } from '../sync/memoryRemote';
import { SyncEngine } from '../sync/engine';
import { TrackedStorage } from '../sync/tracked';
import { AppService, ValidationError } from './service';

const now = () => new Date(2026, 10, 12, 9, 0);
const svc = (name: string, price = '', pinned = false, duration = '') => ({ name, price, pinned, duration });

async function newUser(storage = createMemoryAdapter(), professionId: 'beleza' | 'manutencao' = 'beleza') {
  const s = await AppService.load(storage, now);
  await s.completeOnboarding({ name: 'Ana', businessName: 'Studio', professionId }, { offerSetup: true });
  return s;
}
const snapshot = (s: AppService) => ({ profile: JSON.stringify(s.data.profile), clients: s.data.clients.length, appts: s.data.appointments.length, tx: s.data.transactions.length, xp: totalXp(s.data.xpEvents), events: s.data.xpEvents.length });

describe('domínio', () => {
  it('ids de sugestão estáveis, sem acento e por profissão', () => {
    expect(suggestedServiceId('beleza', 'Coloração  Completa')).toBe('sugestao-beleza-coloracao-completa');
    expect(suggestedServiceId('beleza', 'coloração completa')).toBe(suggestedServiceId('beleza', 'Coloração Completa'));
    expect(suggestedServiceId('manutencao', 'Coloração')).not.toBe(suggestedServiceId('beleza', 'Coloração'));
  });

  it('Painel da profissão: cartões sugeridos logo depois do saldo e visíveis', () => {
    const e = dashboardEntries(professionDashboard('beleza', 'T'));
    expect(e.slice(0, 4).map((x) => x.id)).toEqual(['saldo', 'movimento', 'proximos', 'receber']);
    expect(e.find((x) => x.id === 'receber')!.visible).toBe(true);
    expect(e.find((x) => x.id === 'meta-mes')!.visible).toBe(false);
  });

  it('sugestões marcam serviços que já existem (sem acento/maiúscula) e o Painel personalizado', () => {
    const sug = setupSuggestions({
      profile: { name: 'A', businessName: '', professionId: 'manutencao', createdAt: '', weeklyGoalServices: 5, monthlyGoalRevenue: 0 },
      settings: { theme: 'system', dashboard: setCardVisible(DEFAULT_DASHBOARD, 'dica', false, 'T') },
      serviceTypes: [{ id: 'x', name: 'VISITA TECNICA', price: null, pinned: false, order: 0, createdAt: '', updatedAt: '' }],
    });
    expect(sug.services.find((s) => s.name === 'Visita técnica')!.exists).toBe(true);
    expect(sug.dashboardIsDefault).toBe(false);
    expect(sug.avatarIds).toEqual(['personagem-obras-f', 'personagem-obras-m', 'simbolo-engenharia']);
  });

  it('resumo do que será aplicado', () => {
    expect(choiceSummary(EMPTY_CHOICE)).toEqual([]);
    expect(choiceSummary({ ...EMPTY_CHOICE, services: [svc('a'), svc('b')], organizeDashboard: true, agendaView: 'dia' })).toEqual(['2 tipos de serviço', 'Painel organizado', 'Agenda abre em Dia']);
  });
});

describe('aplicar', () => {
  it('cria só os serviços confirmados, com nome/valor editados, favorito, sem duração presumida; nada fictício nem XP', async () => {
    const s = await newUser();
    const before = snapshot(s);
    const r = await s.applyInitialSetup({ ...EMPTY_CHOICE, services: [svc('Corte feminino', '90,00', true), svc('Escova', '', false, '45')] });
    expect(r).toEqual({ created: 2, skipped: 0 });
    const [corte, escova] = s.data.serviceTypes;
    expect(corte).toMatchObject({ id: 'sugestao-beleza-corte-feminino', name: 'Corte feminino', price: 9_000, pinned: true });
    expect(corte).not.toHaveProperty('duration');
    expect(escova).toMatchObject({ price: null, pinned: false, duration: 45 });
    expect(snapshot(s)).toEqual(before);
  });

  it('repetir a configuração não duplica; nome já existente (com outra grafia) nunca é sobrescrito', async () => {
    const s = await newUser();
    await s.saveServiceType({ name: 'ESCOVA', price: '70,00' });
    const mine = s.data.serviceTypes[0]!;
    const choice: SetupChoice = { ...EMPTY_CHOICE, services: [svc('Escova', '50,00'), svc('Manicure', '40,00')] };
    expect(await s.applyInitialSetup(choice)).toEqual({ created: 1, skipped: 1 });
    expect(await s.applyInitialSetup(choice)).toEqual({ created: 0, skipped: 2 });
    expect(s.data.serviceTypes).toHaveLength(2);
    expect(s.data.serviceTypes.find((t) => t.id === mine.id)).toEqual(mine);
  });

  it('valor inválido: recusa tudo, sem criar nada', async () => {
    const s = await newUser();
    await expect(s.applyInitialSetup({ ...EMPTY_CHOICE, services: [svc('Ok', '10,00'), svc('Ruim', 'abc')] })).rejects.toBeInstanceOf(ValidationError);
    expect(s.data.serviceTypes).toHaveLength(0);
  });

  it('cor, imagem, Painel e Agenda só quando escolhidos; perfil intacto', async () => {
    const s = await newUser();
    const profile = JSON.stringify(s.data.profile);
    await s.applyInitialSetup({ ...EMPTY_CHOICE, accent: 'ameixa', avatarId: 'personagem-beleza-f', organizeDashboard: true, agendaView: 'dia' });
    expect(s.data.settings.accent).toBe('ameixa');
    expect(s.data.settings.avatar).toEqual({ kind: 'interno', id: 'personagem-beleza-f' });
    expect(dashboardEntries(readDashboard(s.data.settings.dashboard)).find((x) => x.id === 'receber')!.visible).toBe(true);
    expect(s.devicePrefs.agendaView).toBe('dia');
    expect(JSON.stringify(s.data.profile)).toBe(profile);
    expect(s.devicePrefs.reminders.enabled).toBe(false); // nada de notificações
  });

  it('Painel já personalizado nunca é reorganizado', async () => {
    const s = await newUser();
    await s.updateDashboard((l, at) => setCardVisible(l, 'nivel', false, at));
    const mine = s.data.settings.dashboard;
    await s.applyInitialSetup({ ...EMPTY_CHOICE, organizeDashboard: true });
    expect(s.data.settings.dashboard).toEqual(mine);
  });

  it('escolha vazia não muda nada', async () => {
    const s = await newUser();
    const before = JSON.stringify({ d: s.data, p: s.devicePrefs });
    await s.applyInitialSetup(EMPTY_CHOICE);
    expect(JSON.stringify({ d: s.data, p: s.devicePrefs })).toBe(before);
  });
});

describe('quando é oferecida', () => {
  it('cadastro pela tela de boas-vindas: oferecida e lembrada ao reabrir até pular ou aplicar', async () => {
    const storage = createMemoryAdapter();
    const s = await newUser(storage);
    expect(s.setupOffer).toBe(true);
    expect((await AppService.load(storage, now)).setupOffer).toBe(true);
    await s.dismissInitialSetup();
    expect((await AppService.load(storage, now)).setupOffer).toBe(false);
  });

  it('aplicar encerra a oferta; "Apagar todos os dados" também', async () => {
    const storage = createMemoryAdapter();
    const s = await newUser(storage);
    await s.applyInitialSetup({ ...EMPTY_CHOICE, agendaView: 'semana' });
    expect(s.setupOffer).toBe(false);
    const t = await newUser();
    await t.resetAll();
    expect(t.setupOffer).toBe(false);
  });

  it('quem atualiza (perfil já existente) ou cria o perfil sem a tela de boas-vindas não vê a oferta', async () => {
    const storage = createMemoryAdapter();
    const s = await AppService.load(storage, now);
    await s.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    expect(s.setupOffer).toBe(false);
    expect((await AppService.load(storage, now)).setupOffer).toBe(false);
  });

  it('recuperar a conta pelo Google (perfil vindo da nuvem) não oferece nem altera nada', async () => {
    const remote = new MemoryRemote();
    const ta = new TrackedStorage(createMemoryAdapter());
    const sa = await AppService.load(ta, now);
    const syncA = await SyncEngine.create(sa, ta, remote, { autoSync: false, now, isOnline: () => true });
    await sa.completeOnboarding({ name: 'Ana', businessName: '', professionId: 'beleza' });
    await sa.saveServiceType({ name: 'Meu serviço', price: '' });
    await syncA.setUser('u');
    await syncA.link('u', 'mesclar');
    const tb = new TrackedStorage(createMemoryAdapter());
    const b = await AppService.load(tb, now);
    const syncB = await SyncEngine.create(b, tb, remote, { autoSync: false, now, isOnline: () => true });
    await syncB.setUser('u');
    await syncB.link('u', 'usarNuvem');
    expect(b.data.profile?.name).toBe('Ana');
    expect(b.setupOffer).toBe(false);
  });
});
