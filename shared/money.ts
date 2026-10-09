import type { Currency } from './protocol.ts';

/**
 * Format an amount in hundredths for display with Swiss grouping. Whole units stay whole, cents show only
 * when there are some, so small prices are not rounded away: 198990 => "1’990", 30 => "0.3", 125 => "1.25"
 */
export function formatAmount(amount: number): string {
  const abs = Math.round(Math.abs(amount));
  const digits = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  const cents = abs % 100;
  const text = cents ? `${digits}.${String(cents).padStart(2, '0').replace(/0$/, '')}` : digits;
  return amount < 0 && abs > 0 ? `-${text}` : text;
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
