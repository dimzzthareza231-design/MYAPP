export class TurnstileNotConfiguredError extends Error {
  constructor() {
    super('Turnstile verification is not configured.');
    this.name = 'TurnstileNotConfiguredError';
  }
}

export async function verifyTurnstileToken(token: string, remoteIp: string, expectedAction: string): Promise<boolean> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  const expectedHostname = process.env.CLOUDFLARE_TURNSTILE_EXPECTED_HOSTNAME;
  if (!secret || !expectedHostname) throw new TurnstileNotConfiguredError();

  const formData = new URLSearchParams({ secret, response: token });
  if (remoteIp !== 'unknown') formData.set('remoteip', remoteIp);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error('Turnstile provider returned a non-success status.');

  const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
  return result.success === true && result.hostname === expectedHostname && result.action === expectedAction;
}
