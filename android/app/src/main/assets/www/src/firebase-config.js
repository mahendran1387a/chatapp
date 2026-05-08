// Frontend Firebase config is safe to publish. Do not put Firebase Admin SDK
// service account keys or other server credentials in this file.
export const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_FIREBASE_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_FIREBASE_PROJECT_ID',
  storageBucket: 'YOUR_FIREBASE_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'YOUR_FIREBASE_APP_ID'
};

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => !String(value).startsWith('YOUR_FIREBASE_'));
}
