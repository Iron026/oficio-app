import { PROFILE_IMAGE_ID, PROFILE_IMAGE_MAX_BASE64, PROFILE_IMAGE_MAX_BYTES, isValidProfileImage } from '../domain/profileImage';
import type { ProfileImage } from '../domain/types';

/**
 * Preparação da foto de perfil no próprio aparelho (nada é enviado para processar):
 * recorte quadrado escolhido pela pessoa → 320 px → WebP (JPEG se o navegador não
 * gerar WebP) com a qualidade reduzida até caber em 64 KiB. Metadados da câmera
 * (como localização) não passam para o arquivo gerado pelo canvas.
 */
export const PHOTO_OUTPUT_SIDE = 320;
/** Arquivos maiores que isto nem são abertos (protege a memória do aparelho). */
export const PHOTO_INPUT_MAX_BYTES = 25 * 1024 * 1024;

export interface Crop {
  /** 1 = a imagem cobre o quadro; até 4. */
  zoom: number;
  /** Deslocamento do centro, em frações do quadro (-0,5 a 0,5 conforme o zoom). */
  x: number;
  y: number;
}

export interface Source {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

export async function loadPhoto(file: File): Promise<Source> {
  if (!file.type.startsWith('image/') && file.type !== '') throw new Error('Escolha um arquivo de imagem.');
  if (file.size > PHOTO_INPUT_MAX_BYTES) throw new Error('Imagem grande demais (máximo de 25 MB).');
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    // Fallback: <img> (alguns WebViews antigos não decodificam HEIC/AVIF pelo createImageBitmap).
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('Não foi possível abrir esta imagem. Tente uma foto em JPG, PNG ou WebP.');
    }
  }
}

/** Limita o deslocamento para a imagem sempre cobrir o quadro (sem bordas vazias). */
export function clampCrop(c: Crop, w: number, h: number): Crop {
  const zoom = Math.min(4, Math.max(1, c.zoom));
  const cover = Math.max(1 / w, 1 / h); // escala p/ cobrir quadro de lado 1
  const iw = w * cover * zoom;
  const ih = h * cover * zoom;
  const mx = Math.max(0, (iw - 1) / 2);
  const my = Math.max(0, (ih - 1) / 2);
  const lim = (v: number, m: number) => Math.min(m, Math.max(-m, v)) || 0; // `|| 0` evita -0
  return { zoom, x: lim(c.x, mx), y: lim(c.y, my) };
}

/** Desenha o recorte num canvas quadrado de `side` px. */
export function drawCrop(ctx: CanvasRenderingContext2D, src: Source, crop: Crop, side: number) {
  const c = clampCrop(crop, src.width, src.height);
  const scale = Math.max(side / src.width, side / src.height) * c.zoom;
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(src.image, (side - dw) / 2 + c.x * side, (side - dh) / 2 + c.y * side, dw, dh);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function base64Of(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function hashOf(data: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0x811c9dc5; // FNV-1a (contexto sem crypto.subtle)
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data.charCodeAt(i), 0x01000193) >>> 0;
  return `fnv-${h.toString(16)}-${data.length}`;
}

/** Gera a foto final (≤ 64 KiB). Lança erro com mensagem clara se não conseguir. */
export async function encodePhoto(src: Source, crop: Crop, now = new Date()): Promise<ProfileImage> {
  for (const side of [PHOTO_OUTPUT_SIDE, 256, 192, 128]) {
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Este aparelho não conseguiu preparar a imagem.');
    drawCrop(ctx, src, crop, side);
    for (const type of ['image/webp', 'image/jpeg'] as const) {
      for (const q of [0.86, 0.78, 0.7, 0.6, 0.5, 0.4]) {
        const blob = await toBlob(canvas, type, q);
        if (!blob) break;
        if (blob.type !== type) break; // navegador sem suporte a este formato: tenta o próximo
        if (blob.size > PROFILE_IMAGE_MAX_BYTES) continue;
        const data = base64Of(await blob.arrayBuffer());
        if (data.length > PROFILE_IMAGE_MAX_BASE64) continue;
        const iso = now.toISOString();
        const img: ProfileImage = { id: PROFILE_IMAGE_ID, mime: type, data, bytes: blob.size, width: side, height: side, hash: await hashOf(data), createdAt: iso, updatedAt: iso };
        if (isValidProfileImage(img)) return img;
      }
    }
  }
  throw new Error('Não foi possível reduzir esta imagem para o tamanho permitido. Tente outra foto.');
}
