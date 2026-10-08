import type { Currency } from './protocol.ts';

/** Format an amount in hundredths for display, rounded to whole units with Swiss grouping: 198990 => "1’990" */
export function formatAmount(amount: number): string {
  const n = Math.round(Math.abs(amount) / 100);
  const digits = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return amount < 0 && n > 0 ? `-${digits}` : digits;
}

/** Exact plain decimal for editing: 150 => "1.5", 1000 => "10", 5 => "0.05" */
export function amountToInput(amount: number): string {
  return String(amount / 100);
}

export function formatMoney(amount: number, currency: Currency): string {
  return `${formatAmount(amount)} ${currency.symbol}`;
}

/** Parse a user-entered decimal into hundredths */
export function parseAmount(input: string | number): number {
  const n = typeof input === 'number' ? input : parseFloat(String(input).replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
