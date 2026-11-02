/**
 * Pilha de "voltar": componentes que se sobrepõem à tela (painéis, diálogos)
 * registram aqui como devem ser fechados. O botão Voltar do Android fecha
 * sempre o item mais recente antes de mudar de tela.
 */
type Handler = () => void;

const stack: { id: number; handler: Handler }[] = [];
let nextId = 1;

export function pushBackHandler(handler: Handler): () => void {
  const id = nextId++;
  stack.push({ id, handler });
  return () => {
    const i = stack.findIndex((h) => h.id === id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Executa o handler do topo. Retorna false se não havia nada para fechar. */
export function popBack(): boolean {
  // Remove antes de executar: mesmo que o handler não limpe a si mesmo,
  // o próximo "voltar" nunca repete o mesmo painel.
  const top = stack.pop();
  if (!top) return false;
  top.handler();
  return true;
}

export function backStackSize(): number {
  return stack.length;
}

export type BackAction = 'handled' | 'home' | 'exit';

/**
 * Decide o que o botão Voltar faz:
 * 1. fecha o painel/diálogo aberto;
 * 2. fora do Painel, volta ao Painel;
 * 3. no Painel (ou no cadastro inicial), sai do app (vai para segundo plano).
 */
export function decideBack(route: string, onboarding: boolean): BackAction {
  if (popBack()) return 'handled';
  if (!onboarding && route !== 'painel') return 'home';
  return 'exit';
}
