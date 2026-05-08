// Frontend Firebase config is safe to publish. Do not put Firebase Admin SDK
// service account keys or other server credentials in this file.
export const firebaseConfig = {
  apiKey: 'AIzaSyCTwbG9VfUstguvtiEhCLWLiO2U1SZFoGM',
  authDomain: 'kidswhatsapp-6fffb.firebaseapp.com',
  projectId: 'kidswhatsapp-6fffb',
  storageBucket: 'kidswhatsapp-6fffb.firebasestorage.app',
  messagingSenderId: '1031037370021',
  appId: '1:1031037370021:web:bb4cf7e5e691af2470174c'
};

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => !String(value).startsWith('YOUR_FIREBASE_'));
}
