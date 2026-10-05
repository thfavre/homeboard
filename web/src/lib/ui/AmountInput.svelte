<script lang="ts">
  import { formatAmount, parseAmount } from '$shared/money.ts';

  /** Edits an amount in hundredths as a decimal number. Commits on blur or Enter. */
  let {
    value,
    oncommit,
    placeholder = '0',
    allowNegative = false,
  }: { value: number; oncommit: (v: number) => void; placeholder?: string; allowNegative?: boolean } = $props();

  let text = $state('');
  let focused = $state(false);

  $effect(() => {
    if (!focused) text = formatAmount(value).replace(/,/g, '');
  });

  function commit() {
    let v = parseAmount(text);
    if (!allowNegative) v = Math.max(0, v);
    if (v !== value) oncommit(v);
    text = formatAmount(v).replace(/,/g, '');
  }
</script>

<input
  class="input mono amount"
  inputmode="decimal"
  {placeholder}
  bind:value={text}
  onfocus={() => (focused = true)}
  onblur={() => {
    focused = false;
    commit();
  }}
  onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
/>

<style>
  .amount {
    width: 6.5rem;
    text-align: right;
  }
</style>
