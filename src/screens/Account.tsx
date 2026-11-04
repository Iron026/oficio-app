import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Cloud, CloudAlert, CloudCheck, CloudOff, CloudUpload, Database, LogOut, RefreshCw, ShieldCheck, Smartphone, Trash2, UserRound } from 'lucide-react';
import type { LinkAnalysis, LinkMode } from '../sync/engine';
import type { SyncConflict, SyncStatus } from '../sync/types';
import { formatMoney } from '../lib/money';
import { useApp, useErrorHandler } from '../state/AppContext';
import { useCloud } from '../state/CloudContext';
import { navigate } from '../state/router';
import { Button, IconButton } from '../ui/Button';
import { useConfirm } from '../ui/Confirm';
import { cx } from '../ui/cx';
import { Card } from '../ui/Misc';
import { sealsPhotoSyncEnabled } from '../sync/features';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function statusLabel(s: SyncStatus): { text: string; tone: 'ok' | 'busy' | 'wait' | 'error' | 'off' } {
  switch (s.state) {
    case 'sincronizado':
      return { text: 'Sincronizado', tone: 'ok' };
    case 'sincronizando':
      return { text: 'Sincronizando…', tone: 'busy' };
    case 'offline':
      return { text: 'Aguardando conexão', tone: 'wait' };
    case 'pendente':
      return { text: 'Alterações pendentes', tone: 'wait' };
    case 'erro':
      return { text: 'Erro na sincronização', tone: 'error' };
    default:
      return { text: 'Somente neste aparelho', tone: 'off' };
  }
}

const toneClass = {
  ok: 'text-brand-600 dark:text-brand-300',
  busy: 'text-sky-600 dark:text-sky-300',
  wait: 'text-amber-600 dark:text-amber-300',
  error: 'text-red-700 dark:text-red-400',
  off: 'text-muted',
};

/** Ícone do estado real da sincronização (cada estado com um desenho próprio). */
export function StatusIcon({ status, size = 18, onHero }: { status: SyncStatus; size?: number; onHero?: boolean }) {
  const { tone } = statusLabel(status);
  const Icon = status.state === 'erro' ? CloudAlert
    : status.state === 'offline' ? CloudOff
    : status.state === 'pendente' ? CloudUpload
    : status.state === 'sincronizando' ? RefreshCw
    : status.state === 'sincronizado' ? CloudCheck
    : Cloud;
  // Girar só enquanto a sincronização está de fato em andamento (para com "Reduzir animações").
  return <Icon size={size} aria-hidden="true" className={cx(onHero ? 'text-white' : toneClass[tone], tone === 'busy' && 'animate-spin motion-reduce:animate-none')} />;
}

/** Botão de nuvem do topo: abre direto a folha "Sincronização e nuvem". */
export function SyncIndicator({ onHero }: { onHero?: boolean }) {
  const { available, linked, status, sync } = useCloud();
  const [open, setOpen] = useState(false);
  if (!available && !linked) return null;
  const shown: SyncStatus = linked ? status : { state: 'desativado' };
  const { text, tone } = statusLabel(shown);
  const pending = linked ? sync.pendingCount : 0;
  return (
    <>
      <IconButton
        label={`Sincronização e nuvem: ${text}${pending ? `, ${pending} ${pending === 1 ? 'alteração pendente' : 'alterações pendentes'}` : ''}`}
        onClick={() => setOpen(true)}
        className={cx(onHero && 'relative text-white hover:bg-white/15 hover:text-white')}
      >
        <StatusIcon status={shown} size={20} onHero={onHero} />
        {onHero && pending > 0 && (shown.state === 'pendente' || shown.state === 'offline') ? (
          <span aria-hidden="true" className="absolute right-0.5 top-0.5 min-w-[1.125rem] rounded-full bg-amber-300 px-1 font-display text-[0.75rem] font-extrabold leading-[1.125rem] text-amber-950 ring-2 ring-[var(--hero-1)]">{pending > 99 ? '99+' : pending}</span>
        ) : onHero && tone === 'error' ? (
          <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-[var(--hero-1)]" />
        ) : null}
      </IconButton>
      <SyncSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Row({ icon, k, children }: { icon: ReactNode; k: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span className="mt-0.5 shrink-0 text-muted" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1"><p className="font-display text-xs font-bold uppercase tracking-wider text-muted">{k}</p>{children}</div>
    </div>
  );
}

/** Folha "Sincronização e nuvem": estado real, pendências, conexão, erros e ações. */
export function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { linked, status, sync, user } = useCloud();
  const onError = useErrorHandler();
  const [busy, setBusy] = useState(false);
  const shown: SyncStatus = linked ? status : { state: 'desativado' };
  const { text, tone } = statusLabel(shown);
  const pending = linked ? sync.pendingCount : 0;
  const goAccount = () => { onClose(); if (window.location.hash !== '#/ajustes/conta') navigate('ajustes', 'conta'); };
  async function syncNow() {
    setBusy(true);
    try { await sync.sync(); } catch (err) { onError(err); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Sincronização e nuvem">
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-500/25 dark:text-brand-50" aria-hidden="true"><UserRound size={20} /></span>
          <div className="min-w-0">
            <p className="font-display font-bold [overflow-wrap:anywhere]">{linked ? (user?.name || 'Conta Google') : 'Somente neste aparelho'}</p>
            <p className="text-muted [overflow-wrap:anywhere]">{linked ? `${sync.linkedEmail ?? user?.email ?? ''} · conta Google conectada` : 'Nenhuma conta conectada. Os dados ficam só aqui.'}</p>
          </div>
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line">
          <Row icon={<StatusIcon status={shown} size={20} />} k="Estado">
            <p role="status" className={cx('font-display text-base font-bold', toneClass[tone])}>{text}</p>
            <p className="text-muted">
              {shown.state === 'erro' ? 'Seus dados continuam seguros neste aparelho.'
                : sync.lastSyncedAt && linked ? `Última sincronização confirmada: ${fmtDateTime(sync.lastSyncedAt)}`
                : linked ? 'Ainda não há sincronização confirmada.' : 'Conecte a conta Google para guardar uma cópia na nuvem.'}
            </p>
            {shown.state === 'erro' && <p className="mt-1 text-red-700 dark:text-red-300 [overflow-wrap:anywhere]">{shown.message}</p>}
          </Row>
          {linked && (
            <Row icon={<CloudUpload size={20} />} k="Pendentes">
              <p className="font-display font-bold">{pending === 0 ? 'Nenhuma alteração aguardando envio' : `${pending} ${pending === 1 ? 'alteração aguardando envio' : 'alterações aguardando envio'}`}</p>
              <p className="text-muted">{pending === 0 ? 'Tudo o que você registrou já está na nuvem.' : 'Serão enviadas automaticamente quando houver conexão.'}</p>
            </Row>
          )}
          <Row icon={shown.state === 'offline' ? <CloudOff size={20} /> : <Smartphone size={20} />} k="Conexão">
            <p className="font-display font-bold">{shown.state === 'offline' ? 'Sem conexão' : 'Funciona sem internet'}</p>
            <p className="text-muted">O Ofício guarda tudo neste aparelho primeiro{linked ? ' e envia para a nuvem quando a conexão volta' : ''}.</p>
          </Row>
          {linked && sync.conflicts.length > 0 && (
            <Row icon={<AlertTriangle size={20} />} k="Para revisar">
              <p className="font-display font-bold">{sync.conflicts.length} {sync.conflicts.length === 1 ? 'registro financeiro' : 'registros financeiros'} com versões diferentes</p>
              <button type="button" onClick={goAccount} className="mt-1 font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-300">Revisar em Conta e sincronização</button>
            </Row>
          )}
        </div>
        <div>
          <p className="mb-1.5 font-semibold">O que vai para a nuvem</p>
          <ul className="space-y-1.5">
            <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />Perfil, clientes, agenda, finanças, XP, missões e conquistas{linked ? '' : ' (quando você conectar a conta)'}</li>
            {sealsPhotoSyncEnabled()
              ? <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />Foto de perfil e selos</li>
              : <li className="flex gap-2 text-muted"><Smartphone size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Foto de perfil e selos: <b className="text-fg">só neste aparelho e no backup</b> nesta versão</span></li>}
          </ul>
        </div>
        <div className="grid gap-2">
          {linked && <Button block icon={<RefreshCw size={18} className={busy ? 'animate-spin motion-reduce:animate-none' : undefined} />} disabled={busy || shown.state === 'sincronizando'} onClick={syncNow}>{shown.state === 'erro' ? 'Tentar novamente' : 'Sincronizar agora'}</Button>}
          <Button block variant={linked ? 'secondary' : 'primary'} icon={<Database size={18} />} onClick={goAccount}>{linked ? 'Conta e sincronização' : 'Conectar conta Google'}</Button>
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ fluxo de conexão

/** Botão "Continuar com Google" + assistente de associação dos dados. */
export function useAccountFlow() {
  const { account } = useCloud();
  const onError = useErrorHandler();
  const toast = useToast();
  const [analysis, setAnalysis] = useState<LinkAnalysis | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!account) return;
    setBusy(true);
    try {
      const out = await account.signIn();
      if (out.status === 'cancelado') toast({ title: 'Login cancelado', description: 'Nada foi alterado.', tone: 'info' });
      else if (out.status === 'conectado') toast({ title: 'Conta conectada', description: out.user.email ?? undefined });
      else if (out.status === 'outraConta')
        toast({
          title: 'Este aparelho está associado a outra conta',
          description: `Para não misturar dados, entre com ${out.linkedEmail ?? 'a conta anterior'} ou desassocie o aparelho em Ajustes → Conta e sincronização.`,
          tone: 'error',
        });
      else setAnalysis(out.analysis);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const sheet = analysis ? <LinkSheet analysis={analysis} onDone={() => setAnalysis(null)} /> : null;
  return { start, busy, sheet };
}

function Summary({ title, s }: { title: string; s: LinkAnalysis['local'] }) {
  return (
    <div className="flex-1 rounded-xl bg-surface-2 p-3 text-sm">
      <p className="mb-1 font-semibold">{title}</p>
      {s.profileName && <p className="truncate">Perfil: {s.profileName}</p>}
      <p>{s.clients} clientes</p>
      <p>{s.appointments} serviços</p>
      <p>{s.transactions} lançamentos</p>
      <p>{s.xp} XP</p>
    </div>
  );
}

function LinkSheet({ analysis, onDone }: { analysis: LinkAnalysis; onDone: () => void }) {
  const { account } = useCloud();
  const onError = useErrorHandler();
  const toast = useToast();
  const [mode, setMode] = useState<LinkMode>(analysis.suggested);
  const [busy, setBusy] = useState(false);
  const recovering = !analysis.localHasData && analysis.remoteHasData;
  const uploading = analysis.localHasData && !analysis.remoteHasData;

  async function confirm() {
    if (!account) return;
    setBusy(true);
    try {
      await account.link(analysis.automatic ? analysis.suggested : mode);
      const st = account.sync.getStatus().state;
      toast({
        title: recovering ? 'Dados recuperados' : 'Conta conectada',
        description: st === 'sincronizado' ? 'Tudo salvo na nuvem.' : 'Os dados serão enviados assim que houver conexão.',
      });
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!account) return onDone();
    await account.cancelLink().catch(() => undefined);
    toast({ title: 'Conexão cancelada', description: 'Nenhum dado foi alterado.', tone: 'info' });
    onDone();
  }

  return (
    <Sheet
      open
      title={recovering ? 'Recuperar seus dados' : 'Conectar seus dados à conta'}
      onClose={cancel}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" block onClick={cancel} disabled={busy}>Cancelar</Button>
          <Button block onClick={confirm} disabled={busy}>{recovering ? 'Recuperar' : uploading ? 'Enviar e conectar' : 'Conectar'}</Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm leading-relaxed">
        {recovering ? (
          <p>Encontramos dados salvos nesta conta. Eles serão baixados para este aparelho e passarão a ser sincronizados.</p>
        ) : !analysis.localHasData && !analysis.remoteHasData ? (
          <p>Esta conta ainda não tem dados do Ofício. Ao conectar, o que você cadastrar será guardado nela automaticamente.</p>
        ) : (
          <p>
            Ao conectar, uma cópia dos seus dados do Ofício (perfil, clientes, serviços, receitas e despesas, metas, XP, missões e conquistas{sealsPhotoSyncEnabled() ? ', selos e foto de perfil' : ''}) passa a ser guardada na
            nuvem, vinculada à sua conta Google, para você recuperá-los em outro aparelho.
            {!sealsPhotoSyncEnabled() && ' Nesta versão, selos e foto de perfil ficam só neste aparelho e no arquivo de backup.'}
          </p>
        )}
        <div className="flex gap-2">
          <Summary title="Neste aparelho" s={analysis.local} />
          <Summary title="Na conta" s={analysis.remote} />
        </div>
        {!analysis.automatic && (
          <div role="radiogroup" aria-label="Como combinar os dados" className="space-y-2">
            {(
              [
                ['mesclar', 'Juntar os dados (recomendado)', 'Une os dois lados sem duplicar registros. XP e conquistas são mantidos.'],
                ['usarNuvem', 'Usar somente os dados da conta', 'Os dados deste aparelho são substituídos pelos da conta (uma cópia de segurança é guardada).'],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cx('w-full rounded-xl border-2 p-3 text-left', mode === value ? 'border-brand-500' : 'border-line')}
              >
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-muted">{hint}</span>
              </button>
            ))}
          </div>
        )}
        {analysis.previousAccountEmail && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Os dados deste aparelho vieram de outra conta ({analysis.previousAccountEmail}). Ao juntar, eles serão copiados para a conta atual.
          </p>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Antes de qualquer mudança, o Ofício guarda uma cópia de segurança deste aparelho. Se cancelar, nada é alterado.
        </p>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ Ajustes

export function AccountSection() {
  const { account, available, user, linked, status, sync } = useCloud();
  const { profession } = useApp();
  const flow = useAccountFlow();
  const confirm = useConfirm();
  const toast = useToast();
  const onError = useErrorHandler();
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = run(async () => {
    if (!account) return;
    // Envia o que estiver pendente antes de desconectar.
    const pending = await account.flushBeforeDisconnect();
    const ok = await confirm({
      title: 'Desconectar conta?',
      message:
        (pending > 0
          ? `Atenção: ${pending} alteraç${pending === 1 ? 'ão ainda não foi enviada' : 'ões ainda não foram enviadas'} para a nuvem (sem conexão). Elas continuarão apenas neste aparelho. `
          : 'Todas as alterações já estão salvas na nuvem. ') +
        'Seus dados continuam neste aparelho e os já salvos na nuvem continuam na sua conta. Alterações feitas a partir de agora ficam só no aparelho até você conectar de novo.',
      confirmLabel: 'Desconectar',
      danger: pending > 0,
    });
    if (!ok) return;
    await account.disconnect();
    toast({ title: 'Conta desconectada', description: 'Os dados permanecem neste aparelho.', tone: 'info' });
  });

  const forget = run(async () => {
    if (!account) return;
    const ok = await confirm({
      title: 'Desassociar este aparelho?',
      message: `Os dados continuam neste aparelho, mas deixam de ser sincronizados com ${sync.linkedEmail ?? 'a conta anterior'}${sync.pendingCount > 0 ? `, e ${sync.pendingCount} alteração(ões) ainda não enviada(s) ficará(ão) só aqui` : ''}. Os dados já salvos na nuvem não são alterados. Depois você poderá conectar outra conta.`,
      confirmLabel: 'Desassociar',
      danger: true,
    });
    if (!ok) return;
    await account.forgetLinkedAccount();
    toast({ title: 'Aparelho desassociado', description: 'Os dados permanecem neste aparelho.', tone: 'info' });
  });

  const remove = run(async () => {
    const ok = await confirm({
      title: 'Excluir conta e dados na nuvem?',
      message:
        'Isto apaga permanentemente todos os dados do Ofício guardados na nuvem e o seu acesso ao Ofício com esta conta Google. Os dados deste aparelho serão mantidos (para apagá-los, use "Apagar todos os dados"). Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir permanentemente',
      danger: true,
      requireText: 'EXCLUIR',
    });
    if (!ok || !account) return;
    await account.deleteAccount();
    toast({ title: 'Conta e dados na nuvem excluídos', tone: 'info' });
  });

  let body: ReactNode;
  if (!account) {
    body = <p className="text-sm text-muted">Carregando…</p>;
  } else if (!available) {
    body = (
      <div className="text-sm">
        <p className="font-semibold">Conta Google em breve</p>
        <p className="text-muted">Esta versão ainda não foi conectada ao servidor. Seus dados ficam apenas neste aparelho — use o backup manual para guardá-los.</p>
      </div>
    );
  } else if (!user && sync.linkedUid) {
    // Sessão encerrada, mas o aparelho continua associado: alterações ficam pendentes.
    body = (
      <div className="space-y-3 text-sm">
        <p className="font-semibold">Associado a {sync.linkedEmail ?? 'uma conta Google'}</p>
        <p className="text-muted">
          A sessão foi encerrada. Entre novamente com a mesma conta para retomar a sincronização
          {sync.pendingCount > 0 ? ` (${sync.pendingCount} alteraç${sync.pendingCount === 1 ? 'ão pendente' : 'ões pendentes'})` : ''}.
        </p>
        <GoogleButton onClick={flow.start} busy={flow.busy} label="Entrar novamente com Google" />
        <Button variant="ghost" size="sm" block onClick={forget} disabled={busy}>Desassociar este aparelho</Button>
      </div>
    );
  } else if (!user) {
    body = (
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Conecte sua conta Google para guardar uma cópia dos seus dados na nuvem e recuperá-los ao trocar de celular ou reinstalar o app. É opcional: sem conta, tudo
          continua funcionando apenas neste aparelho.
        </p>
        <GoogleButton onClick={flow.start} busy={flow.busy} />
      </div>
    );
  } else {
    const { text, tone } = statusLabel(status);
    body = (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="h-11 w-11 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2"><UserRound size={22} aria-hidden="true" /></span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.name ?? 'Conta Google'}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
        </div>
        {linked ? (
          <>
            <div className="rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
              <p className={cx('flex items-center gap-1.5 font-semibold', toneClass[tone])}><StatusIcon status={status} size={16} /> {text}</p>
              <p className="text-muted">
                {sync.lastSyncedAt ? `Último backup confirmado na nuvem: ${fmtDateTime(sync.lastSyncedAt)}` : 'Ainda não há backup confirmado na nuvem.'}
                {sync.pendingCount > 0 && ` · ${sync.pendingCount} alteraç${sync.pendingCount === 1 ? 'ão pendente' : 'ões pendentes'}`}
              </p>
              {status.state === 'erro' && <p className="mt-1 text-red-700 dark:text-red-400">{status.message}</p>}
            </div>
            {sync.conflicts.length > 0 && (
              <button type="button" onClick={() => setConflictsOpen(true)} className="flex w-full items-center gap-2 rounded-xl bg-amber-50 p-3 text-left text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
                <AlertTriangle size={16} aria-hidden="true" />
                {sync.conflicts.length} registro{sync.conflicts.length > 1 ? 's' : ''} financeiro{sync.conflicts.length > 1 ? 's' : ''} com versões diferentes. Toque para revisar.
              </button>
            )}
            <Button variant="secondary" block icon={<RefreshCw size={16} />} disabled={busy || status.state === 'sincronizando'} onClick={() => void sync.sync()}>
              Sincronizar agora
            </Button>
          </>
        ) : (
          <Button block onClick={flow.start} disabled={flow.busy}>Conectar os dados deste aparelho</Button>
        )}
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Button variant="secondary" block icon={<LogOut size={18} />} onClick={disconnect} disabled={busy}>Desconectar</Button>
          <Button variant="ghost" block className="text-red-600 dark:text-red-400" icon={<Trash2 size={18} />} onClick={remove} disabled={busy}>
            Excluir conta e dados na nuvem
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card>{body}</Card>
      {flow.sheet}
      <ConflictsSheet open={conflictsOpen} onClose={() => setConflictsOpen(false)} serviceLabel={profession.terms.service} />
    </>
  );
}

export function GoogleButton({ onClick, busy, label = 'Continuar com Google' }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-white font-semibold text-[#1f1f1f] shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3]"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {busy ? 'Aguarde…' : label}
    </button>
  );
}

// ------------------------------------------------------------------ conflitos

function describe(c: SyncConflict, serviceLabel: string) {
  const v = (c.local ?? c.remote) as Record<string, unknown>;
  const name = String(v.title ?? v.description ?? '');
  return { kind: c.collection === 'transactions' ? 'Lançamento' : serviceLabel, name };
}

const fieldLabel: Record<string, string> = { amount: 'Valor', price: 'Valor', date: 'Data', description: 'Descrição', title: 'Descrição', category: 'Categoria', status: 'Situação', type: 'Tipo', time: 'Horário', clientId: 'Cliente', notes: 'Observações', completedAt: 'Conclusão', transactionId: 'Receita vinculada' };

function show(field: string, value: unknown) {
  if ((field === 'amount' || field === 'price') && typeof value === 'number') return formatMoney(value);
  return value == null || value === '' ? '—' : String(value);
}

function ConflictsSheet({ open, onClose, serviceLabel }: { open: boolean; onClose: () => void; serviceLabel: string }) {
  const { sync } = useCloud();
  const onError = useErrorHandler();
  const resolve = (key: string, choice: 'local' | 'remote') => sync.resolveConflict(key, choice).catch(onError);
  return (
    <Sheet open={open} onClose={onClose} title="Revisar versões diferentes">
      <p className="mb-4 text-sm text-muted">
        Estes registros financeiros foram alterados em aparelhos diferentes. Nenhum valor foi substituído automaticamente: escolha qual versão manter.
      </p>
      {sync.conflicts.length === 0 && <p className="text-sm">Nada para revisar.</p>}
      <ul className="space-y-3">
        {sync.conflicts.map((c) => {
          const d = describe(c, serviceLabel);
          return (
            <li key={c.key} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-semibold">{d.kind}: {d.name}</p>
              {c.kind === 'campos' ? (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-muted"><th className="text-left font-normal">Campo</th><th className="text-left font-normal">Este aparelho</th><th className="text-left font-normal">Nuvem</th></tr>
                  </thead>
                  <tbody>
                    {c.fields.map((f) => (
                      <tr key={f}><td>{fieldLabel[f] ?? f}</td><td>{show(f, c.local?.[f])}</td><td>{show(f, c.remote?.[f])}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  {c.kind === 'excluido_aqui' ? 'Excluído neste aparelho, mas alterado em outro. Ele foi mantido.' : 'Excluído em outro aparelho, mas alterado neste. Ele foi mantido.'}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" onClick={() => void resolve(c.key, 'local')}>{c.local ? 'Manter deste aparelho' : 'Confirmar exclusão'}</Button>
                <Button size="sm" variant="secondary" onClick={() => void resolve(c.key, 'remote')}>{c.remote ? 'Usar da nuvem' : 'Confirmar exclusão'}</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
