import type { Currency, EarnRuleInfo, PriceInfo } from '../../shared/protocol.ts';
import { formatAmount } from '../../shared/money.ts';
import type { Session, Guest } from './session.ts';
import type { Settings } from './settings.ts';
import { HbError } from './util.ts';

export interface PriceDef {
  key: string;
  label: string;
  unit?: string;
  /** Default price in hundredths */
  default: number;
  /** False while a setting of the module makes this price unused (hidden from the host) */
  active?: () => boolean;
}

export interface EarnDef {
  key: string;
  label: string;
  /** Default amount in hundredths */
  default: number;
  /** Text shown to guests; receives the formatted amount, e.g. "5 Sparks" */
  describe: (amount: string) => string;
}

export interface Charge {
  guest: Guest;
  amount: number;
  reason: string;
}

interface CoreEconomySettings {
  economyEnabled: boolean;
  prices: Record<string, number>;
  earn: Record<string, number>;
  currency: Currency;
}

/**
 * Prices, earning rules and money movements. Modules register their prices and
 * earning rules; the admin can override every amount from the Economy screen.
 */
export class Economy {
  private prices = new Map<string, PriceDef & { module: string }>();
  private earnRules = new Map<string, EarnDef & { module: string }>();

  constructor(
    private settings: Settings,
    private session: Session,
  ) {}

  private get core() {
    return this.settings.get<CoreEconomySettings>('core');
  }

  get enabled(): boolean {
    return this.core.economyEnabled;
  }

  get currency(): Currency {
    return this.core.currency;
  }

  registerPrice(module: string, def: PriceDef): void {
    this.prices.set(def.key, { ...def, module });
  }

  registerEarn(module: string, def: EarnDef): void {
    this.earnRules.set(def.key, { ...def, module });
  }

  hasPrice(key: string): boolean {
    return this.prices.has(key);
  }

  hasEarn(key: string): boolean {
    return this.earnRules.has(key);
  }

  price(key: string): number {
    const def = this.prices.get(key);
    if (!def) throw new Error(`Unknown price "${key}"`);
    return this.core.prices[key] ?? def.default;
  }

  earnAmount(key: string): number {
    const def = this.earnRules.get(key);
    if (!def) throw new Error(`Unknown earn rule "${key}"`);
    return this.core.earn[key] ?? def.default;
  }

  /** Effective prices (all 0 when the economy is off) */
  priceList(moduleEnabled: (id: string) => boolean): Record<string, PriceInfo> {
    const out: Record<string, PriceInfo> = {};
    for (const p of this.prices.values()) {
      if (!moduleEnabled(p.module)) continue;
      out[p.key] = { key: p.key, module: p.module, label: p.label, unit: p.unit, amount: this.enabled ? this.price(p.key) : 0 };
    }
    return out;
  }

  /** Configured prices, regardless of economy on/off */
  adminPriceList(): PriceInfo[] {
    return [...this.prices.values()].map((p) => ({
      key: p.key,
      module: p.module,
      label: p.label,
      unit: p.unit,
      amount: this.price(p.key),
      active: p.active?.() ?? true,
    }));
  }

  earnList(moduleEnabled: (id: string) => boolean): EarnRuleInfo[] {
    return [...this.earnRules.values()]
      .filter((r) => moduleEnabled(r.module))
      .map((r) => {
        const amount = this.earnAmount(r.key);
        return { key: r.key, module: r.module, label: r.label, amount, description: r.describe(`${formatAmount(amount)} ${this.currency.name}`) };
      });
  }

  /** Cost of `qty` units of a price key (0 when the economy is off) */
  cost(key: string, qty = 1): number {
    if (!this.enabled) return 0;
    return Math.round(this.price(key) * qty);
  }

  /**
   * Take money from a guest. Throws a user-facing error when they cannot afford it.
   * Returns a Charge that can be refunded if the action fails afterwards.
   */
  charge(guest: Guest, key: string, qty = 1, reason?: string): Charge {
    return this.pay(guest, this.cost(key, qty), reason ?? this.prices.get(key)?.label ?? key);
  }

  /** Take an amount that is not a price (a bet, a stake). Same rules as charge(). */
  pay(guest: Guest, amount: number, reason: string): Charge {
    if (amount > 0) {
      if (guest.balance < amount) {
        const c = this.currency;
        throw new HbError(`Not enough ${c.name}: this costs ${formatAmount(amount)} ${c.symbol}, you have ${formatAmount(guest.balance)} ${c.symbol}`, 'NO_MONEY');
      }
      this.session.applyAmount(guest, -amount, reason);
    }
    return { guest, amount: Math.max(0, amount), reason };
  }

  refund(charge: Charge): void {
    this.giveBack(charge.guest, charge.amount, `Refund: ${charge.reason}`);
  }

  /** Give back money a guest paid earlier: undoes the spending, it does not count as earned */
  giveBack(guest: Guest, amount: number, reason: string): void {
    if (amount > 0) this.session.applyAmount(guest, amount, reason, 'refund');
  }

  /** countStats false: a host correction that should not move the earned/spent leaderboard */
  credit(guest: Guest, amount: number, reason: string, countStats = true): void {
    if (amount === 0) return;
    this.session.applyAmount(guest, amount, reason, countStats);
  }

  /** Credit using an earn rule. Returns the amount credited. */
  reward(guest: Guest, key: string, multiplier = 1, reason?: string): number {
    const amount = Math.round(this.earnAmount(key) * multiplier);
    if (amount > 0) this.credit(guest, amount, reason ?? this.earnRules.get(key)?.label ?? key);
    return amount;
  }
}
