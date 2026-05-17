const sampleContacts = [];
const referenceContactIds = new Set([
  'dunes',
  'hospital',
  'shonima',
  'himani',
  'dunes4c',
  'hena',
  'sabeena',
  'clinic',
  'aadhish-1778003171685',
  'sangavi-love-1778002802119',
  'live-sync-contact'
]);
const referenceContactNames = new Set([
  'Dunes_KG1B@2026',
  'Millennium Hospital',
  'Shonima Prakash Dunes KG1 A',
  'Himani Nikki Sharma Vats',
  'Dunes_4C@2026',
  'Hena 402',
  'Sabeena Nahyan',
  'Yas Clinic Khalifa City',
  'Aadhish',
  'Sangavi Love',
  'Live Sync Contact'
]);

const sampleStatuses = {
  recent: [],
  viewed: []
};

const sampleChannels = [];

const actionViews = {
  newChat: {
    title: 'New chat',
    body: 'Pick a signed-in friend from the live list, or filter the list by name.',
    primaryAction: 'Start chat',
    points: ['Signed-in friends', 'Online status', 'Safe text chat'],
    form: 'newChat'
  },
  createGroup: {
    title: 'Create Group',
    body: 'Choose at least two signed-in friends and give the group a friendly name.',
    primaryAction: 'Create group',
    points: ['Signed-in friends', 'Text chat', 'Kid-safe group'],
    form: 'createGroup'
  },
  chatMenu: {
    title: 'Chat menu',
    body: 'Kid-safe actions for your chat list.',
    primaryAction: 'Open menu',
    points: ['Verified friends', 'Groups', 'Settings'],
    menuItems: [
      { label: 'Contact info', detail: 'View safe profile' },
      { label: 'Mute notifications', detail: 'Silence this chat' },
      { label: 'Delete chat', detail: 'Delete this conversation', danger: true }
    ]
  },
  voiceCall: {
    title: 'Voice call',
    body: 'Start a voice call with this signed-in friend. Video and sharing are turned off.',
    primaryAction: 'Start voice call',
    points: ['Voice only', 'Signed-in users', 'Kid-safe chat']
  },
  chatSearch: {
    title: 'Search chat',
    body: 'Search inside the selected conversation for text messages.',
    primaryAction: 'Search',
    points: ['Messages', 'Kind words', 'Read ticks']
  },
  attach: {
    title: 'Attach',
    body: 'Media sharing is turned off to keep Kids WhatsApp simple and safe.',
    primaryAction: 'OK',
    points: ['Text only', 'Voice calls', 'Safe chats']
  },
  chooseNotifications: {
    title: 'Notifications',
    body: 'Choose how you want to get notifications for messages, groups, and voice calls.',
    primaryAction: 'Choose now',
    points: ['Messages', 'Groups', 'Voice calls']
  },
  profile: {
    title: 'Profile',
    body: 'See your safe sign-in name and photo, then add a friendly status, favorite color, and fun bio.',
    primaryAction: 'Edit profile',
    points: ['Your name', 'Profile photo', 'Favorite color', 'Fun bio']
  },
  account: {
    title: 'Account',
    body: 'Manage security notifications, account info, and account protection.',
    primaryAction: 'Open account',
    points: ['Security notifications', 'Two-step verification', 'Request account info']
  },
  privacy: {
    title: 'Privacy',
    body: 'Control blocked contacts, last seen, disappearing messages, and read receipts.',
    primaryAction: 'Open privacy',
    points: ['Blocked contacts', 'Last seen', 'Disappearing messages']
  },
  chatsSettings: {
    title: 'Chats',
    body: 'Adjust theme, wallpaper, and simple chat settings.',
    primaryAction: 'Open chats',
    points: ['Theme', 'Wallpaper', 'Enter is send']
  },
  notificationsSettings: {
    title: 'Notifications',
    body: 'Set sounds, message alerts, group alerts, and desktop notifications.',
    primaryAction: 'Open notifications',
    points: ['Message tone', 'Group tone', 'Desktop alerts']
  },
  keyboardShortcuts: {
    title: 'Keyboard shortcuts',
    body: 'See quick actions for moving around the app faster.',
    primaryAction: 'View shortcuts',
    points: ['Search', 'New chat', 'Open settings']
  },
  help: {
    title: 'Help and feedback',
    body: 'Find help center articles, contact support, and send feedback.',
    primaryAction: 'Open help',
    points: ['Help center', 'Contact us', 'Privacy policy']
  },
  logout: {
    title: 'Log out',
    body: 'Sign out of your Google account on this browser.',
    primaryAction: 'Log out',
    points: ['Firebase sign-out', 'Refresh stays logged out', 'Sign in again with Google']
  }
};

const disabledForKidsActionIds = new Set([
  'addStatus',
  'myStatus',
  'addChannel',
  'createChannel',
  'discoverChannels',
  'exampleCommunities',
  'businessProfile',
  'catalog',
  'orders',
  'advertise',
  'quickReplies',
  'labels',
  'broadcastAudience',
  'attach',
  'chatSearch'
]);

const allowedSections = new Set(['chats', 'friends', 'settings']);

const settingsPages = {
  profile: {
    title: 'Profile',
    items: [
      { type: 'readonly', label: 'Name', value: 'Aadhish Mahendran', detail: 'Safe sign-in keeps your identity real.' },
      { type: 'readonly', label: 'Photo', value: '', detail: 'Profile photo from your signed-in account.' },
      { type: 'input', label: 'Status', value: 'Ready to chat', detail: 'A short mood your friends can see.' },
      { type: 'input', label: 'Favorite color', value: 'Purple', detail: 'Pick a color that feels like you.' },
      {
        type: 'textarea',
        label: 'Fun bio',
        value: 'I like games, space, and kind chats.',
        detail: 'Share one safe, friendly sentence about yourself.'
      }
    ]
  },
  chooseNotifications: {
    title: 'Choose notifications',
    items: [
      { type: 'toggle', label: 'Messages', detail: 'Show desktop notifications for new messages.', enabled: true },
      { type: 'toggle', label: 'Groups', detail: 'Notify me about group messages.', enabled: true },
      { type: 'action', label: 'Notification tone', detail: 'Default' }
    ]
  },
  account: {
    title: 'Account',
    items: [
      { type: 'toggle', label: 'Safety reminders', detail: 'Show reminders to chat kindly and safely.', enabled: true },
      { type: 'action', label: 'Parent help', detail: 'Ask a parent before changing account settings.' }
    ]
  },
  privacy: {
    title: 'Privacy',
    items: [
      { type: 'toggle', label: 'Read receipts', detail: 'Show double ticks when a friend reads a message.', enabled: true },
      { type: 'action', label: 'Blocked friends', detail: 'Ask a parent for help.' }
    ]
  },
  chatsSettings: {
    title: 'Chats',
    items: [
      { type: 'action', label: 'Theme', detail: 'System default' },
      { type: 'action', label: 'Wallpaper', detail: 'Choose chat wallpaper.' },
      { type: 'toggle', label: 'Enter is send', detail: 'Press Enter to send messages.', enabled: false }
    ]
  },
  notificationsSettings: {
    title: 'Notifications',
    items: [
      { type: 'toggle', label: 'Desktop notifications', detail: 'Show message notifications on this computer.', enabled: true },
      { type: 'toggle', label: 'Sounds', detail: 'Play sounds for incoming messages.', enabled: true },
      { type: 'action', label: 'Message tone', detail: 'Default' },
      { type: 'action', label: 'Group tone', detail: 'Default' },
      { type: 'toggle', label: 'Reaction notifications', detail: 'Notify me about message reactions.', enabled: true }
    ]
  },
  keyboardShortcuts: {
    title: 'Keyboard shortcuts',
    items: [
      { type: 'shortcut', label: 'Search', detail: 'Ctrl + F' },
      { type: 'shortcut', label: 'New chat', detail: 'Ctrl + Alt + N' },
      { type: 'shortcut', label: 'Settings', detail: 'Ctrl + ,' },
      { type: 'shortcut', label: 'Archive chat', detail: 'Ctrl + Alt + E' }
    ]
  },
  help: {
    title: 'Help and feedback',
    items: [
      { type: 'action', label: 'Kind chat help', detail: 'Ask a parent or teacher if something feels wrong.' },
      { type: 'action', label: 'App info', detail: 'Kids WhatsApp demo version 1.0' }
    ]
  },
  logout: {
    title: 'Log out',
    items: [
      { type: 'danger', label: 'Log out from this computer', detail: 'You can log back in later.' },
      { type: 'action', label: 'Cancel', detail: 'Go back to settings.' }
    ]
  }
};

const settingOptionViews = {
  Theme: {
    title: 'Theme',
    body: 'Choose the appearance for this app.',
    options: ['Light', 'Dark', 'System default']
  },
  Wallpaper: {
    title: 'Wallpaper',
    body: 'Choose a wallpaper for chats.',
    options: ['Default doodle', 'Solid mint', 'Plain light']
  },
  'Two-step verification': {
    title: 'Two-step verification',
    body: 'Add an extra PIN for account security.',
    options: ['Turn on', 'Change PIN', 'Add email']
  },
  'Request account info': {
    title: 'Request account info',
    body: 'Create a report of your account information.',
    options: ['Request report', 'Export report', 'Cancel']
  },
  'Last seen and online': {
    title: 'Last seen and online',
    body: 'Choose who can see when you are online.',
    options: ['Everyone', 'My contacts', 'Nobody']
  },
  'Profile photo': {
    title: 'Profile photo',
    body: 'Choose who can see your profile photo.',
    options: ['Everyone', 'My contacts', 'Nobody']
  },
  About: {
    title: 'About',
    body: 'Choose who can see your about text.',
    options: ['Everyone', 'My contacts', 'Nobody']
  },
  'Blocked contacts': {
    title: 'Blocked contacts',
    body: 'Manage people you blocked.',
    options: ['Add blocked contact', 'View blocked list', 'Cancel']
  },
  'Message tone': {
    title: 'Message tone',
    body: 'Choose message notification sound.',
    options: ['Default', 'Bell', 'Silent']
  },
  'Group tone': {
    title: 'Group tone',
    body: 'Choose group notification sound.',
    options: ['Default', 'Bell', 'Silent']
  },
  'Help center': {
    title: 'Help center',
    body: 'Choose a help topic.',
    options: ['Messaging help', 'Account help', 'Business tools help']
  },
  'Contact us': {
    title: 'Contact us',
    body: 'Choose how to send feedback.',
    options: ['Report a problem', 'Ask a question', 'Send feedback']
  },
  'Terms and privacy policy': {
    title: 'Terms and privacy policy',
    body: 'Read app policies.',
    options: ['Terms', 'Privacy policy', 'Licenses']
  },
  'App info': {
    title: 'App info',
    body: 'ChatApp Web demo version 1.0.',
    options: ['Version 1.0', 'Check updates', 'Done']
  }
};

const settingDangerViews = {
  'Log out from this computer': {
    title: 'Log out from this computer?',
    body: 'You will sign out of Google on this browser. Refresh will not log you back in.',
    primaryAction: 'Log out',
    points: ['Confirm logout', 'Google sign-out', 'Return with Google login'],
    finalAction: 'logout'
  },
  'Delete account': {
    title: 'Delete account?',
    body: 'WhatsApp asks you to confirm before deleting an account.',
    primaryAction: 'Delete account',
    points: ['Confirm delete', 'Review account', 'Cancel anytime'],
    finalAction: 'deleteAccount'
  }
};

const settingsSearchRows = [
  { label: 'Profile', detail: 'Name, photo, status, favorite color, fun bio', page: 'profile' },
  { label: 'Choose your notifications', detail: 'Messages, groups, and voice calls', page: 'chooseNotifications' },
  { label: 'Account', detail: 'Safety reminders and parent help', page: 'account' },
  { label: 'Privacy', detail: 'Read ticks and blocked friends', page: 'privacy' },
  { label: 'Chats', detail: 'Theme, wallpaper, and chat settings', page: 'chatsSettings' },
  { label: 'Notifications', detail: 'Messages, groups, sounds, message tone', page: 'notificationsSettings' },
  { label: 'Help and feedback', detail: 'Kind chat help and app info', page: 'help' },
  { label: 'Log out', detail: 'Sign out from this computer', page: 'logout' }
];

function isValidContact(contact) {
  return Boolean(
    contact &&
      typeof contact.id === 'string' &&
      typeof contact.name === 'string' &&
      Array.isArray(contact.messages)
  );
}

function isFirestoreGroupContact(contact) {
  return Boolean(contact?.group === true || contact?.groupId);
}

function isRestorableSavedContact(contact) {
  return isValidContact(contact) && !isReferenceContact(contact);
}

function isReferenceContact(contact) {
  return referenceContactIds.has(contact.id) || referenceContactNames.has(contact.name);
}

function makeGmailFromName(name) {
  const localPart = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${localPart || 'friend'}@gmail.com`;
}

function getUserDisplayName(user) {
  return user.displayName?.trim() || user.email?.split('@')[0] || 'Google user';
}

function getUserAvatar(user) {
  return getUserDisplayName(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function normalizeUserEmail(user) {
  return typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
}

export function filterAuthenticatedUsers(users = [], currentUid = '', query = '') {
  const needle = query.trim().toLowerCase();
  const seenEmails = new Set();
  return users
    .filter((user) => {
      const email = normalizeUserEmail(user);
      if (!user?.uid || user.uid === currentUid || user.approved !== true || !email || seenEmails.has(email)) {
        return false;
      }
      seenEmails.add(email);
      if (!needle) return true;
      const name = getUserDisplayName(user).toLowerCase();
      return name.includes(needle) || email.includes(needle);
    })
    .sort((first, second) => getUserDisplayName(first).localeCompare(getUserDisplayName(second)));
}

function buildAuthenticatedContact(user, existingContact = {}) {
  const name = getUserDisplayName(user);
  const email = user.email ?? makeGmailFromName(name);
  return {
    ...existingContact,
    id: user.uid,
    uid: user.uid,
    name,
    email,
    phone: existingContact.phone ?? '',
    photoURL: user.photoURL ?? existingContact.photoURL ?? '',
    onlineStatus: user.onlineStatus ?? existingContact.onlineStatus ?? 'offline',
    isOnline: user.isOnline ?? existingContact.isOnline ?? user.onlineStatus === 'online',
    avatar: getUserAvatar(user),
    color: existingContact.color ?? '#cbd6dc',
    textColor: existingContact.textColor ?? '#42545d',
    preview: existingContact.messages?.at(-1)?.deleted
      ? 'This message was deleted'
      : existingContact.messages?.at(-1)?.text ?? 'Say hi!',
    time: existingContact.time ?? 'Now',
    unread: existingContact.unread ?? 0,
    favorite: existingContact.favorite ?? false,
    group: existingContact.group ?? false,
    messages: existingContact.messages ?? []
  };
}

function getGroupName(group) {
  return group.groupName?.trim() || group.name?.trim() || 'Family Group';
}

function getGroupAvatar(group) {
  return getGroupName(group)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function normalizeGroupMembers(group) {
  const members = Array.isArray(group.members)
    ? group.members
    : Array.isArray(group.participants)
      ? group.participants
      : Array.isArray(group.memberUids)
        ? group.memberUids
        : [];
  return [...new Set(members.filter((uid) => typeof uid === 'string' && uid.trim()).map((uid) => uid.trim()))];
}

function buildGroupContact(group, existingContact = {}) {
  const name = getGroupName(group);
  const memberUids = normalizeGroupMembers(group);
  return {
    ...existingContact,
    id: group.id,
    groupId: group.id,
    name,
    email: '',
    phone: '',
    avatar: getGroupAvatar(group),
    color: existingContact.color ?? '#7b4dff',
    textColor: existingContact.textColor ?? '#ffffff',
    preview: existingContact.messages?.at(-1)?.deleted
      ? 'This message was deleted'
      : existingContact.messages?.at(-1)?.text ?? `${memberUids.length} members`,
    time: existingContact.time ?? 'Now',
    unread: existingContact.unread ?? 0,
    favorite: existingContact.favorite ?? false,
    group: true,
    type: group.type ?? 'group',
    memberUids,
    participants: Array.isArray(group.participants) ? group.participants : memberUids,
    createdBy: group.createdBy ?? existingContact.createdBy ?? '',
    messages: existingContact.messages ?? []
  };
}

function withContactProfile(contact) {
  if (isFirestoreGroupContact(contact)) {
    const groupId = contact.groupId ?? contact.id;
    return buildGroupContact(
      {
        ...contact,
        id: groupId,
        groupName: contact.name,
        members: contact.memberUids ?? contact.members,
        participants: contact.participants ?? contact.memberUids ?? contact.members
      },
      contact
    );
  }

  const email = typeof contact.email === 'string' && contact.email.trim()
    ? contact.email.trim()
    : makeGmailFromName(contact.name);
  return {
    ...contact,
    email,
    preview: contact.deleted ? 'This message was deleted' : contact.preview || 'Say hi!',
    color: contact.color ?? '#cbd6dc',
    textColor: contact.textColor ?? '#42545d'
  };
}

export function createAuthenticatedContact(state, user) {
  if (!user?.uid) return state;
  const existingContact = state.contacts.find((contact) => contact.id === user.uid);
  const contact = buildAuthenticatedContact(user, existingContact);
  const contacts = existingContact
    ? state.contacts.map((item) => (item.id === user.uid ? contact : item))
    : [contact, ...state.contacts];

  return {
    ...state,
    activeSection: 'chats',
    activeContactId: user.uid,
    contacts
  };
}

export function reconcileAuthenticatedContacts(state, users = [], currentUid = '', groups = []) {
  const authenticatedUsers = filterAuthenticatedUsers(users, currentUid);
  const existingById = new Map(state.contacts.map((contact) => [contact.id, contact]));
  const userContacts = authenticatedUsers.map((user) => buildAuthenticatedContact(user, existingById.get(user.uid)));
  const groupContacts = groups
    .filter((group) => group?.id && normalizeGroupMembers(group).includes(currentUid))
    .map((group) => buildGroupContact(group, existingById.get(group.id)));
  const contacts = [...userContacts, ...groupContacts];
  const activeContactId = contacts.some((contact) => contact.id === state.activeContactId)
    ? state.activeContactId
    : contacts[0]?.id;

  return {
    ...state,
    activeContactId,
    contacts
  };
}

export function createInitialState(savedState = {}) {
  const savedContacts = Array.isArray(savedState.contacts)
    ? savedState.contacts.filter(isRestorableSavedContact)
    : [];
  const deletedContactIds = Array.isArray(savedState.deletedContactIds)
    ? [...new Set(savedState.deletedContactIds.filter((id) => typeof id === 'string'))]
    : [];
  const deletedIdSet = new Set(deletedContactIds);
  const contacts = (savedContacts.length ? structuredClone(savedContacts) : structuredClone(sampleContacts))
    .filter((contact) => !deletedIdSet.has(contact.id))
    .map(withContactProfile);
  const savedActiveContactId =
    typeof savedState.activeContactId === 'string' &&
    contacts.some((contact) => contact.id === savedState.activeContactId)
      ? savedState.activeContactId
      : contacts[0]?.id;

  return {
    activeSection: 'chats',
    activeContactId: savedActiveContactId,
    deletedContactIds,
    contacts,
    statuses: structuredClone(sampleStatuses),
    channels: structuredClone(sampleChannels)
  };
}

export function getActionView(actionId) {
  if (disabledForKidsActionIds.has(actionId)) {
    return {
      title: 'Kids-safe mode',
      body: 'This app only allows text chat, group chat, and voice calls between signed-in users.',
      primaryAction: 'OK',
      points: ['Text only', 'Voice calls', 'Google names']
    };
  }
  return actionViews[actionId] ?? {
    title: 'Coming soon',
    body: 'This demo button is ready for the next feature.',
    primaryAction: 'Got it',
    points: ['Preview mode']
  };
}

export function getSettingsPage(pageId) {
  return settingsPages[pageId] ?? settingsPages.account;
}

export function getSettingOptionView(label) {
  return settingOptionViews[label] ?? {
    title: label,
    body: 'Choose what you want to do next.',
    options: ['Change setting', 'Learn more', 'Keep current']
  };
}

export function getSettingDangerView(label) {
  return settingDangerViews[label] ?? {
    title: label,
    body: 'WhatsApp asks you to confirm before doing this action.',
    primaryAction: label,
    points: ['Confirm', 'Review account', 'Cancel anytime'],
    finalAction: 'danger'
  };
}

export function searchSettings(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return settingsSearchRows;

  return settingsSearchRows.filter((row) => {
    const searchableText = `${row.label} ${row.detail}`.toLowerCase();
    return searchableText.includes(needle);
  });
}

export function getActiveContact(state) {
  return state.contacts.find((contact) => contact.id === state.activeContactId) ?? state.contacts[0];
}

export function filterContacts(state, { query = '', filter = 'all' } = {}) {
  const needle = query.trim().toLowerCase();
  return state.contacts.filter((contact) => {
    const matchesQuery =
      contact.name.toLowerCase().includes(needle) ||
      contact.preview.toLowerCase().includes(needle) ||
      (contact.email ?? '').toLowerCase().includes(needle);
    const matchesFilter =
      filter === 'all' ||
      (filter === 'unread' && contact.unread > 0) ||
      (filter === 'favorites' && contact.favorite) ||
      (filter === 'groups' && contact.group);
    return matchesQuery && matchesFilter;
  });
}

export function selectContact(state, contactId) {
  return {
    ...state,
    activeSection: 'chats',
    activeContactId: contactId,
    contacts: state.contacts.map((contact) =>
      contact.id === contactId ? { ...contact, unread: 0 } : contact
    )
  };
}

export function switchSection(state, section) {
  const safeSection = allowedSections.has(section) ? section : 'chats';
  return {
    ...state,
    activeSection: safeSection
  };
}

export function createContactChat(state) {
  return state;
}

export function deleteLatestContactMessage(state, contactId) {
  return {
    ...state,
    contacts: state.contacts.map((contact) => {
      if (contact.id !== contactId) return contact;
      const deletedMessage = {
        ...(contact.messages.at(-1) ?? {
          id: `${contact.id}-${Date.now()}-deleted`,
          direction: 'in',
          time: 'Now'
        }),
        text: 'This message was deleted',
        deleted: true
      };
      return {
        ...contact,
        deleted: true,
        preview: 'This message was deleted',
        messages: contact.messages.length
          ? [...contact.messages.slice(0, -1), deletedMessage]
          : [deletedMessage]
      };
    })
  };
}

export function deleteContactChat(state, contactId) {
  const contacts = state.contacts.filter((contact) => contact.id !== contactId);
  const activeContactId = state.activeContactId === contactId
    ? contacts[0]?.id
    : state.activeContactId;
  const deletedContactIds = [...new Set([...(state.deletedContactIds ?? []), contactId])];

  return {
    ...state,
    deletedContactIds,
    activeContactId,
    contacts
  };
}

export function updateContactChat(state) {
  return state;
}

export function updateMessage(state, contactId, messageId, text) {
  const cleanText = text.trim();
  if (!cleanText) return state;

  return {
    ...state,
    contacts: state.contacts.map((contact) => {
      if (contact.id !== contactId) return contact;
      const messages = contact.messages.map((message) =>
        message.id === messageId
          ? { ...message, text: cleanText, deleted: false }
          : message
      );
      const lastMessage = messages.at(-1);
      return {
        ...contact,
        deleted: false,
        preview: lastMessage?.deleted ? 'This message was deleted' : lastMessage?.text ?? contact.preview,
        messages
      };
    })
  };
}

export function deleteMessage(state, contactId, messageId) {
  return {
    ...state,
    contacts: state.contacts.map((contact) => {
      if (contact.id !== contactId) return contact;
      const messages = contact.messages.map((message) =>
        message.id === messageId
          ? { ...message, text: 'This message was deleted', deleted: true }
          : message
      );
      const lastMessage = messages.at(-1);
      return {
        ...contact,
        deleted: lastMessage?.deleted ?? contact.deleted,
        preview: lastMessage?.deleted ? 'This message was deleted' : lastMessage?.text ?? contact.preview,
        messages
      };
    })
  };
}

export function toggleChannelFollow(state, channelId) {
  return {
    ...state,
    channels: state.channels.map((channel) =>
      channel.id === channelId ? { ...channel, following: !channel.following } : channel
    )
  };
}

export function sendMessage(
  state,
  text,
  {
    senderId = '',
    senderUid = '',
    senderEmail = '',
    senderDisplayName = '',
    senderPhotoURL = '',
    timestamp = Date.now()
  } = {}
) {
  const cleanText = text.trim();
  if (!cleanText) return state;

  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return {
    ...state,
    contacts: state.contacts.map((contact) => {
      if (contact.id !== state.activeContactId) return contact;
      const sentMessage = {
        id: `${contact.id}-${Date.now()}-sent`,
        direction: 'out',
        text: cleanText,
        time,
        senderId
        ,
        senderUid,
        senderEmail,
        senderDisplayName,
        senderPhotoURL,
        readBy: senderUid ? [senderUid] : [],
        timestamp
      };
      return {
        ...contact,
        preview: cleanText,
        time,
        messages: [...contact.messages, sentMessage]
      };
    })
  };
}
