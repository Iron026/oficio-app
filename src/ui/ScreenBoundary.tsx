import { Component, type ReactNode } from 'react';

/**
 * Limite de erro por tela (auditoria pré-RC da 0.5.0). Sem ele, uma falha ao desenhar qualquer tela deixava o app em
 * branco, sem navegação. Agora só o conteúdo da tela vira um aviso; cabeçalho e navegação continuam. Recebe `key`
 * da página, então trocar de tela tenta de novo. Não mexe nos dados.
 */
export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="font-semibold">Não foi possível abrir esta tela.</p>
        <p className="mt-1 text-sm text-muted">Seus dados continuam guardados. Use a navegação para ir a outra tela ou feche e abra o app de novo.</p>
      </div>
    );
  }
}
