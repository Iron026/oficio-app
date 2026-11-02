import { backStackSize, decideBack, popBack, pushBackHandler } from './backStack';

describe('botão Voltar do Android', () => {
  afterEach(() => {
    while (popBack()) { /* esvazia */ }
  });

  it('fecha primeiro o painel aberto mais recente', () => {
    const closed: string[] = [];
    pushBackHandler(() => closed.push('lista'));
    pushBackHandler(() => closed.push('formulario'));
    expect(decideBack('clientes', false)).toBe('handled');
    expect(closed).toEqual(['formulario']);
  });

  it('remover o handler (painel fechado pelo X) o tira da pilha', () => {
    const remove = pushBackHandler(() => undefined);
    expect(backStackSize()).toBe(1);
    remove();
    expect(backStackSize()).toBe(0);
  });

  it('fora do Painel, volta ao Painel', () => {
    expect(decideBack('financas', false)).toBe('home');
  });

  it('no Painel ou no cadastro inicial, sai do app', () => {
    expect(decideBack('painel', false)).toBe('exit');
    expect(decideBack('agenda', true)).toBe('exit');
  });
});
