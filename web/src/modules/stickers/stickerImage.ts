/** Canvas helpers that turn a cut-out photo, a drawing or an image into a sticker */

/** Longest side of a finished sticker, in pixels */
export const STICKER_SIZE = 512;
/** Width of the white border around a finished sticker, in pixels */
const BORDER = 14;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Crops to the visible pixels, or null when nothing is visible */
export function trim(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const { width: w, height: h } = src;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Nearly transparent pixels (anti-aliasing dust) do not count
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d')!.drawImage(src, -x0, -y0);
  return out;
}

/** Scales down so the longest side is at most `max` */
export function fit(src: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  if (scale === 1) return src;
  const out = makeCanvas(src.width * scale, src.height * scale);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/**
 * How wide the finished border is in the source's pixels, for a shape whose longest side is
 * `side` (the sticker is scaled down to fit, the border is not): used to preview it.
 */
export function borderFor(side: number): number {
  return BORDER * Math.max(1, side / (STICKER_SIZE - BORDER * 2));
}

/** Adds the white die-cut border that follows the shape, like a real sticker */
export function outline(src: HTMLCanvasElement, width = BORDER): HTMLCanvasElement {
  const out = makeCanvas(src.width + width * 2, src.height + width * 2);
  const ctx = out.getContext('2d')!;
  // Stamp the shape all around a circle, then paint the whole stamp white
  const steps = 36;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(src, width + Math.cos(a) * width, width + Math.sin(a) * width);
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(src, width, width);
  return out;
}

/** Trim, size and (optionally) border: the finished sticker, or null when it is empty */
export function finish(src: HTMLCanvasElement, border: boolean): HTMLCanvasElement | null {
  const trimmed = trim(src);
  if (!trimmed) return null;
  const sized = fit(trimmed, border ? STICKER_SIZE - BORDER * 2 : STICKER_SIZE);
  return border ? outline(sized) : sized;
}

export function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the sticker'))), 'image/png'));
}

/** Reads a picked image into a canvas (photo orientation applied), at most `maxSide` pixels */
export async function readImage(file: Blob, maxSide = 1200): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  const source = bitmap ?? (await loadImage(file));
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!w || !h) throw new Error('Could not read this image');
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = makeCanvas(w * scale, h * scale);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  bitmap?.close();
  return c;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => (URL.revokeObjectURL(url), resolve(img));
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('Could not read this image')));
    img.src = url;
  });
}
