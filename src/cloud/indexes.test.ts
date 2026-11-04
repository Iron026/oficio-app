import { readFileSync } from 'node:fs';

/**
 * A foto vai como texto base64 em users/{uid}/records/profileImages__atual, campo data.data.
 * Nenhuma consulta usa esse conteúdo, então o campo fica sem índice (menos armazenamento e
 * gravações mais leves). As consultas do app usam só `updatedAt` e `deleted`.
 */
describe('firestore.indexes.json', () => {
  const cfg = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as {
    indexes: unknown[];
    fieldOverrides: { collectionGroup: string; fieldPath: string; indexes: unknown[] }[];
  };

  it('isenta de indexação o conteúdo da foto (data.data em records)', () => {
    expect(cfg.fieldOverrides).toContainEqual(expect.objectContaining({ collectionGroup: 'records', fieldPath: 'data.data', indexes: [] }));
  });

  it('não desliga os índices usados nas consultas (updatedAt e deleted) nem cria índices compostos', () => {
    expect(cfg.indexes).toEqual([]);
    expect(cfg.fieldOverrides.map((f) => f.fieldPath)).not.toEqual(expect.arrayContaining(['updatedAt']));
    expect(cfg.fieldOverrides.map((f) => f.fieldPath)).not.toEqual(expect.arrayContaining(['deleted']));
  });

  it('o código grava a foto exatamente nesse caminho (records/<coleção>__<id> com o registro em "data")', () => {
    const src = readFileSync('src/cloud/firestoreRemote.ts', 'utf8');
    expect(src).toMatch(/collection\(this\.db, 'users', uid, 'records'\)/);
    expect(src).toMatch(/data: it\.data \? clean\(it\.data\) : null/);
  });
});
