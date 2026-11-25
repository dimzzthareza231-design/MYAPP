import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { auth } from './firebase';

let verifier: RecaptchaVerifier | undefined;
let pending: ConfirmationResult | undefined;

/** Kirim SMS kode ke nomor E.164 (mis. +62812...). containerId = id elemen kosong untuk reCAPTCHA tak terlihat. */
export async function sendPhoneCode(phone: string, containerId: string): Promise<void> {
  verifier ??= new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  try {
    pending = await signInWithPhoneNumber(auth, phone, verifier);
  } catch (error) {
    verifier.clear();
    verifier = undefined;
    throw error;
  }
}

/** Selesaikan login dengan kode 6 digit dari SMS. */
export async function confirmPhoneCode(code: string) {
  if (!pending) throw new Error('Kirim kode SMS dulu.');
  return (await pending.confirm(code)).user;
}
