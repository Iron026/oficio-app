import { ValidationError } from '../state/service';

/** Converte erros técnicos em mensagens claras para o usuário. */
export function friendlyError(err: unknown): { title: string; description: string } | null {
  if (err instanceof ValidationError) return null; // já exibido nos campos do formulário
  const name = err instanceof Error || err instanceof DOMException ? err.name : '';
  const message = err instanceof Error ? err.message : '';
  if (name === 'QuotaExceededError') {
    return { title: 'Armazenamento cheio', description: 'Libere espaço no aparelho e tente novamente. Seus dados anteriores continuam salvos.' };
  }
  if (name === 'AbortError' && /share/i.test(message)) return null; // usuário fechou o menu de compartilhar
  if (/share canceled|cancel/i.test(message)) return null;
  if (/permission|denied|not allowed/i.test(message)) {
    return { title: 'Permissão negada', description: 'O Ofício não recebeu permissão para acessar o arquivo. Tente outra opção de salvamento.' };
  }
  if (/backup|JSON|arquivo/i.test(message)) return { title: 'Não foi possível importar', description: message };
  if (/não encontrad/i.test(message)) return { title: 'Registro não encontrado', description: 'Ele pode ter sido excluído. Atualize a tela e tente novamente.' };
  return { title: 'Algo deu errado', description: message ? `${message} Seus dados salvos não foram afetados.` : 'Tente novamente. Seus dados salvos não foram afetados.' };
}
