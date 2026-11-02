import { ValidationError } from '../state/service';
import { friendlyError } from './errors';

describe('mensagens de erro amigáveis', () => {
  it('não duplica erros de formulário', () => {
    expect(friendlyError(new ValidationError({ name: 'x' }))).toBeNull();
  });

  it('armazenamento cheio', () => {
    expect(friendlyError(new DOMException('full', 'QuotaExceededError'))?.title).toBe('Armazenamento cheio');
  });

  it('cancelar o compartilhamento não é erro', () => {
    expect(friendlyError(new Error('Share canceled'))).toBeNull();
  });

  it('erros de backup mostram o motivo', () => {
    expect(friendlyError(new Error('Este arquivo não é um backup do Ofício.'))).toEqual({
      title: 'Não foi possível importar', description: 'Este arquivo não é um backup do Ofício.',
    });
  });

  it('erro genérico tranquiliza sobre os dados', () => {
    expect(friendlyError(new Error('falha X'))?.description).toMatch(/não foram afetados/);
  });
});
