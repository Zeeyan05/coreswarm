/**
 * CoreSwarm / Technocore Single-Line Sweep
 *
 * Replaces Unicode categories Cc, Cf, Cs, Co, Zl, Zp with space, then trims.
 * Matches Technocore protocol storage and canonical verification semantics.
 */

const SWEEP_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;

export function sweep(text: string): string {
  return text.replace(SWEEP_PATTERN, ' ').trim();
}
