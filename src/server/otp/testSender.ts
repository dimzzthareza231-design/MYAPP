// HANYA UNTUK PENGUJIAN. Pengirim in-memory yang mencatat kode terakhir per nomor.
// Tidak pernah dipilih oleh createOtpSenderFromEnv(); hanya bisa dipasang lewat setOtpSenderForTests()
// yang menolak berjalan kecuali NODE_ENV === 'test'.
import type { OtpSendResult, OtpSender } from './sender';

export class InMemoryTestOtpSender implements OtpSender {
  readonly channel = 'test' as const;
  readonly sent: Array<{ to: string; code: string }> = [];
  failNext = false;

  async sendOtp(to: string, code: string): Promise<OtpSendResult> {
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: 'TEST_FAILURE' };
    }
    this.sent.push({ to, code });
    return { ok: true, providerMessageId: `test-${this.sent.length}` };
  }

  lastCodeFor(to: string): string | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) if (this.sent[i].to === to) return this.sent[i].code;
    return undefined;
  }
}
