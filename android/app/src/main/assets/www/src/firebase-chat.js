import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

let app;
let auth;
let db;

export function getFirebaseSetupStatus() {
  return {
    configured: isFirebaseConfigured()
  };
}

function ensureFirebase() {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { auth, db };
}

export function startAuthListener(onChange, onError) {
  const firebase = ensureFirebase();
  if (!firebase) {
    onChange(null);
    return () => {};
  }

  return onAuthStateChanged(
    firebase.auth,
    onChange,
    (error) => onError?.(error)
  );
}

export async function signInWithGoogle() {
  const firebase = ensureFirebase();
  if (!firebase) throw new Error('Firebase is not configured yet.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(firebase.auth, provider);
}

export async function logoutGoogleUser() {
  const firebase = ensureFirebase();
  if (!firebase) return;
  await signOut(firebase.auth);
}

export function toUserProfile(user) {
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? user.email ?? 'Google user',
    photoURL: user.photoURL ?? '',
    updatedAt: serverTimestamp()
  };
}

export async function saveUserProfile(user) {
  const firebase = ensureFirebase();
  if (!firebase || !user) return;
  await setDoc(doc(firebase.db, 'users', user.uid), toUserProfile(user), { merge: true });
}

export function subscribeAuthenticatedUsers(onUsers, onError) {
  const firebase = ensureFirebase();
  if (!firebase) {
    onUsers([]);
    return () => {};
  }
  const { db } = firebase;

  return onSnapshot(
    query(collection(db, 'users'), orderBy('displayName')),
    (snapshot) => {
      onUsers(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() })));
    },
    (error) => onError?.(error)
  );
}

export function getConversationId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join('_');
}

export async function sendFirebaseMessage(contactUid, text, user) {
  const firebase = ensureFirebase();
  const cleanText = text.trim();
  if (!firebase || !cleanText || !user?.uid || !contactUid) return null;

  const conversationId = getConversationId(user.uid, contactUid);
  const payload = {
    text: cleanText,
    senderUid: user.uid,
    senderEmail: user.email ?? '',
    senderDisplayName: user.displayName ?? user.email ?? 'Google user',
    senderPhotoURL: user.photoURL ?? '',
    participants: [user.uid, contactUid],
    readBy: [user.uid],
    timestamp: serverTimestamp()
  };

  await setDoc(doc(firebase.db, 'conversations', conversationId), {
    participants: [user.uid, contactUid],
    updatedAt: serverTimestamp()
  }, { merge: true });
  await addDoc(collection(firebase.db, 'conversations', conversationId, 'messages'), payload);
  return payload;
}

export function subscribeConversationMessages(currentUid, contactUid, onMessages, onError) {
  const firebase = ensureFirebase();
  if (!firebase || !currentUid || !contactUid) {
    onMessages([]);
    return () => {};
  }

  const conversationId = getConversationId(currentUid, contactUid);
  return onSnapshot(
    query(collection(firebase.db, 'conversations', conversationId, 'messages'), orderBy('timestamp')),
    (snapshot) => {
      const messages = snapshot.docs.map((item) => {
        const data = item.data();
        const readBy = Array.isArray(data.readBy) ? data.readBy : [];
        if (data.senderUid !== currentUid && !readBy.includes(currentUid)) {
          updateDoc(item.ref, { readBy: arrayUnion(currentUid) }).catch((error) => onError?.(error));
        }
        return {
          id: item.id,
          text: data.text,
          direction: data.senderUid === currentUid ? 'out' : 'in',
          senderUid: data.senderUid,
          senderEmail: data.senderEmail,
          senderDisplayName: data.senderDisplayName,
          senderPhotoURL: data.senderPhotoURL,
          readBy,
          read: readBy.includes(contactUid),
          timestamp: data.timestamp?.toMillis?.() ?? Date.now(),
          time: data.timestamp?.toDate?.().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) ?? 'Now',
          deleted: data.deleted === true
        };
      });
      onMessages(messages);
    },
    (error) => onError?.(error)
  );
}
