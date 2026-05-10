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
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

let app;
let auth;
let db;
let authPersistencePromise;
const allowedOnlineStatuses = new Set(['online', 'away', 'offline']);
export const familyOwnerEmails = ['aadhish.mahendran@gmail.com'];

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

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isFamilyOwnerEmail(email) {
  return familyOwnerEmails.includes(normalizeEmail(email));
}

function normalizeOnlineStatus(onlineStatus) {
  return allowedOnlineStatuses.has(onlineStatus) ? onlineStatus : 'offline';
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
  const profile = {
    uid: user.uid,
    email: normalizeEmail(user.email),
    displayName: user.displayName ?? user.email ?? 'Google user',
    photoURL: user.photoURL ?? '',
    lastLoginAt: serverTimestamp(),
    onlineStatus: 'online',
    isOnline: true,
    updatedAt: serverTimestamp()
  };
  if (isFamilyOwnerEmail(user.email)) {
    profile.approved = true;
    profile.role = 'owner';
    profile.approvedBy = user.uid;
    profile.approvedAt = serverTimestamp();
  }
  return profile;
}

export async function saveUserProfile(user) {
  const firebase = ensureFirebase();
  if (!firebase || !user) return;
  const userRef = doc(firebase.db, 'users', user.uid);
  const existing = await getDoc(userRef);
  const existingData = existing.exists() ? existing.data() : {};
  const profile = toUserProfile(user);
  if (!isFamilyOwnerEmail(user.email) && (!existing.exists() || !('approved' in existingData))) {
    profile.approved = false;
    profile.role = 'pending';
  }
  await setDoc(userRef, profile, { merge: true });
}

export async function setUserOnlineStatus(user, onlineStatus) {
  const firebase = ensureFirebase();
  if (!firebase || !user?.uid) return;
  const normalizedStatus = normalizeOnlineStatus(onlineStatus);
  await setDoc(doc(firebase.db, 'users', user.uid), {
    uid: user.uid,
    email: normalizeEmail(user.email),
    onlineStatus: normalizedStatus,
    isOnline: normalizedStatus === 'online',
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function subscribeCurrentUserProfile(uid, onProfile, onError) {
  const firebase = ensureFirebase();
  if (!firebase || !uid) {
    onProfile(null);
    return () => {};
  }

  return onSnapshot(
    doc(firebase.db, 'users', uid),
    (snapshot) => onProfile(snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null),
    (error) => onError?.(error)
  );
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
    query(collection(db, 'users'), where('approved', '==', true)),
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

export function subscribePendingFamilyUsers(onUsers, onError) {
  const firebase = ensureFirebase();
  if (!firebase) {
    onUsers([]);
    return () => {};
  }

  return onSnapshot(
    collection(firebase.db, 'users'),
    (snapshot) => {
      const users = dedupeGoogleUsers(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() })))
        .filter((user) => user.approved !== true)
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

export async function sendFamilyInvite(email, user) {
  const firebase = ensureFirebase();
  const normalizedEmail = normalizeEmail(email);
  if (!firebase) throw new Error('Firebase is not ready yet.');
  if (!isFamilyOwnerEmail(user?.email)) throw new Error('Only the app owner can invite family.');
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Enter a valid Gmail address.');

  await setDoc(doc(firebase.db, 'invites', normalizedEmail), {
    email: normalizedEmail,
    invitedBy: user.uid,
    invitedByEmail: normalizeEmail(user.email),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function approveFamilyMember(uid, user) {
  const firebase = ensureFirebase();
  if (!firebase) throw new Error('Firebase is not ready yet.');
  if (!isFamilyOwnerEmail(user?.email)) throw new Error('Only the app owner can approve family.');
  if (!uid) throw new Error('Choose a family member to approve.');

  await setDoc(doc(firebase.db, 'users', uid), {
    approved: true,
    role: 'member',
    approvedBy: user.uid,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function normalizeGroupMembers(memberUids = [], currentUid = '') {
  return [...new Set([currentUid, ...memberUids].filter((uid) => typeof uid === 'string' && uid.trim()))];
}

function isUserInGroup(group, uid) {
  const members = Array.isArray(group?.members) ? group.members : [];
  const participants = Array.isArray(group?.participants) ? group.participants : [];
  return members.includes(uid) || participants.includes(uid);
}

function mapGroupSnapshot(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function getGroupCreatedTime(group) {
  return group.createdAt?.toMillis?.() ?? group.createdAt ?? 0;
}

function mergeFirebaseGroups(...groupLists) {
  const groupsById = new Map();
  for (const group of groupLists.flat()) {
    if (group?.id) groupsById.set(group.id, { ...groupsById.get(group.id), ...group });
  }
  return [...groupsById.values()].sort((first, second) => getGroupCreatedTime(second) - getGroupCreatedTime(first));
}

function mapMessageDoc(item, currentUid, readTargetUid = '') {
  const data = item.data();
  const readBy = Array.isArray(data.readBy) ? data.readBy : [];
  return {
    id: item.id,
    text: data.text,
    direction: data.senderUid === currentUid ? 'out' : 'in',
    senderUid: data.senderUid,
    senderEmail: data.senderEmail,
    senderDisplayName: data.senderDisplayName,
    senderPhotoURL: data.senderPhotoURL,
    readBy,
    read: readTargetUid ? readBy.includes(readTargetUid) : false,
    timestamp: data.timestamp?.toMillis?.() ?? Date.now(),
    time: data.timestamp?.toDate?.().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) ?? 'Now',
    deleted: data.deleted === true
  };
}

export async function createFirebaseGroup({ groupName, memberUids = [] }, user) {
  const firebase = ensureFirebase();
  const cleanName = groupName.trim();
  if (!firebase) throw new Error('Firebase is not ready yet.');
  if (!user?.uid) throw new Error('Please sign in again before creating a group.');
  if (!cleanName) throw new Error('Give your group a name.');
  if (memberUids.length < 1) throw new Error('Choose at least 1 friend for a group.');

  const members = normalizeGroupMembers(memberUids, user.uid);
  if (members.length < 2) throw new Error('Choose at least 1 friend for a group.');

  const group = {
    groupName: cleanName,
    type: 'group',
    members,
    participants: members,
    createdBy: user.uid,
    createdAt: serverTimestamp()
  };
  const createPath = 'groups/(auto-id)';
  console.info('[Kids WhatsApp] Creating group', { path: createPath, data: group });
  try {
    const groupRef = await addDoc(collection(firebase.db, 'groups'), group);
    console.info('[Kids WhatsApp] Created group', { path: groupRef.path, id: groupRef.id });
    return { id: groupRef.id, ...group, createdAt: Date.now() };
  } catch (error) {
    console.error('[Kids WhatsApp] Group create failed', {
      path: createPath,
      data: group,
      code: error.code,
      message: error.message
    });
    throw error;
  }
}

export function subscribeUserGroups(currentUid, onGroups, onError) {
  const firebase = ensureFirebase();
  if (!firebase || !currentUid) {
    onGroups([]);
    return () => {};
  }

  let memberGroups = [];
  let participantGroups = [];
  const emitGroups = () => onGroups(mergeFirebaseGroups(memberGroups, participantGroups));
  const groupCollection = collection(firebase.db, 'groups');
  const memberGroupsQuery = query(
    groupCollection,
    where('type', '==', 'group'),
    where('members', 'array-contains', currentUid)
  );
  const participantGroupsQuery = query(
    groupCollection,
    where('type', '==', 'group'),
    where('participants', 'array-contains', currentUid)
  );

  const unsubscribeMembers = onSnapshot(
    memberGroupsQuery,
    (snapshot) => {
      memberGroups = mapGroupSnapshot(snapshot);
      emitGroups();
    },
    (error) => onError?.(error)
  );
  const unsubscribeParticipants = onSnapshot(
    participantGroupsQuery,
    (snapshot) => {
      participantGroups = mapGroupSnapshot(snapshot);
      emitGroups();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubscribeMembers();
    unsubscribeParticipants();
  };
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
    query(
      collection(firebase.db, 'conversations', conversationId, 'messages'),
      orderBy('timestamp')
    ),
    (snapshot) => {
      const messages = snapshot.docs.map((item) => {
        const data = item.data();
        const readBy = Array.isArray(data.readBy) ? data.readBy : [];
        if (data.senderUid !== currentUid && !readBy.includes(currentUid)) {
          updateDoc(item.ref, { readBy: arrayUnion(currentUid) }).catch((error) => onError?.(error));
        }
        return mapMessageDoc(item, currentUid, contactUid);
      });
      onMessages(messages);
    },
    (error) => onError?.(error)
  );
}

export async function sendFirebaseGroupMessage(groupId, text, user) {
  const firebase = ensureFirebase();
  const cleanText = text.trim();
  if (!firebase) throw new Error('Firebase is not ready yet.');
  if (!user?.uid) throw new Error('Please sign in again before chatting.');
  if (!groupId) throw new Error('Choose a group first.');
  if (!cleanText) return null;

  const groupRef = doc(firebase.db, 'groups', groupId);
  const groupSnapshot = await getDoc(groupRef);
  const group = groupSnapshot.exists() ? groupSnapshot.data() : null;
  if (!isUserInGroup(group, user.uid)) {
    throw new Error('You are not a member of this group.');
  }

  const payload = {
    text: cleanText,
    senderUid: user.uid,
    senderEmail: user.email ?? '',
    senderDisplayName: user.displayName ?? user.email ?? 'Google user',
    senderPhotoURL: user.photoURL ?? '',
    readBy: [user.uid],
    timestamp: serverTimestamp()
  };

  await addDoc(collection(firebase.db, 'groups', groupId, 'messages'), payload);
  return payload;
}

export function subscribeGroupMessages(groupId, currentUid, onMessages, onError) {
  const firebase = ensureFirebase();
  if (!firebase || !groupId || !currentUid) {
    onMessages([]);
    return () => {};
  }

  return onSnapshot(
    query(collection(firebase.db, 'groups', groupId, 'messages'), orderBy('timestamp')),
    (snapshot) => {
      const messages = snapshot.docs.map((item) => {
        const data = item.data();
        const readBy = Array.isArray(data.readBy) ? data.readBy : [];
        if (data.senderUid !== currentUid && !readBy.includes(currentUid)) {
          updateDoc(item.ref, { readBy: arrayUnion(currentUid) }).catch((error) => onError?.(error));
        }
        return mapMessageDoc(item, currentUid);
      });
      onMessages(messages);
    },
    (error) => onError?.(error)
  );
}
