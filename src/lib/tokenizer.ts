'use client';

import { encode } from 'gpt-tokenizer';

const SEPARATOR = '='.repeat(48);

export function estimateTokens(text: string): string | null {
  try {
    // Uses o200k_base encoding (GPT-4o) - same as official
    const tokens = encode(text);
    const totalTokens = tokens.length;

    // Format exactly like official implementation
    if (totalTokens >= 1_000_000) {
      return `${(totalTokens / 1_000_000).toFixed(1)}M`;
    }
    if (totalTokens >= 1_000) {
      return `${(totalTokens / 1_000).toFixed(1)}k`;
    }
    return totalTokens.toString();
  } catch (error) {
    console.error('Failed to estimate tokens:', error);
    return null;
  }
}

export { SEPARATOR };
