import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
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
let authPersistencePromise;

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

function ensureAuthPersistence(firebase) {
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(firebase.auth, browserLocalPersistence);
  }
  return authPersistencePromise;
}

export function startAuthListener(onChange, onError) {
  const firebase = ensureFirebase();
  if (!firebase) {
    onChange(null);
    return () => {};
  }

  let cancelled = false;
  let unsubscribe = () => {};
  ensureAuthPersistence(firebase)
    .then(() => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(
        firebase.auth,
        onChange,
        (error) => onError?.(error)
      );
    })
    .catch((error) => onError?.(error));

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export async function signInWithGoogle() {
  const firebase = ensureFirebase();
  if (!firebase) throw new Error('Firebase is not configured yet.');
  await ensureAuthPersistence(firebase);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(firebase.auth, provider);
}

export async function logoutGoogleUser() {
  const firebase = ensureFirebase();
  if (!firebase) return;
  try {
    await setUserOnlineStatus(firebase.auth.currentUser, 'offline');
  } finally {
    await signOut(firebase.auth);
  }
}

export function toUserProfile(user) {
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? user.email ?? 'Google user',
    photoURL: user.photoURL ?? '',
    lastLoginAt: serverTimestamp(),
    onlineStatus: 'online',
    isOnline: true,
    updatedAt: serverTimestamp()
  };
}

export async function saveUserProfile(user) {
  const firebase = ensureFirebase();
  if (!firebase || !user) return;
  await setDoc(doc(firebase.db, 'users', user.uid), toUserProfile(user), { merge: true });
}

export async function setUserOnlineStatus(user, onlineStatus) {
  const firebase = ensureFirebase();
  if (!firebase || !user?.uid) return;
  await setDoc(doc(firebase.db, 'users', user.uid), {
    uid: user.uid,
    email: user.email ?? '',
    onlineStatus,
    isOnline: onlineStatus === 'online',
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function dedupeGoogleUsers(users) {
  const seenEmails = new Set();
  return users.filter((user) => {
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!user.uid || !email || seenEmails.has(email)) return false;
    seenEmails.add(email);
    return true;
  });
}

export function subscribeAuthenticatedUsers(onUsers, onError) {
  const firebase = ensureFirebase();
  if (!firebase) {
    onUsers([]);
    return () => {};
  }
  const { db } = firebase;

  return onSnapshot(
    collection(db, 'users'),
    (snapshot) => {
      const users = dedupeGoogleUsers(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() })))
        .sort((first, second) => {
          const firstName = first.displayName || first.email || '';
          const secondName = second.displayName || second.email || '';
          return firstName.localeCompare(secondName);
        });
      onUsers(users);
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
  if (!firebase) throw new Error('Firebase is not ready yet.');
  if (!user?.uid) throw new Error('Please sign in again before chatting.');
  if (!contactUid) throw new Error('Choose a signed-in friend first.');
  if (!cleanText) return null;

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
