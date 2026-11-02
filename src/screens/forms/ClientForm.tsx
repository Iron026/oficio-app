import { useState } from 'react';
import type { Client } from '../../domain/types';
import { useApp, useErrorHandler, useFeedback } from '../../state/AppContext';
import { hasErrors, validateClient, type ClientInput, type Errors } from '../../lib/validation';
import { Button } from '../../ui/Button';
import { TextArea, TextField } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';

const empty: ClientInput = { name: '', phone: '', email: '', address: '', notes: '' };

/** Máscara simples de telefone brasileiro enquanto digita. */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function ClientFormSheet({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client?: Client; onSaved?: (c: Client) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={client ? 'Editar cliente' : 'Novo cliente'}>
      {open && <ClientForm client={client} onDone={(c) => { onSaved?.(c); onClose(); }} />}
    </Sheet>
  );
}

function ClientForm({ client, onDone }: { client?: Client; onDone: (c: Client) => void }) {
  const { service } = useApp();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const [v, setV] = useState<ClientInput>(client ? { name: client.name, phone: client.phone, email: client.email, address: client.address, notes: client.notes } : empty);
  const [errors, setErrors] = useState<Errors<ClientInput>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ClientInput) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [k]: k === 'phone' ? maskPhone(e.target.value) : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateClient(v);
    setErrors(errs);
    if (hasErrors(errs)) return;
    setSaving(true);
    try {
      const res = await service.saveClient(v, client?.id);
      feedback(client ? 'Cliente atualizado' : 'Cliente cadastrado', res.feedback);
      onDone(res.client);
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField label="Nome" value={v.name} onChange={set('name')} error={errors.name} autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={80} />
      <TextField label="Telefone / WhatsApp" value={v.phone} onChange={set('phone')} error={errors.phone} inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="(11) 91234-5678" optional />
      <TextField label="E-mail" value={v.email} onChange={set('email')} error={errors.email} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" enterKeyHint="next" optional />
      <TextField label="Endereço" value={v.address} onChange={set('address')} optional maxLength={120} />
      <TextArea label="Observações" value={v.notes} onChange={set('notes')} error={errors.notes} optional maxLength={500} placeholder="Preferências, detalhes importantes..." />
      <Button type="submit" block size="lg" disabled={saving}>{client ? 'Salvar alterações' : 'Cadastrar cliente'}</Button>
    </form>
  );
}
