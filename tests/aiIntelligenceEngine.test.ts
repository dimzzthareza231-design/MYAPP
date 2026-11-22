import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
  getGeminiModelFallbackChain
} from '../src/server/aiIntelligenceEngine';

describe('Gemini model selection', () => {
  test('uses Gemini 2.5 Flash as the default primary model', () => {
    assert.deepEqual(getGeminiModelFallbackChain(), [
      GEMINI_PRIMARY_MODEL,
      GEMINI_FALLBACK_MODEL
    ]);
    assert.equal(GEMINI_PRIMARY_MODEL, 'gemini-2.5-flash');
  });

  test('honors a preferred model without duplicating the fallback', () => {
    assert.deepEqual(getGeminiModelFallbackChain(GEMINI_FALLBACK_MODEL), [
      GEMINI_FALLBACK_MODEL
    ]);
  });
});
