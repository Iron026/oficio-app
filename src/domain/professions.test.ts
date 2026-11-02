import { PROFESSION_LIST, getProfession } from './professions';

describe('módulos de profissão', () => {
  it('tem as 5 profissões iniciais', () => {
    expect(PROFESSION_LIST.map((p) => p.id)).toEqual(['manutencao', 'beleza', 'limpeza', 'alimentacao', 'outros']);
  });

  it('adapta a terminologia', () => {
    expect(getProfession('beleza').terms.service).toBe('Atendimento');
    expect(getProfession('alimentacao').terms.service).toBe('Encomenda');
    expect(getProfession('alimentacao').terms.completedLabel).toBe('entregue');
  });

  it('todo módulo é completo e consistente', () => {
    for (const p of PROFESSION_LIST) {
      expect(p.serviceTemplates.length).toBeGreaterThan(0);
      expect(p.incomeCategories.length).toBeGreaterThan(0);
      expect(p.expenseCategories.length).toBeGreaterThan(0);
      expect(p.missions.length).toBeGreaterThanOrEqual(3);
      expect(new Set(p.missions.map((m) => m.id)).size).toBe(p.missions.length);
    }
  });

  it('id desconhecido cai em "outros"', () => {
    expect(getProfession(null).id).toBe('outros');
  });
});
