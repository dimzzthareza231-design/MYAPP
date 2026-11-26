import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeInstallPrompt } from '../src/hooks/usePWAInstall';

describe('PWA install prompt', () => {
  test('marks accepted prompts as installed and consumes the prompt', async () => {
    let consumed = false;
    let promptCalls = 0;
    const installed = await consumeInstallPrompt(
      {
        prompt: async () => {
          promptCalls += 1;
        },
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
      () => {
        consumed = true;
      },
    );

    assert.equal(installed, true);
    assert.equal(promptCalls, 1);
    assert.equal(consumed, true);
  });

  test('consumes dismissed prompts so stale events cannot be reused', async () => {
    let consumed = false;
    const installed = await consumeInstallPrompt(
      {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      },
      () => {
        consumed = true;
      },
    );

    assert.equal(installed, false);
    assert.equal(consumed, true);
  });

  test('consumes prompt when the browser rejects installation', async () => {
    let consumed = false;
    await assert.rejects(
      consumeInstallPrompt(
        {
          prompt: async () => {
            throw new Error('Install failed');
          },
          userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
        },
        () => {
          consumed = true;
        },
      ),
      /Install failed/,
    );
    assert.equal(consumed, true);
  });
});
