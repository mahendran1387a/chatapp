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

const sampleChannels = [
  {
    id: 'uae-news',
    name: 'UAE News',
    avatar: 'UN',
    color: '#657180',
    followers: '121K followers',
    verified: true,
    following: false
  },
  {
    id: 'emarat-today',
    name: 'Emarat Al Youm',
    avatar: 'EY',
    color: '#f5f5f5',
    textColor: '#e21c3d',
    followers: '269K followers',
    verified: true,
    following: false
  },
  {
    id: 'lovin-dubai',
    name: 'Lovin Dubai',
    avatar: 'LD',
    color: '#ed1c35',
    followers: '311K followers',
    verified: true,
    following: false
  },
  {
    id: 'gulf-news',
    name: 'Gulf News',
    avatar: 'GN',
    color: '#242424',
    followers: '549K followers',
    verified: true,
    following: false
  },
  {
    id: 'khaleej-times',
    name: 'Khaleej Times',
    avatar: 'KT',
    color: '#182342',
    followers: '890K followers',
    verified: true,
    following: false
  }
];

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
  addStatus: {
    title: 'Add status update',
    body: 'Share a photo, video, or text update that disappears after 24 hours.',
    primaryAction: 'Create status',
    points: ['Text status', 'Photo status', 'Status privacy'],
    form: 'createStatus',
    fields: [
      { name: 'Status text', type: 'text', value: '' },
      { name: 'Background color', type: 'text', value: 'Green' }
    ]
  },
  myStatus: {
    title: 'My status',
    body: 'Your status updates appear here after you post them.',
    primaryAction: 'Add status',
    points: ['No active updates', 'Viewed by contacts', 'Ends after 24 hours']
  },
  addChannel: {
    title: 'Create channel',
    body: 'Create a public channel to share updates with followers.',
    primaryAction: 'Create channel',
    points: ['Channel name', 'Description', 'Profile photo'],
    form: 'createChannel',
    fields: [
      { name: 'Channel name', type: 'text', value: '' },
      { name: 'Description', type: 'text', value: '' }
    ]
  },
  discoverChannels: {
    title: 'Discover channels',
    body: 'Browse more channels about news, entertainment, sports, lifestyle, and local updates.',
    primaryAction: 'Browse channels',
    points: ['News', 'Sports', 'Lifestyle'],
    discoverItems: [
      { name: 'Dubai Foodies', category: 'Lifestyle', followers: '82K followers', avatar: 'DF', color: '#f06f3c' },
      { name: 'UAE Football', category: 'Sports', followers: '214K followers', avatar: 'UF', color: '#198754' },
      { name: 'Cinema UAE', category: 'Entertainment', followers: '134K followers', avatar: 'CU', color: '#7357d8' },
      { name: 'Tech Gulf', category: 'Technology', followers: '99K followers', avatar: 'TG', color: '#2874a6' }
    ]
  },
  createChannel: {
    title: 'Create channel',
    body: 'Set up a channel for announcements and public updates.',
    primaryAction: 'Create channel',
    points: ['Pick a name', 'Add an icon', 'Invite followers'],
    form: 'createChannel',
    fields: [
      { name: 'Channel name', type: 'text', value: '' },
      { name: 'Description', type: 'text', value: '' }
    ]
  },
  exampleCommunities: {
    title: 'Example communities',
    body: 'Communities organize related groups under one place with admin announcements.',
    primaryAction: 'View examples',
    points: ['School community', 'Neighborhood community', 'Class groups'],
    communityExamples: [
      { name: 'School community', groups: 'KG1 A, KG1 B, Transport', members: '248 members', color: '#25d366' },
      { name: 'Neighborhood community', groups: 'Events, Safety, Announcements', members: '93 members', color: '#00a884' },
      { name: 'Tuition community', groups: 'Arabic, Maths, Homework', members: '126 members', color: '#7357d8' }
    ]
  },
  businessProfile: {
    title: 'Business profile',
    body: 'Manage business address, opening hours, website, and customer-facing details.',
    primaryAction: 'Edit profile',
    points: ['Address', 'Hours', 'Website'],
    fields: [
      { name: 'Business name', type: 'text', value: 'Sangavi Store' },
      { name: 'Username', type: 'text', value: '' },
      { name: 'Password', type: 'password', value: '' },
      { name: 'Website', type: 'text', value: '' }
    ]
  },
  catalog: {
    title: 'Catalog',
    body: 'Show products and services so customers can browse before they message you.',
    primaryAction: 'Add item',
    points: ['Product photos', 'Prices', 'Descriptions'],
    form: 'catalogItem',
    fields: [
      { name: 'Item name', type: 'text', value: '' },
      { name: 'Price', type: 'text', value: '' },
      { name: 'Description', type: 'text', value: '' }
    ]
  },
  orders: {
    title: 'Orders',
    body: 'Track customer orders, payments, and order history in one place.',
    primaryAction: 'View orders',
    points: ['Pending', 'Paid', 'Completed'],
    listItems: [
      { name: 'Order #1024', detail: 'Pending payment', tag: 'Pending' },
      { name: 'Order #1023', detail: 'Paid by customer', tag: 'Paid' },
      { name: 'Order #1022', detail: 'Delivered yesterday', tag: 'Completed' }
    ]
  },
  advertise: {
    title: 'Advertise',
    body: 'Create ads that bring customers directly into a WhatsApp conversation.',
    primaryAction: 'Create ad',
    points: ['Audience', 'Budget', 'Message template'],
    form: 'advertise',
    fields: [
      { name: 'Ad title', type: 'text', value: '' },
      { name: 'Budget', type: 'text', value: '' },
      { name: 'Message', type: 'text', value: '' }
    ]
  },
  quickReplies: {
    title: 'Quick replies',
    body: 'Save frequent answers and reuse them while chatting with customers.',
    primaryAction: 'Add quick reply',
    points: ['Greeting', 'Price answer', 'Opening hours'],
    form: 'quickReply',
    fields: [
      { name: 'Shortcut', type: 'text', value: '' },
      { name: 'Message', type: 'text', value: '' }
    ]
  },
  labels: {
    title: 'Labels',
    body: 'Organise chats and customers with colored labels.',
    primaryAction: 'Create label',
    points: ['New customer', 'Pending payment', 'Completed'],
    listItems: [
      { name: 'New customer', detail: 'Green label', tag: '12 chats' },
      { name: 'Pending payment', detail: 'Yellow label', tag: '4 chats' },
      { name: 'Completed', detail: 'Blue label', tag: '18 chats' }
    ]
  },
  broadcastAudience: {
    title: 'Broadcast audience',
    body: 'Upload recipients and send one announcement to many customers.',
    primaryAction: 'Upload list',
    points: ['CSV upload', 'Recipient review', 'Broadcast draft'],
    form: 'broadcastAudience',
    fields: [
      { name: 'Audience name', type: 'text', value: '' },
      { name: 'Recipients', type: 'text', value: '' },
      { name: 'Broadcast message', type: 'text', value: '' }
    ]
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
    body: 'This is a demo, so logging out only shows this confirmation screen.',
    primaryAction: 'Log out',
    points: ['Demo session', 'No account data stored', 'Safe to continue']
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
    body: 'You will leave this demo session on this browser. You can open the app again anytime.',
    primaryAction: 'Log out',
    points: ['Confirm logout', 'Keep chats in demo', 'Return anytime'],
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
      if (!user?.uid || user.uid === currentUid || !email || seenEmails.has(email)) return false;
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
    ? savedState.contacts.filter((contact) => isValidContact(contact) && !isReferenceContact(contact))
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

export function createContactChat(state, { name, phone, email = '' }) {
  const cleanName = name.trim();
  const cleanPhone = phone.trim();
  const cleanEmail = email.trim() || makeGmailFromName(cleanName);
  if (!cleanName || !cleanPhone) return state;

  const idBase = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'friend';
  const id = `${idBase}-${Date.now()}`;
  const avatar = cleanName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const newContact = {
    id,
    name: cleanName,
    phone: cleanPhone,
    email: cleanEmail,
    avatar,
    color: '#cbd6dc',
    textColor: '#42545d',
    preview: cleanEmail || 'New chat created',
    time: 'Now',
    unread: 0,
    favorite: false,
    group: false,
    messages: [
      {
        id: `${id}-created`,
        direction: 'in',
        text: `New chat created with ${cleanPhone}`,
        time: 'Now'
      }
    ]
  };

  return {
    ...state,
    activeSection: 'chats',
    activeContactId: id,
    deletedContactIds: (state.deletedContactIds ?? []).filter((deletedId) => deletedId !== id),
    contacts: [newContact, ...state.contacts]
  };
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

export function updateContactChat(state, contactId, { name, phone, email = '' }) {
  const cleanName = name.trim();
  const cleanPhone = phone.trim();
  const cleanEmail = email.trim() || makeGmailFromName(cleanName);
  if (!cleanName || !cleanPhone) return state;

  return {
    ...state,
    contacts: state.contacts.map((contact) =>
      contact.id === contactId
        ? {
            ...contact,
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            preview: cleanEmail || contact.preview,
            avatar: cleanName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase()
          }
        : contact
    )
  };
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
