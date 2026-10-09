// Trusted environment ONLY. Install firebase-admin@13.2.0 outside the public website.
// GOOGLE_APPLICATION_CREDENTIALS must point to a private service-account file.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const uid = process.argv[2];
if (!uid || uid.length > 128) throw Error('Usage: node grant-admin.mjs GOOGLE_USER_UID');
initializeApp({ credential: applicationDefault(), projectId: 'chinese-learning-47f4d' });
const user = await getAuth().getUser(uid);
await getAuth().setCustomUserClaims(uid, { ...user.customClaims, admin: true });
console.log('Admin claim granted. Sign out and sign in to the management page again.');
