import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Minus, Plus, Trash2 } from 'lucide-react';
import { avatarOf } from '../domain/preferences';
import type { AvatarChoice } from '../domain/types';
import { useApp, useErrorHandler, useFeedback } from '../state/AppContext';
import { sealsPhotoSyncEnabled } from '../sync/features';
import { useProfile } from '../state/useProfile';
import { useConfirm } from '../ui/Confirm';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { initials } from '../ui/Avatar';
import { avatarSpokenName, avatarsByArea, getInternalAvatar, groupOf, type AvatarGroup, type InternalAvatar } from '../ui/avatarCatalog';
import { Segmented } from '../ui/Misc';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { clampCrop, drawCrop, encodePhoto, loadPhoto, type Crop, type Source } from '../ui/photoEncode';
import { Sheet } from '../ui/Sheet';

/** Escolha da imagem do perfil: foto própria (com recorte), avatar do Ofício ou iniciais. */
export function ProfileImageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [source, setSource] = useState<Source | null>(null);
  const close = () => {
    source?.close();
    setSource(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={source ? 'Ajustar foto' : 'Imagem de perfil'}>
      {open && (source ? <PhotoEditor source={source} onCancel={() => { source.close(); setSource(null); }} onDone={close} /> : <Chooser onPhoto={setSource} onDone={close} />)}
    </Sheet>
  );
}

function Chooser({ onPhoto, onDone }: { onPhoto: (s: Source) => void; onDone: () => void }) {
  const { data, service } = useApp();
  const { tier, featured } = useProfile();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const choice = avatarOf(data.settings);
  const photo = data.profileImages[0];
  const is = (c: AvatarChoice) => (c.kind === 'interno' ? choice.kind === 'interno' && choice.id === c.id : choice.kind === c.kind && (c.kind !== 'foto' || !!photo));

  async function pick(c: AvatarChoice) {
    try {
      await service.updateSettings({ avatar: c });
      feedback('Imagem de perfil atualizada');
      onDone();
    } catch (err) {
      onError(err);
    }
  }

  async function removePhoto() {
    const ok = await confirm({ title: 'Remover sua foto?', message: sealsPhotoSyncEnabled() ? 'A foto será apagada deste aparelho e, com conta conectada, também da nuvem. O perfil volta a mostrar suas iniciais.' : 'A foto será apagada deste aparelho. O perfil volta a mostrar suas iniciais.', confirmLabel: 'Remover foto', danger: true });
    if (!ok) return;
    try {
      await service.removeProfileImage();
      feedback('Foto removida');
      onDone();
    } catch (err) {
      onError(err);
    }
  }

  async function openFile(f: File) {
    try {
      onPhoto(await loadPhoto(f));
    } catch (err) {
      onError(err);
    }
  }

  const option = 'press-soft relative flex w-full min-w-0 flex-col items-center gap-1.5 rounded-2xl border-2 px-1 py-2 text-center text-xs font-medium';
  const tile = 'press-soft relative flex aspect-square w-full min-w-0 items-center justify-center rounded-2xl border-2 p-1';
  const current = choice.kind === 'interno' ? getInternalAvatar(choice.id) : undefined;
  const [tab, setTab] = useState<AvatarGroup>(current ? groupOf(current) : 'personagens');
  const currentName = choice.kind === 'foto' && photo ? 'Sua foto' : current ? current.name : 'Iniciais';
  const tileFor = (a: InternalAvatar) => {
    const on = is({ kind: 'interno', id: a.id });
    const spoken = avatarSpokenName(a);
    // Sem nome embaixo da imagem: o TalkBack lê o nome; o escolhido aparece na prévia acima.
    return (
      <button key={a.id} type="button" role="radio" aria-checked={on} aria-label={spoken} title={spoken} data-avatar-id={a.id} onClick={() => pick({ kind: 'interno', id: a.id })} className={cx(tile, on ? 'border-brand-500' : 'border-line')}>
        <img src={a.src} alt="" width={56} height={56} loading="lazy" decoding="async" className="h-14 w-14 rounded-full bg-surface-2 object-cover" />
        {on && <Selected />}
      </button>
    );
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2">
        <ProfileAvatar data={data} tier={tier} size={112} seal={featured ? { id: featured.def.id, stage: featured.stage } : null} />
        <p className="text-center text-sm font-semibold" aria-live="polite" data-avatar-current>{currentName}</p>
      </div>

      <section aria-labelledby="img-foto" className="space-y-2">
        <h3 id="img-foto" className="text-sm font-bold">Sua foto</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Camera size={18} />} onClick={() => fileRef.current?.click()}>{photo ? 'Trocar foto' : 'Escolher foto'}</Button>
          {photo && !is({ kind: 'foto' }) && <Button variant="secondary" onClick={() => pick({ kind: 'foto' })}>Usar minha foto</Button>}
          {photo && <Button variant="ghost" icon={<Trash2 size={18} />} onClick={removePhoto} className="text-red-700 dark:text-red-300">Remover foto</Button>}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          A foto é recortada e reduzida neste aparelho (até 64 KB, sem dados de localização).{' '}
          {sealsPhotoSyncEnabled()
            ? 'Com conta conectada, ela também é guardada na nuvem, acessível só pela sua conta.'
            : 'Nesta versão ela fica só neste aparelho e no arquivo de backup; não é enviada para a nuvem, mesmo com conta conectada.'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Escolher foto"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void openFile(f);
          }}
        />
      </section>

      <div role="radiogroup" aria-label="Imagem de perfil" className="space-y-4">
        <section aria-labelledby="img-ini" className="space-y-2">
          <h3 id="img-ini" className="text-sm font-bold">Iniciais</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-2">
            <button type="button" role="radio" aria-checked={is({ kind: 'iniciais' })} onClick={() => pick({ kind: 'iniciais' })} className={cx(option, is({ kind: 'iniciais' }) ? 'border-brand-500' : 'border-line')}>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 font-display text-lg font-extrabold text-brand-800 dark:bg-brand-500/25 dark:text-brand-50" aria-hidden="true">
                {initials(data.profile?.name ?? '') || '?'}
              </span>
              Iniciais
              {is({ kind: 'iniciais' }) && <Selected />}
            </button>
          </div>
        </section>

        <div>
          <Segmented label="Tipo de avatar" value={tab} onChange={setTab} options={[{ value: 'personagens', label: 'Personagens' }, { value: 'icones', label: 'Ícones' }]} />
        </div>
        {current?.legacy && (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted" data-avatar-legacy>
            Seu avatar atual é da coleção anterior. Ele continua no seu perfil; se escolher outro, a galeria mostra só a coleção atual.
          </p>
        )}
        {tab === 'personagens' ? (
          // Duas áreas por linha no celular: título da área e, embaixo, mulher e homem.
          // Subgrade: títulos da mesma linha têm a mesma altura, então os cartões ficam alinhados
          // mesmo quando um nome de área quebra em duas linhas.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-3 gap-y-1.5">
            {avatarsByArea('personagens').map(({ area, items }) => (
              <section key={area.id} aria-labelledby={`img-p-${area.id}`} className="row-span-2 grid min-w-0 grid-rows-subgrid">
                <h3 id={`img-p-${area.id}`} className="self-end text-sm font-bold leading-snug">{area.label}</h3>
                <div className="grid grid-cols-2 gap-2 pb-3">{items.map(tileFor)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
            {avatarsByArea('icones').flatMap(({ items }) => items).map(tileFor)}
          </div>
        )}
      </div>
      <p className="text-xs text-muted">Os avatares do Ofício ficam no próprio app e funcionam sem internet.</p>
    </div>
  );
}

function Selected() {
  return (
    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden="true">
      <Check size={13} strokeWidth={3} />
    </span>
  );
}

const PREVIEW = 260;

/** Recorte: arrastar move, pinça ou botões/controle deslizante aproximam. Funciona com teclado (setas e +/-). */
function PhotoEditor({ source, onCancel, onDone }: { source: Source; onCancel: () => void; onDone: () => void }) {
  const { service } = useApp();
  const feedback = useFeedback();
  const onError = useErrorHandler();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const update = (c: Crop) => setCrop(clampCrop(c, source.width, source.height));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = PREVIEW * dpr;
    canvas.height = PREVIEW * dpr;
    drawCrop(ctx, source, crop, PREVIEW * dpr);
  }, [source, crop]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: crop.zoom };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      update({ ...crop, zoom: pinch.current.zoom * (d / Math.max(1, pinch.current.dist)) });
    } else if (pointers.current.size === 1) {
      update({ ...crop, x: crop.x + (e.clientX - prev.x) / PREVIEW, y: crop.y + (e.clientY - prev.y) / PREVIEW });
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }
  function onKey(e: React.KeyboardEvent) {
    const step = 0.03;
    const map: Record<string, Partial<Crop>> = {
      ArrowLeft: { x: crop.x - step }, ArrowRight: { x: crop.x + step }, ArrowUp: { y: crop.y - step }, ArrowDown: { y: crop.y + step },
      '+': { zoom: crop.zoom + 0.1 }, '=': { zoom: crop.zoom + 0.1 }, '-': { zoom: crop.zoom - 0.1 },
    };
    const p = map[e.key];
    if (!p) return;
    e.preventDefault();
    update({ ...crop, ...p });
  }

  async function save() {
    setBusy(true);
    try {
      const img = await encodePhoto(source, crop);
      await service.setProfileImage(img);
      feedback('Foto de perfil salva', undefined, `${Math.round(img.bytes / 1024)} KB · ${img.width}×${img.height} px`);
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Arraste para posicionar e use o zoom para enquadrar o rosto no círculo.</p>
      <div className="flex justify-center">
        <div
          role="application"
          tabIndex={0}
          aria-label="Área de recorte da foto. Use as setas para mover e as teclas mais e menos para o zoom."
          className="relative touch-none select-none overflow-hidden rounded-2xl bg-surface-2 outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500"
          style={{ width: PREVIEW, height: PREVIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKey}
          onWheel={(e) => update({ ...crop, zoom: crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })}
        >
          <canvas ref={canvasRef} style={{ width: PREVIEW, height: PREVIEW }} aria-hidden="true" />
          {/* Máscara circular: mostra exatamente o que aparece no perfil. */}
          <span className="pointer-events-none absolute inset-0 [background:radial-gradient(circle,transparent_calc(50%-1px),rgb(0_0_0/0.45)_50%)]" aria-hidden="true" />
          <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" aria-hidden="true" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2" aria-label="Diminuir zoom" onClick={() => update({ ...crop, zoom: crop.zoom - 0.2 })}><Minus size={18} aria-hidden="true" /></button>
        <label className="flex-1">
          <span className="sr-only">Zoom</span>
          <input type="range" min={1} max={4} step={0.01} value={crop.zoom} onChange={(e) => update({ ...crop, zoom: Number(e.target.value) })} className="h-11 w-full accent-[var(--color-brand-600)]" aria-valuetext={`${Math.round(crop.zoom * 100)}%`} />
        </label>
        <button type="button" className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2" aria-label="Aumentar zoom" onClick={() => update({ ...crop, zoom: crop.zoom + 0.2 })}><Plus size={18} aria-hidden="true" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Usar foto'}</Button>
      </div>
    </div>
  );
}
