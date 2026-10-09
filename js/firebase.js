import { firebaseConfig, SDK_VERSION } from './config.js';
export async function connect() {
  const base = new URL(`../vendor/firebase-${SDK_VERSION}/`, import.meta.url).href;
  const [A, U, F] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'),
  ]);
  const app = A.initializeApp(firebaseConfig, 'english-learner');
  const auth = U.getAuth(app);
  const db = F.getFirestore(app);
  let cache = '持久快取';
  try {
    await F.enableMultiTabIndexedDbPersistence(db);
  } catch {
    cache = '線上模式：此瀏覽器無法使用持久快取';
  }
  await U.setPersistence(auth, U.browserLocalPersistence);
  await auth.authStateReady();
  if (!auth.currentUser) {
    const signIn = async () => {
      await auth.authStateReady();
      if (!auth.currentUser) await U.signInAnonymously(auth);
    };
    if (navigator.locks) await navigator.locks.request('english-anonymous-auth', signIn);
    else await signIn();
  }
  return { auth, db, U, F, cache };
}
