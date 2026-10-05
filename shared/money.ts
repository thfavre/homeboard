import type { Currency } from './protocol.ts';

/** Format an amount in hundredths: 150 => "1.5", 1000 => "10", 5 => "0.05" */
export function formatAmount(amount: number): string {
  const v = amount / 100;
  const abs = Math.abs(v);
  const decimals = Number.isInteger(v) ? 0 : abs * 10 === Math.round(abs * 10) ? 1 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
