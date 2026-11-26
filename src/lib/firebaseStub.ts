// Pengganti firebase/app, firebase/auth, firebase/firestore di build Cloudflare aplikasi inti (mode login lokal).
// Semua pemanggilan Firebase di kode dijaga isFirebaseConfigured (selalu false di mode ini); stub ini memangkas ~540 KB bundle.
const noop = (): (() => void) => () => {};
export const initializeApp = noop, getApps = (): unknown[] => [], getAuth = noop, getFirestore = noop;
export const onAuthStateChanged = noop, signInWithPopup = noop, signInWithEmailAndPassword = noop, sendPasswordResetEmail = noop,
  signOut = noop, setPersistence = noop, getMultiFactorResolver = noop, multiFactor = noop, signInWithPhoneNumber = noop;
export const collection = noop, doc = noop, getDoc = noop, getDocs = noop, setDoc = noop, updateDoc = noop, deleteDoc = noop,
  onSnapshot = noop, getDocFromServer = noop, writeBatch = noop, query = noop, where = noop, orderBy = noop, limit = noop;
export const browserLocalPersistence = {};
export class GoogleAuthProvider { setCustomParameters(): void {} }
export class RecaptchaVerifier {}
export const TotpMultiFactorGenerator = { FACTOR_ID: 'totp' };
