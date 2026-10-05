import type { AvatarParams } from '$shared/avatar.ts';

export const AVATAR_SIZE = 512;

/** Load an image (blob, data URL or URL) into a square ImageData, center-cropped */
export async function loadSquare(src: Blob | string, size = AVATAR_SIZE): Promise<ImageData> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return ctx.getImageData(0, 0, size, size);
}

/** Bilinear sample of the source at (x, y), written into out[o..o+3] */
function sample(src: ImageData, x: number, y: number, out: Uint8ClampedArray, o: number) {
  const w = src.width;
  const h = src.height;
  x = Math.min(w - 1.001, Math.max(0, x));
  y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const d = src.data;
  const i00 = (y0 * w + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + w * 4;
  const i11 = i01 + 4;
  for (let c = 0; c < 4; c++) {
    const top = d[i00 + c] * (1 - fx) + d[i10 + c] * fx;
    const bottom = d[i01 + c] * (1 - fx) + d[i11 + c] * fx;
    out[o + c] = top * (1 - fy) + bottom * fy;
  }
}

/** Apply the head effect: for every output pixel, find where to read in the source */
export function applyEffect(src: ImageData, p: AvatarParams): ImageData {
  const size = src.width;
  const out = new ImageData(size, size);
  const cx = p.cx * size;
  const cy = p.cy * size;
  const a = p.strength;
  const R = size * (0.28 + 0.2 * a);

  if (p.effect === 'none') {
    out.data.set(src.data);
    return out;
  }

  if (p.effect === 'pixel') {
    const block = Math.max(4, Math.round(6 + 26 * a));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const sx = Math.floor(x / block) * block + block / 2;
        const sy = Math.floor(y / block) * block + block / 2;
        const si = (Math.min(size - 1, sy | 0) * size + Math.min(size - 1, sx | 0)) * 4;
        const o = (y * size + x) * 4;
        out.data[o] = src.data[si];
        out.data[o + 1] = src.data[si + 1];
        out.data[o + 2] = src.data[si + 2];
        out.data[o + 3] = 255;
      }
    }
    return out;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sx = x;
      let sy = y;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const t = r / R;
      if (p.effect === 'wave') {
        sx = x + Math.sin(y / 18) * 14 * a;
        sy = y + Math.sin(x / 22) * 10 * a;
      } else if (t < 1) {
        // Smooth falloff so the edge of the effect blends in
        const fall = (1 - t) * (1 - t);
        if (p.effect === 'bulge') {
          const k = Math.pow(t, 1 + 1.4 * a) / Math.max(t, 1e-6);
          sx = cx + dx * k;
          sy = cy + dy * k;
        } else if (p.effect === 'pinch') {
          const k = Math.pow(t, 1 / (1 + 1.2 * a)) / Math.max(t, 1e-6);
          sx = cx + dx * k;
          sy = cy + dy * k;
        } else if (p.effect === 'swirl') {
          const angle = 4 * a * fall;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          sx = cx + dx * cos - dy * sin;
          sy = cy + dx * sin + dy * cos;
        } else if (p.effect === 'tall') {
          sy = cy + dy * (1 - 0.5 * a * fall);
        } else if (p.effect === 'wide') {
          sx = cx + dx * (1 - 0.5 * a * fall);
        }
      }
      sample(src, sx, sy, out.data, (y * size + x) * 4);
    }
  }
  return out;
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", sans-serif';

/** Draw the chosen emoji on top of the picture */
export function drawEmoji(ctx: CanvasRenderingContext2D, p: AvatarParams, size: number): void {
  if (!p.emoji) return;
  const px = p.esize * size;
  ctx.save();
  ctx.font = `${px}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = px * 0.08;
  ctx.fillText(p.emoji, p.ex * size, p.ey * size);
  ctx.restore();
}

/** JPEG data URL of an ImageData or canvas */
export async function toDataUrl(source: ImageData | HTMLCanvasElement, size: number, quality = 0.86): Promise<string> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  if (source instanceof ImageData) {
    const tmp = new OffscreenCanvas(source.width, source.height);
    tmp.getContext('2d')!.putImageData(source, 0, 0);
    ctx.drawImage(tmp, 0, 0, size, size);
  } else {
    ctx.drawImage(source, 0, 0, size, size);
  }
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}
