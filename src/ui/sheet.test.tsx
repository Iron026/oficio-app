import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { decideBack, popBack } from '../platform/backStack';
import { Sheet } from './Sheet';

function Stack() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(true);
  return (
    <>
      <Sheet open={outer} onClose={() => setOuter(false)} title="Agendar"><p>formulário</p></Sheet>
      <Sheet open={inner} onClose={() => setInner(false)} title="Tipos de serviço"><button type="button">dentro</button></Sheet>
    </>
  );
}

afterEach(() => {
  while (popBack()) { /* esvazia */ }
});

describe('Painéis empilhados', () => {
  it('Esc fecha só o painel de cima; o de baixo continua aberto', async () => {
    const user = userEvent.setup();
    render(<Stack />);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Agendar' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Voltar do Android também fecha um de cada vez', async () => {
    render(<Stack />);
    const { act } = await import('@testing-library/react');
    act(() => void decideBack('painel', false));
    expect(screen.getByRole('dialog', { name: 'Agendar' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Tipos de serviço' })).not.toBeInTheDocument();
  });
});
