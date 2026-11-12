/**
 * A row that scrolls sideways with a mouse too, not only a finger: the wheel moves it left and
 * right, and dragging with the mouse slides it (a drag is not a click on what is under it). At
 * either end the wheel scrolls the page on, so it never gets stuck on the row.
 */
export function sideScroll(row: HTMLElement) {
  function wheel(e: WheelEvent) {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || row.scrollWidth <= row.clientWidth) return;
    const atStart = row.scrollLeft <= 0 && e.deltaY < 0;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY;
  }

  let drag: { x: number; left: number; moved: boolean } | null = null;
  function down(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: row.scrollLeft, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) row.scrollLeft = drag.left - dx;
  }
  function up() {
    // Cleared after the click that ends a drag, which `click` below swallows
    setTimeout(() => (drag = null));
  }
  function click(e: MouseEvent) {
    if (!drag?.moved) return;
    e.preventDefault();
    e.stopPropagation();
  }

  row.addEventListener('wheel', wheel, { passive: false });
  row.addEventListener('pointerdown', down);
  row.addEventListener('pointermove', move);
  row.addEventListener('pointerup', up);
  row.addEventListener('pointerleave', up);
  row.addEventListener('click', click, true);
  return {
    destroy() {
      row.removeEventListener('wheel', wheel);
      row.removeEventListener('pointerdown', down);
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', up);
      row.removeEventListener('pointerleave', up);
      row.removeEventListener('click', click, true);
    },
  };
}
