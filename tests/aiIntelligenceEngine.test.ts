import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
  checkDrugInteractionsDeterministic,
  getGeminiModelFallbackChain
} from '../src/server/aiIntelligenceEngine';

describe('Gemini model selection', () => {
  test('uses the configured primary and fallback models', () => {
    assert.deepEqual(getGeminiModelFallbackChain(), [
      GEMINI_PRIMARY_MODEL,
      GEMINI_FALLBACK_MODEL
    ]);
  });

  describe('drug interaction fallback', () => {
    test('never labels a limited local rule check as verified safe', () => {
      const result = checkDrugInteractionsDeterministic(['Cetirizine']);
      assert.equal(result.safetyIndex, null);
      assert.equal(result.verified, false);
      assert.equal(result.fallback, true);
      assert.match(result.recommendations[0], /Tidak terverifikasi; telaah manual/);
    });
  });

  test('honors a preferred model without duplicating the fallback', () => {
    assert.deepEqual(getGeminiModelFallbackChain(GEMINI_FALLBACK_MODEL), [
      GEMINI_FALLBACK_MODEL
    ]);
  });
});
