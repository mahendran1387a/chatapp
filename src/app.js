import {
  createAuthenticatedContact,
  createInitialState,
  deleteContactChat,
  deleteMessage,
  filterAuthenticatedUsers,
  filterContacts,
  getActionView,
  getActiveContact,
  getSettingDangerView,
  getSettingOptionView,
  getSettingsPage,
  reconcileAuthenticatedContacts,
  searchSettings,
  selectContact,
  sendMessage,
  switchSection,
  updateMessage
} from './chat-store.js';
import {
  approveFamilyMember,
  createFirebaseGroup,
  deleteFirebaseGroup,
  getFirebaseSetupStatus,
  isFamilyOwnerEmail,
  logoutGoogleUser,
  saveUserProfile,
  sendFamilyInvite,
  sendFirebaseMessage,
  sendFirebaseGroupMessage,
  setUserOnlineStatus,
  signInWithGoogle,
  startAuthListener,
  subscribeAuthenticatedUsers,
  subscribeCurrentUserProfile,
  subscribeFamilyInvites,
  subscribeGroupMessages,
  subscribePendingFamilyUsers,
  subscribeConversationMessages,
  subscribeUserGroups,
  updateFirebaseGroupName
} from './firebase-chat.js';

const savedChatStorageKey = 'chatapp.savedChats.v1';
const clientIdStorageKey = 'chatapp.clientId.v1';
const profileStorageKey = 'kidswhatsapp.profile.v1';
const serverChatStorageUrl = '/api/chats';
const syncIntervalMs = 1500;
let lastChatSnapshot = '';
let isSavingChats = false;

function createClientId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getClientId() {
  try {
    const saved = window.localStorage.getItem(clientIdStorageKey);
    if (saved) return saved;
    const next = createClientId();
    window.localStorage.setItem(clientIdStorageKey, next);
    return next;
  } catch {
    return createClientId();
  }
}

function isFirestoreGroupContact(contact) {
  return Boolean(contact?.group === true || contact?.groupId);
}

function getPersistableContacts() {
  return state.contacts;
}

function getPersistedChatPayload() {
  const contacts = getPersistableContacts();
  const activeContactId = contacts.some((contact) => contact.id === state.activeContactId)
    ? state.activeContactId
    : undefined;
  return {
    activeContactId,
    deletedContactIds: state.deletedContactIds ?? [],
    contacts
  };
}

function stringifyChatPayload(payload) {
  return JSON.stringify(payload);
}

function rememberChatSnapshot(payload = getPersistedChatPayload()) {
  lastChatSnapshot = stringifyChatPayload(payload);
}

function loadSavedChatState() {
  try {
    const saved = window.localStorage.getItem(savedChatStorageKey);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

async function loadServerChatState() {
  if (window.location.protocol === 'file:') return {};
  try {
    const response = await fetch(serverChatStorageUrl, { cache: 'no-store' });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

function loadProfileValues() {
  const defaults = {
    Name: 'Aadhish Mahendran',
    Photo: '',
    Status: 'Ready to chat',
    'Favorite color': 'Purple',
    'Fun bio': 'I like games, space, and kind chats.'
  };
  try {
    const saved = window.localStorage.getItem(profileStorageKey);
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      ...defaults,
      Status: typeof parsed.Status === 'string' ? parsed.Status : defaults.Status,
      'Favorite color':
        typeof parsed['Favorite color'] === 'string' ? parsed['Favorite color'] : defaults['Favorite color'],
      'Fun bio': typeof parsed['Fun bio'] === 'string' ? parsed['Fun bio'] : defaults['Fun bio']
    };
  } catch {
    return defaults;
  }
}

function saveProfileValues() {
  try {
    window.localStorage.setItem(
      profileStorageKey,
      JSON.stringify({
        Status: profileValues.Status,
        'Favorite color': profileValues['Favorite color'],
        'Fun bio': profileValues['Fun bio']
      })
    );
  } catch {
    // Browser storage can be unavailable in incognito.
  }
}

function saveLocalChatState(payload) {
  window.localStorage.setItem(savedChatStorageKey, JSON.stringify(payload));
}

async function saveServerChatState(payload) {
  if (window.location.protocol === 'file:') return;
  await fetch(serverChatStorageUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function saveChatState() {
  const payload = getPersistedChatPayload();
  rememberChatSnapshot(payload);
  try {
    saveLocalChatState(payload);
  } catch {
    // Incognito can block local storage, so the server save below is the important fallback.
  }
  if (!authReady || currentAuthUser) return;
  isSavingChats = true;
  saveServerChatState(payload)
    .catch(() => showToast('Could not save chat on this browser'))
    .finally(() => {
      isSavingChats = false;
    });
}

const currentClientId = getClientId();
const savedInitialChatState = loadSavedChatState();
let state = createInitialState(savedInitialChatState);
rememberChatSnapshot();
let currentFilter = 'all';
let activeAction = null;
let activeSettingsPage = null;
let activeContactMenuId = null;
let activeMessageMenu = null;
let currentAuthUser = null;
let authReady = false;
let authError = '';
let chatsLoading = false;
let approvedUsersLoaded = false;
let userGroupsLoaded = false;
let authenticatedUsers = [];
let firebaseGroups = [];
let pendingFamilyUsers = [];
let pendingFamilyInvites = [];
let currentUserProfile = null;
let unsubscribeUsers = () => {};
let unsubscribeCurrentUserProfile = () => {};
let unsubscribePendingFamilyUsers = () => {};
let unsubscribeFamilyInvites = () => {};
let unsubscribeConversation = () => {};
let unsubscribeGroups = () => {};
let subscribedConversationContactId = '';
let familyListsStarted = false;
let settingsSearchQuery = '';
let friendSearchQuery = '';
let currentPresenceStatus = '';
let mobileConversationOpen = false;
let restoreSelectedChatOnLoad = Boolean(savedInitialChatState.activeContactId);
let selectedGroupMemberIds = new Set();
const settingSwitches = new Map();
const profileValues = loadProfileValues();
const profileOwnershipLabels = {
  googleName: 'Safe sign-in name',
  googlePhoto: 'Profile photo',
  favoriteColor: 'Favorite color',
  funBio: 'Fun bio'
};
const quickEmojiValues = ['😀', '😂', '🎮', '🚀', '🦄', '🍕', '⚽'];
const quickEmojiLabel = '😀 😂 🎮 🚀 🦄 🍕 ⚽';

const chatList = document.querySelector('#chatList');
const searchInput = document.querySelector('#searchInput');
const conversation = document.querySelector('#conversation');
const emptyState = document.querySelector('#emptyState');
const recentStatuses = document.querySelector('#recentStatuses');
const viewedStatuses = document.querySelector('#viewedStatuses');
const channelList = document.querySelector('#channelList');
const filters = document.querySelectorAll('.filter');
const railButtons = document.querySelectorAll('.rail-button[data-section]');
const panels = document.querySelectorAll('[data-panel]');
const appShell = document.querySelector('.app-shell');
const signedInUser = document.querySelector('.signed-in-user');
const friendsInvitesPanel = document.querySelector('[data-friends-invites]');
const authGate = document.createElement('section');
authGate.className = 'auth-gate';
authGate.setAttribute('aria-live', 'polite');
document.body.prepend(authGate);

function initials(name) {
  return name
    .split(/\s|_/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function renderAvatar(label, color, extraClass = '', textColor = '#ffffff') {
  return `<span class="avatar ${extraClass}" style="background:${color}; color:${textColor}">${label}</span>`;
}

function getContactEmail(contact) {
  if (contact.email) return contact.email;
  return `${contact.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'friend'}@gmail.com`;
}

function renderContactAvatar(contact, extraClass = '') {
  return renderAvatar(
    contact.avatar,
    contact.color,
    extraClass,
    contact.textColor ?? '#ffffff'
  );
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isTextEntryActive() {
  const active = document.activeElement;
  return Boolean(active?.matches('input, textarea, [contenteditable="true"]'));
}

function getUserName(user) {
  return user?.displayName || user?.email?.split('@')[0] || 'Signed-in friend';
}

function getUserEmail(user) {
  return user?.email || 'Google account';
}

function getUserAvatar(user) {
  return initials(getUserName(user)) || 'GU';
}

function getPresenceStatusLabel(onlineStatus) {
  if (onlineStatus === 'online') return '🟢 Online';
  if (onlineStatus === 'away') return '🌙 Away';
  return '⚫ Offline';
}

function getPresenceStatusClass(onlineStatus) {
  return ['online', 'away', 'offline'].includes(onlineStatus) ? onlineStatus : 'offline';
}

function renderPresenceStatus(onlineStatus, extraClass = '') {
  const statusClass = getPresenceStatusClass(onlineStatus);
  return `<span class="presence-status ${statusClass} ${extraClass}">${getPresenceStatusLabel(statusClass)}</span>`;
}

function renderUserEmailLine(user, extraClass = 'user-card-email') {
  return `<small class="${extraClass}">${escapeHtml(getUserEmail(user))}</small>`;
}

function renderUserCardMeta(user) {
  return `
    <small class="user-card-label">Google friend</small>
    ${renderUserEmailLine(user)}
    ${renderPresenceStatus(user?.onlineStatus, 'mini')}
  `;
}

function getGroupMemberLabel(contact) {
  const count = Array.isArray(contact.memberUids) ? contact.memberUids.length : 0;
  return `${count} member${count === 1 ? '' : 's'}`;
}

function renderContactStatus(contact, extraClass = '') {
  if (contact?.group) {
    return `<span class="presence-status group ${extraClass}">${getGroupMemberLabel(contact)}</span>`;
  }
  return renderPresenceStatus(contact?.onlineStatus, extraClass);
}

function isCurrentUserOwner() {
  return isFamilyOwnerEmail(currentAuthUser?.email);
}

function isCurrentUserApproved() {
  return Boolean(currentAuthUser && (isCurrentUserOwner() || currentUserProfile?.approved === true));
}

function insertEmojiIntoMessage(input, emoji) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  const cursor = start + emoji.length;
  input.setSelectionRange(cursor, cursor);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function renderUserPhoto(user, extraClass = '') {
  if (user?.photoURL) {
    return `<img class="avatar ${extraClass}" src="${escapeAttribute(user.photoURL)}" alt="${escapeAttribute(getUserName(user))} profile photo" />`;
  }
  return renderAvatar(getUserAvatar(user), '#cbd6dc', extraClass, '#42545d');
}

function renderAuthGate() {
  const configured = getFirebaseSetupStatus().configured;
  if (!authReady) {
    appShell.classList.add('auth-locked');
    authGate.classList.remove('hidden');
    authGate.innerHTML = `
      <div class="auth-card">
        <img src="app-icon.svg" alt="" />
        <h1>Loading chats...</h1>
        <p>Getting your colorful chat room ready.</p>
      </div>
    `;
    return;
  }

  appShell.classList.toggle('auth-locked', !currentAuthUser);
  if (currentAuthUser) {
    authGate.classList.add('hidden');
    authGate.innerHTML = '';
    return;
  }

  authGate.classList.remove('hidden');
  authGate.innerHTML = `
    <div class="auth-card">
      <img src="app-icon.svg" alt="" />
      <h1>Kids WhatsApp</h1>
      <p>A colorful, private place for family and friends after Google sign-in.</p>
      ${authError ? `<small class="auth-error">${authError}</small>` : ''}
      ${configured
        ? '<button class="google-sign-in" type="button" data-auth-sign-in>Sign in with Google</button>'
        : '<small class="auth-error">Setup is not ready yet. Ask a parent to add the app keys.</small>'}
    </div>
  `;
}

function renderLoadingChats() {
  panels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== state.activeSection);
  });
  railButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === state.activeSection);
  });
  conversation.classList.add('hidden');
  emptyState.classList.remove('hidden');
  emptyState.innerHTML = `
    <div class="empty-illustration">KW</div>
    <h2>Loading chats...</h2>
    <p>Getting your colorful chat room ready.</p>
    <small>Friends, groups, and messages load automatically.</small>
  `;
}

function hasSelectedChat() {
  if (!currentAuthUser || !isCurrentUserApproved()) return false;
  const contact = getActiveContact(state);
  return Boolean(contact?.uid || contact?.groupId);
}

function renderNoChatSelected() {
  conversation.classList.add('hidden');
  emptyState.classList.remove('hidden');
  emptyState.innerHTML = `
    <div class="empty-illustration">WA</div>
    <h2>Choose a friend to start chatting.</h2>
    <p>Open Friends & Invites and pick a trusted Google friend.</p>
    <small>Text chat and voice calls only.</small>
  `;
}

async function handleGoogleLogout() {
  activeAction = null;
  activeSettingsPage = null;
  mobileConversationOpen = false;
  state = switchSection(state, 'chats');
  updateCurrentPresence('offline');
  try {
    await logoutGoogleUser();
    showToast('Logged out from this computer');
  } catch (error) {
    showFirebaseError(error);
  }
}

function renderFamilyAccessGate() {
  if (!currentAuthUser || isCurrentUserApproved()) return false;
  appShell.classList.add('auth-locked');
  authGate.classList.remove('hidden');
  authGate.innerHTML = `
    <div class="auth-card family-gate">
      <img src="app-icon.svg" alt="" />
      <h1>Only approved family and friends can chat here</h1>
      <p class="family-gate-message">Ask the app owner to approve you. Your safe profile has been saved and will appear in the owner's approval list.</p>
      <button class="google-sign-in" type="button" data-auth-logout>Log out</button>
    </div>
  `;
  return true;
}

function renderSignedInUser() {
  if (!signedInUser) return;
  if (!currentAuthUser) {
    signedInUser.innerHTML = '';
    signedInUser.classList.add('hidden');
    signedInUser.removeAttribute('data-open-profile');
    signedInUser.removeAttribute('role');
    signedInUser.removeAttribute('tabindex');
    signedInUser.removeAttribute('aria-label');
    return;
  }
  signedInUser.classList.remove('hidden');
  signedInUser.setAttribute('data-open-profile', '');
  signedInUser.setAttribute('role', 'button');
  signedInUser.setAttribute('tabindex', '0');
  signedInUser.setAttribute('aria-label', 'Open profile page');
  signedInUser.innerHTML = `
    ${renderUserPhoto(currentAuthUser, 'signed-in-avatar')}
    <span class="signed-in-copy">
      <strong>${escapeHtml(getUserName(currentAuthUser))}</strong>
      ${renderUserEmailLine(currentAuthUser, 'signed-in-email')}
      ${renderPresenceStatus(currentPresenceStatus || 'online', 'mini')}
    </span>
  `;
}

function requireAuth() {
  if (currentAuthUser) return true;
  showToast('Sign in first');
  renderAuthGate();
  return false;
}

function renderDetailView(view, type = 'action') {
  if (view.form === 'newChat') {
    renderAuthenticatedUserList(view);
    return;
  }
  if (view.form === 'createGroup') {
    emptyState.classList.remove('hidden');
    conversation.classList.add('hidden');
    emptyState.innerHTML = renderCreateGroupForm();
    return;
  }
  if (view.menuItems) {
    renderMenuView(view);
    return;
  }
  const iconClass = type === 'settings' ? 'settings-illustration' : 'detail-illustration';
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="${iconClass}"></div>
    <h2>${view.title}</h2>
    <p>${view.body}</p>
    <div class="detail-list">
      ${view.points.map((point) => `<span>${point}</span>`).join('')}
    </div>
    <button class="detail-action" data-action-toast="${view.title}">${view.primaryAction}</button>
  `;
}

function disabledListView(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="discover-view">
      <h2>${view.title}</h2>
      <p>${view.body}</p>
      <div class="chat-menu-list">
        ${view.listItems
          .map(
            (item) => `
              <button class="menu-option" data-business-list-item="${item.name}">
                <span>
                  <strong>${item.name}</strong>
                  <small>${item.detail}</small>
                </span>
                <span class="follow-button">${item.tag}</span>
              </button>
            `
          )
          .join('')}
      </div>
      <button class="detail-action" data-action-toast="${view.title}">${view.primaryAction}</button>
    </div>
  `;
}

function blockedStatusComposer(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="business-profile-form status-compose-form">
      <div class="status-preview-card">Safe chat only</div>
      <h2>${view.title}</h2>
      <p>Write a text status for your contacts. It disappears after 24 hours.</p>
      <div class="business-fields">
        ${view.fields
          .map((field) => {
            const value = field.value ?? '';
            return `
              <label class="profile-field">
                <span>${field.name}</span>
                <input name="${field.name}" type="${field.type}" value="${value}" autocomplete="off" placeholder="${field.name === 'Status text' ? 'What is happening?' : 'Green'}" required />
              </label>
            `;
          })
          .join('')}
      </div>
      <button class="detail-action" type="button">OK</button>
    </div>
  `;
}

function disabledCommunityExamples(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="discover-view">
      <h2>${view.title}</h2>
      <p>${view.body}</p>
      <div class="community-example-list">
        ${view.communityExamples
          .map(
            (item) => `
              <button class="community-example-card" data-community-example="${item.name}">
                <span class="community-example-avatar" style="background:${item.color}">${item.name[0]}</span>
                <span>
                  <strong>${item.name}</strong>
                  <small>${item.groups}</small>
                  <small>${item.members}</small>
                </span>
                <span class="follow-button">View</span>
              </button>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function disabledDiscoverView(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="discover-view">
      <h2>${view.title}</h2>
      <p>${view.body}</p>
      <div class="discover-list">
        ${view.discoverItems
          .map(
            (item) => `
              <button class="discover-item" data-discover-channel="${item.name}">
                ${renderAvatar(item.avatar, item.color, 'channel-avatar')}
                <span>
                  <strong>${item.name}</strong>
                  <small>${item.category} · ${item.followers}</small>
                </span>
                <span class="follow-button">Follow</span>
              </button>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function blockedChannelComposer(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="business-profile-form">
      <div class="channels-illustration"></div>
      <h2>${view.title}</h2>
      <p>Create a channel for updates, announcements, or your favorite topic.</p>
      <div class="business-fields">
        ${view.fields
          .map((field) => {
            const value = field.value ?? '';
            return `
              <label class="profile-field">
                <span>${field.name}</span>
                <input name="${field.name}" type="${field.type}" value="${value}" autocomplete="off" placeholder="${field.name === 'Channel name' ? 'My updates' : 'What is this channel about?'}" required />
              </label>
            `;
          })
          .join('')}
      </div>
      <button class="detail-action" type="button">OK</button>
    </div>
  `;
}

function renderMenuView(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="chat-menu-card">
      <h2>${view.title}</h2>
      <div class="chat-menu-list">
        ${view.menuItems
          .map(
            (item) => `
              <button class="menu-option ${item.danger ? 'danger-row' : ''}" data-menu-option="${item.label}">
                <span>
                  <strong>${item.label}</strong>
                  <small>${item.detail}</small>
                </span>
                <span class="chevron">›</span>
              </button>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderAuthenticatedUserRow(user) {
  return `
    <button class="auth-user-row" type="button" data-auth-user-id="${escapeAttribute(user.uid)}">
      ${renderUserPhoto(user, 'small')}
      <span class="user-card-copy">
        <strong>${escapeHtml(getUserName(user))}</strong>
        ${renderUserCardMeta(user)}
      </span>
    </button>
  `;
}

function getFilteredAuthenticatedUsers() {
  return filterAuthenticatedUsers(authenticatedUsers, currentAuthUser?.uid ?? '', friendSearchQuery);
}

function getGroupCandidateUsers() {
  return filterAuthenticatedUsers(authenticatedUsers, currentAuthUser?.uid ?? '', '');
}

function renderAuthenticatedUserRows(users, emptyMessage) {
  return users.length
    ? users.map(renderAuthenticatedUserRow).join('')
    : `<p class="empty-copy">${emptyMessage}</p>`;
}

function renderFriendSearchRows(emptyMessage) {
  const users = getFilteredAuthenticatedUsers();
  const query = friendSearchQuery.trim();
  const title = query ? 'Search results' : 'Approved friends';
  const noMatch = query ? 'No approved friend matched that search.' : emptyMessage;
  return `
    <h3 class="user-list-heading">${title}</h3>
    ${renderAuthenticatedUserRows(users, noMatch)}
  `;
}

function renderPendingFamilyRows() {
  if (!isCurrentUserOwner()) return '';
  const pendingUserEmails = new Set(pendingFamilyUsers.map((user) => String(user.email ?? '').trim().toLowerCase()));
  const approvedUserEmails = new Set(authenticatedUsers.map((user) => String(user.email ?? '').trim().toLowerCase()));
  const inviteRows = pendingFamilyInvites
    .filter((invite) => {
      const email = String(invite.email ?? '').trim().toLowerCase();
      return email && !pendingUserEmails.has(email) && !approvedUserEmails.has(email);
    })
    .map((invite) => `
      <div class="auth-user-row invite-row">
        ${renderAvatar('✉', '#facc15', 'small', '#503600')}
        <span class="user-card-copy">
          <strong>${escapeHtml(invite.email)}</strong>
          <small class="user-card-label">Invite sent</small>
          <small class="user-card-email">${escapeHtml(invite.email)}</small>
        </span>
      </div>
    `);
  const approvalRows = pendingFamilyUsers.map((user) => `
        <button class="auth-user-row" type="button" data-approve-family-user="${escapeAttribute(user.uid)}">
          ${renderUserPhoto(user, 'small')}
          <span class="user-card-copy">
            <strong>${escapeHtml(getUserName(user))}</strong>
            ${renderUserEmailLine(user)}
            <small class="user-card-label">Tap to allow this person</small>
          </span>
        </button>
      `);
  const rows = [...approvalRows, ...inviteRows];
  return `
    <div class="auth-user-list pending-family-list" aria-label="Allow people">
      <h3 class="user-list-heading">Allow People</h3>
      <div class="pending-family-message">
        <p class="pending-family-copy">Tap a person below to allow them into your family chat.</p>
      </div>
      <div class="pending-family-people" aria-label="People waiting to be allowed">
        ${rows.length ? rows.join('') : '<p class="empty-copy">No one is waiting right now. Ask Sangavi to sign in once, then come back here.</p>'}
      </div>
    </div>
  `;
}

function renderInviteFamilyForm() {
  if (!isCurrentUserOwner()) return '';
  return `
    <form class="friend-search-form family-invite-form" data-family-invite-form>
      <label class="friend-search">
        <span>Invite by Gmail</span>
        <input data-family-invite-email name="email" type="email" autocomplete="off" placeholder="family@gmail.com" />
      </label>
      <button class="friend-search-button" type="submit">Send invite</button>
    </form>
  `;
}

function renderCreateGroupButton() {
  return '<button class="friend-search-button create-group-shortcut" type="button" data-action="createGroup">+ Create Group</button>';
}

function renderGroupMemberChoice(user) {
  const checked = selectedGroupMemberIds.has(user.uid) ? 'checked' : '';
  return `
    <label class="group-member-choice">
      <input type="checkbox" data-group-member name="members" value="${escapeAttribute(user.uid)}" ${checked} />
      ${renderUserPhoto(user, 'small')}
      <span class="group-member-copy">
        <strong>${escapeHtml(getUserName(user))}</strong>
        ${renderUserEmailLine(user)}
        ${renderPresenceStatus(user.onlineStatus, 'mini')}
      </span>
    </label>
  `;
}

function renderCreateGroupForm() {
  const users = getGroupCandidateUsers();
  const canCreate = users.length >= 1;
  return `
    <form class="business-profile-form create-group-form" id="createGroupForm">
      <div class="detail-illustration"></div>
      <h2>Create Group</h2>
      <p>Choose at least 1 friend, then start a safe group chat.</p>
      <label class="profile-field">
        <span>Group name</span>
        <input name="groupName" type="text" autocomplete="off" maxlength="40" placeholder="Family Team" required />
      </label>
      <div class="group-member-list" aria-label="Choose group friends">
        ${canCreate
          ? users.map(renderGroupMemberChoice).join('')
          : '<p class="empty-copy">Ask at least 1 approved friend to sign in first.</p>'}
      </div>
      <button class="detail-action" type="submit" ${canCreate ? '' : 'disabled'}>Create Group</button>
    </form>
  `;
}

function renderFriendSearchForm(autoListMessage) {
  return `
    <div class="invite-friend-intro">
      <h3>Find Family &amp; Friends</h3>
      <p>Search filters approved Google friends already saved for this app.</p>
    </div>
    ${renderPendingFamilyRows()}
    ${renderInviteFamilyForm()}
    <div class="friend-search-form" id="friendSearchForm">
      <label class="friend-search">
        <span>Search friends</span>
        <input id="friendSearchInput" data-friend-search-input type="search" autocomplete="off" value="${escapeAttribute(friendSearchQuery)}" placeholder="Search friends, groups, or messages" />
      </label>
    </div>
    <div class="auth-user-list friend-search-results">
      ${renderFriendSearchRows(autoListMessage)}
    </div>
    ${renderCreateGroupButton()}
  `;
}

function renderFriendsInvitesPanel() {
  if (!friendsInvitesPanel) return;
  friendsInvitesPanel.innerHTML = `
    <div class="friends-invites-shell">
      <div class="invite-friend-intro">
        <h3>Friends & Invites</h3>
        <p>Approved Google friends, pending invites, and family approvals live here.</p>
      </div>
      ${renderFriendSearchForm('No approved family yet. Invite by Gmail, then approve them after they sign in.')}
    </div>
  `;
}

function renderAuthenticatedUserList(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="business-profile-form">
      <div class="detail-illustration"></div>
      <h2>${view.title}</h2>
      <p>Open Friends & Invites to pick approved friends, send Gmail invites, or approve waiting people.</p>
      <button class="detail-action" type="button" data-jump-section="friends">Open Friends & Invites</button>
    </div>
  `;
}

function disabledProfileForm(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="business-profile-form" data-disabled-safe-feature="${view.title}">
      <div class="detail-illustration"></div>
      <h2>${view.title}</h2>
      <p>${view.body}</p>
      <div class="business-fields">
        ${view.fields
          .map((field) => {
            const value = field.value ?? '';
            return `
              <label class="profile-field">
                <span>${field.name}</span>
                <input name="${field.name}" type="${field.type}" value="${value}" autocomplete="off" disabled />
              </label>
            `;
          })
          .join('')}
      </div>
      <button class="detail-action" type="button" data-action-toast="${view.title}">OK</button>
    </div>
  `;
}

function renderSettingsPage(pageId) {
  const page = getSettingsPage(pageId);
  if (pageId === 'profile') return renderProfileSettingsPage(page);
  return `
    <div class="nested-settings">
      <header class="nested-header">
        <button class="back-button" data-settings-back aria-label="Back">‹</button>
        <h2>${page.title}</h2>
      </header>
      <div class="nested-list">
        ${page.items
          .map((item, index) => {
            const key = `${pageId}-${index}`;
            const enabled = settingSwitches.has(key) ? settingSwitches.get(key) : item.enabled;
            const rowClass = item.type === 'danger' ? 'nested-row danger-row' : 'nested-row';
            const control =
              item.type === 'toggle'
                ? `<span class="switch ${enabled ? 'on' : ''}" aria-hidden="true"></span>`
                : item.type === 'shortcut'
                  ? `<kbd>${item.detail}</kbd>`
                  : '<span class="chevron">›</span>';
            return `
              <button class="${rowClass}" data-setting-item="${key}" data-setting-type="${item.type}" data-setting-label="${item.label}">
                <span>
                  <strong>${item.label}</strong>
                  <small>${item.detail}</small>
                </span>
                ${control}
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderProfileSettingsPage(page) {
  const profileName = getUserName(currentAuthUser);
  const profilePrivacyLabel = 'Private sign-in';
  const photoSummary = currentAuthUser?.photoURL ? 'Profile photo connected' : `${getUserAvatar(currentAuthUser)} initials`;
  return `
    <div class="nested-settings">
      <header class="nested-header">
        <button class="back-button" data-settings-back aria-label="Back">‹</button>
        <h2>${page.title}</h2>
      </header>
      <form class="profile-form" id="profileForm">
        <div class="profile-ownership-header">
          ${renderUserPhoto(currentAuthUser, 'profile-edit-photo')}
          <strong>${escapeHtml(profileName)}</strong>
          <small>${profilePrivacyLabel}</small>
        </div>
        ${page.items
          .map((item) => {
            if (item.type === 'readonly') {
              const value = item.label === 'Name' ? profileName : photoSummary;
              const sourceLabel =
                item.label === 'Name' ? profileOwnershipLabels.googleName : profileOwnershipLabels.googlePhoto;
              return `
                <div class="profile-readonly-card" aria-label="${escapeAttribute(sourceLabel)}">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(value)}</strong>
                  <small>${escapeHtml(item.detail)}</small>
                </div>
              `;
            }
            if (item.type === 'textarea') {
              const value = profileValues[item.label] ?? item.value ?? '';
              return `
                <label class="profile-field">
                  <span>${escapeHtml(item.label)}</span>
                  <textarea name="${escapeAttribute(item.label)}" rows="3" maxlength="180">${escapeHtml(value)}</textarea>
                  <small>${escapeHtml(item.detail)}</small>
                </label>
              `;
            }
            if (item.type === 'action') {
              return `
                <button type="button" class="nested-row" data-setting-item="profile-photo" data-setting-type="action" data-setting-label="${item.label}">
                  <span><strong>${item.label}</strong><small>${item.detail}</small></span>
                  <span class="chevron">›</span>
                </button>
              `;
            }
            const inputType = item.type === 'password' ? 'password' : 'text';
            const value = profileValues[item.label] ?? item.value ?? '';
            return `
              <label class="profile-field">
                <span>${escapeHtml(item.label)}</span>
                <input name="${escapeAttribute(item.label)}" type="${inputType}" value="${escapeAttribute(value)}" autocomplete="${item.type === 'password' ? 'new-password' : 'off'}" placeholder="${item.label === 'Email' ? 'example@gmail.com' : ''}" />
                <small>${escapeHtml(item.detail)}</small>
              </label>
            `;
          })
          .join('')}
        <button class="save-profile" type="submit">Save profile</button>
      </form>
    </div>
  `;
}

function renderSettingsSearchResult(row) {
  const navigation = `data-settings-page="${row.page}"`;
  return `
    <button class="settings-row settings-search-result" ${navigation}>
      <span class="line-icon chats-icon"></span>
      <span><strong>${row.label}</strong><small>${row.detail}</small></span>
    </button>
  `;
}

function renderSettingsSearchResults() {
  const results = searchSettings(settingsSearchQuery);
  if (!results.length) {
    return `
      <div class="settings-search-results empty-results">
        <h2>No match yet</h2>
        <p>Try chat, privacy, notifications, or logout.</p>
      </div>
    `;
  }

  return `
    <div class="settings-search-results">
      <h2>Search results</h2>
      <div class="settings-list search-results-list">
        ${results.map(renderSettingsSearchResult).join('')}
      </div>
    </div>
  `;
}

function renderSettingsScrollableContent() {
  const isSearchingSettings = settingsSearchQuery.trim().length > 0;
  if (isSearchingSettings) return renderSettingsSearchResults();

  return `
      <div class="settings-notice" data-action="chooseNotifications">
        <span class="line-icon bulb-icon"></span>
        <span><strong>Choose your notifications</strong><small>Get notifications for chats, groups, and calls. <b>Choose now</b></small></span>
        <button data-settings-dismiss aria-label="Dismiss settings notice">x</button>
      </div>
      <button class="profile-row" data-open-profile>
        ${renderUserPhoto(currentAuthUser, 'profile-photo')}
        <span>
          <strong>${escapeHtml(getUserName(currentAuthUser))}</strong>
          <small>Private sign-in</small>
          <small>${escapeHtml(profileValues.Status || 'Ready to chat')}</small>
        </span>
      </button>
      <div class="settings-list">
        <button class="settings-row active" data-settings-page="account">
          <span class="line-icon key-icon"></span>
          <span><strong>Account</strong><small>Safe sign-in keeps names real</small></span>
        </button>
        <button class="settings-row" data-settings-page="chatsSettings">
          <span class="line-icon chats-icon"></span>
          <span><strong>Chats</strong><small>Text chat, groups, read ticks</small></span>
        </button>
        <button class="settings-row" data-settings-page="notificationsSettings">
          <span class="line-icon bell-icon"></span>
          <span><strong>Notifications</strong><small>Messages, groups, and voice calls</small></span>
        </button>
        <button class="settings-row logout-row" data-auth-logout>
          <span class="line-icon logout-icon"></span>
          <span><strong>Log out</strong><small>Come back later safely</small></span>
        </button>
      </div>
  `;
}

function renderSettingsHome() {
  return `
    <header class="panel-header">
      <h1>Settings</h1>
    </header>
    <label class="search-box settings-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 4a5.5 5.5 0 0 1 4.38 8.83l4.15 4.14-1.06 1.06-4.14-4.15A5.5 5.5 0 1 1 9.5 4Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>
      <input id="settingsSearchInput" type="text" placeholder="Search settings" value="${escapeAttribute(settingsSearchQuery)}" autocomplete="off" />
    </label>
    <div class="settings-scroll">
      ${renderSettingsScrollableContent()}
    </div>
  `;
}

function renderChats() {
  const contacts = filterContacts(state, {
    query: searchInput.value,
    filter: currentFilter
  });

  const query = searchInput.value.trim();
  const heading = query ? 'Search results' : 'Recent chats';
  const isGroupsFilter = currentFilter === 'groups';
  const emptyMessage = isGroupsFilter
    ? 'No groups yet. Create one with at least 2 friends.'
    : authenticatedUsers.length > 1
      ? 'Pick a friend or create a group to start chatting.'
      : 'Ask your friend to sign in once.';
  chatList.innerHTML = `
    <h2 class="chat-section-heading">${heading}</h2>
    ${isGroupsFilter ? `<div class="group-list-action">${renderCreateGroupButton()}</div>` : ''}
    ${
      contacts.length
        ? contacts
            .map(
              (contact) => `
        <div class="chat-item ${contact.id === state.activeContactId ? 'active' : ''}" data-contact-id="${contact.id}">
          <button class="chat-main" type="button" data-contact-open="${contact.id}">
            ${renderContactAvatar(contact)}
            <span class="chat-copy" data-contact-menu="${contact.id}">
              <span class="chat-title-row">
                <span class="chat-name-wrap">
                  <span class="chat-name">${contact.name}</span>
                  ${renderContactStatus(contact, 'compact')}
                </span>
                <span class="chat-time">${contact.time}</span>
              </span>
              <span class="chat-preview">${contact.deleted ? 'This message was deleted' : contact.preview}</span>
            </span>
            ${contact.unread ? `<span class="unread">${contact.unread}</span>` : '<span></span>'}
          </button>
        </div>
      `
            )
            .join('')
        : `<p class="empty-copy chat-list-empty">${emptyMessage}</p>`
    }
  `;
}

function renderConversation() {
  const contact = getActiveContact(state);
  if (!contact?.uid && !contact?.groupId) {
    renderNoChatSelected();
    return;
  }

  emptyState.classList.add('hidden');
  conversation.classList.remove('hidden');
  conversation.innerHTML = `
    <header class="conversation-header">
      <button class="mobile-chat-back" type="button" aria-label="Back to chats" data-mobile-chat-back>‹</button>
      ${renderContactAvatar(contact, 'small')}
      <span class="conversation-title">
        <strong>${contact.name}</strong>
        <small>${renderContactStatus(contact)}</small>
      </span>
      <span class="conversation-actions">
        <button title="Voice call" aria-label="Voice call" data-action="voiceCall">Call</button>
      </span>
    </header>
    <div class="messages" id="messages">
      ${contact.messages
        .map(
          (message) => {
            const direction = message.senderId
              ? (message.senderUid ? message.senderUid === currentAuthUser?.uid : message.senderId === currentClientId)
                ? 'out'
                : 'in'
              : message.direction;
            const readBy = Array.isArray(message.readBy) ? message.readBy : [];
            const otherGroupMembers = Array.isArray(contact.memberUids)
              ? contact.memberUids.filter((uid) => uid !== currentAuthUser?.uid)
              : [];
            const isGroupRead = Boolean(contact.groupId && otherGroupMembers.length && otherGroupMembers.every((uid) => readBy.includes(uid)));
            const isRead = direction === 'out' && (contact.uid ? readBy.includes(contact.uid) : isGroupRead);
            const status = direction === 'out'
              ? `<span class="message-status ${isRead ? 'read' : 'sent'}" title="${isRead ? 'Read' : 'Sent'}">${isRead ? '✓✓' : '✓'}</span>`
              : '';
            return `
              <div class="bubble ${direction} ${message.deleted ? 'deleted' : ''}" data-message-id="${message.id}" data-contact-id="${contact.id}">
                ${message.senderDisplayName ? `<strong class="sender-label">${escapeHtml(message.senderDisplayName)}</strong>` : ''}
                ${message.deleted ? 'This message was deleted' : escapeHtml(message.text)}
                <time>${status}${message.time}</time>
              </div>
            `;
          }
        )
        .join('')}
    </div>
    <form class="composer" id="composer">
      <span class="emoji-tools">
        <button type="button" title="Emoji" aria-label="Emoji" data-emoji-toggle>😀</button>
        <span class="emoji-picker hidden" data-emoji-picker aria-label="${quickEmojiLabel}">
          ${quickEmojiValues.map((emoji) => (
            emoji === '😀'
              ? '<button type="button" data-emoji-value="😀" aria-label="Add 😀">😀</button>'
              : `<button type="button" data-emoji-value="${emoji}" aria-label="Add ${emoji}">${emoji}</button>`
          )).join('')}
        </span>
      </span>
      <textarea id="messageInput" rows="1" autocomplete="off" placeholder="Type a message" spellcheck="true"></textarea>
      <button type="submit" title="Send" aria-label="Send">➤</button>
    </form>
  `;

  const messages = conversation.querySelector('#messages');
  messages.scrollTop = messages.scrollHeight;
  const resizeComposer = () => {
    const input = conversation.querySelector('#messageInput');
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  };
  conversation.querySelector('#messageInput').addEventListener('input', resizeComposer);
  conversation.querySelector('#messageInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      conversation.querySelector('#composer').requestSubmit();
    }
  });
  conversation.querySelector('[data-emoji-toggle]').addEventListener('click', () => {
    conversation.querySelector('[data-emoji-picker]').classList.toggle('hidden');
    conversation.querySelector('#messageInput').focus();
  });
  conversation.querySelector('[data-emoji-picker]').addEventListener('click', (event) => {
    const emojiButton = event.target.closest('[data-emoji-value]');
    if (!emojiButton) return;
    insertEmojiIntoMessage(conversation.querySelector('#messageInput'), emojiButton.dataset.emojiValue);
  });
  resizeComposer();
  conversation.querySelector('#composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireAuth()) return;
    const input = conversation.querySelector('#messageInput');
    const text = input.value;
    const activeContact = getActiveContact(state);
    if (!activeContact?.uid && !activeContact?.groupId) {
      showToast('Choose a signed-in friend or group first.');
      return;
    }
    try {
      if (activeContact.groupId) {
        await sendFirebaseGroupMessage(activeContact.groupId, text, currentAuthUser);
      } else {
        await sendFirebaseMessage(activeContact.uid, text, currentAuthUser);
      }
    } catch (error) {
      showFirebaseError(error);
      return;
    }
    state = sendMessage(state, text, {
      senderId: currentClientId,
      senderUid: currentAuthUser.uid,
      senderEmail: currentAuthUser.email ?? '',
      senderDisplayName: getUserName(currentAuthUser),
      senderPhotoURL: currentAuthUser.photoURL ?? ''
    });
    saveChatState();
    input.value = '';
    renderAll();
    conversation.querySelector('#messageInput').focus();
  });

  messages.addEventListener('contextmenu', (event) => {
    const bubble = event.target.closest('[data-message-id]');
    if (!bubble) return;
    event.preventDefault();
    showMessageMenu(bubble.dataset.contactId, bubble.dataset.messageId, {
      x: event.clientX,
      y: event.clientY
    });
  });
}

function renderStatuses() {
  if (!recentStatuses || !viewedStatuses) return;
  recentStatuses.innerHTML = state.statuses.recent.map(renderStatusItem).join('');
  viewedStatuses.innerHTML = state.statuses.viewed.map(renderStatusItem).join('');
}

function renderChannels() {
  if (!channelList) return;
  channelList.innerHTML = state.channels
    .map(
      (channel) => `
        <div class="channel-item">
          ${renderAvatar(channel.avatar, channel.color, 'channel-avatar', channel.textColor)}
          <span class="channel-copy">
            <span class="channel-name">${channel.name}${channel.verified ? '<span class="verified">v</span>' : ''}</span>
            <small>${channel.followers}</small>
          </span>
          <button class="follow-button ${channel.following ? 'following' : ''}" data-channel-id="${channel.id}">
            ${channel.following ? 'Following' : 'Follow'}
          </button>
        </div>
      `
    )
    .join('');
}

function renderStatusItem(status) {
  return `
    <button class="status-item">
      <span class="status-ring">${renderAvatar(initials(status.name), status.color, 'small')}</span>
      <span class="status-copy">
        <strong>${status.name}</strong>
        <small>${status.time}</small>
      </span>
      <span></span>
    </button>
  `;
}

function renderSection() {
  if (!['chats', 'friends', 'settings'].includes(state.activeSection)) {
    state = switchSection(state, 'chats');
  }
  document.body.classList.toggle(
    'mobile-conversation-open',
    state.activeSection === 'chats' && mobileConversationOpen && !activeAction
  );
  panels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== state.activeSection);
  });
  railButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === state.activeSection);
  });

  conversation.classList.add('hidden');

  if (activeAction) {
    renderDetailView(getActionView(activeAction), state.activeSection === 'settings' ? 'settings' : 'action');
    return;
  }

  if (state.activeSection === 'settings') {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="settings-illustration"></div>
      <h2>Settings</h2>
    `;
  } else if (state.activeSection === 'friends') {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="detail-illustration"></div>
      <h2>Friends & Invites</h2>
      <p>Pick an approved friend from the left menu to start chatting.</p>
      <small>Only signed-in, approved users can chat.</small>
    `;
  } else {
    conversation.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="empty-illustration">WA</div>
      <h2>Kids WhatsApp</h2>
      <p>Choose a friend and start a kind conversation.</p>
      <small>Safe text chat and voice calls.</small>
    `;
  }
}

function renderSettingsPanel() {
  const settingsPanel = document.querySelector('[data-panel="settings"]');
  if (!settingsPanel) return;
  settingsPanel.innerHTML = activeSettingsPage ? renderSettingsPage(activeSettingsPage) : renderSettingsHome();
}

function openKidProfilePage() {
  if (!requireAuth()) return;
  activeAction = null;
  activeSettingsPage = 'profile';
  mobileConversationOpen = false;
  state = switchSection(state, 'settings');
  renderAll();
}

function subscribeActiveConversation() {
  const activeContact = getActiveContact(state);
  const subscriptionKey = activeContact?.groupId
    ? `group:${activeContact.groupId}`
    : activeContact?.uid
      ? `user:${activeContact.uid}`
      : '';
  if (!currentAuthUser || !subscriptionKey || subscribedConversationContactId === subscriptionKey) return;
  unsubscribeConversation();
  subscribedConversationContactId = subscriptionKey;
  const applyMessages = (messages) => {
      state = {
        ...state,
        contacts: state.contacts.map((contact) =>
          contact.id === activeContact.id
            ? {
                ...contact,
                messages,
                preview: messages.at(-1)?.deleted
                  ? 'This message was deleted'
                  : messages.at(-1)?.text ?? (contact.group ? getGroupMemberLabel(contact) : contact.email),
                time: messages.at(-1)?.time ?? contact.time
              }
            : contact
        )
      };
      if (!isTextEntryActive()) renderAll();
  };
  unsubscribeConversation = activeContact.groupId
    ? subscribeGroupMessages(activeContact.groupId, currentAuthUser.uid, applyMessages, showFirebaseError)
    : subscribeConversationMessages(currentAuthUser.uid, activeContact.uid, applyMessages, showFirebaseError);
}

function renderAll() {
  renderAuthGate();
  renderSignedInUser();
  if (!authReady) return;
  if (!currentAuthUser) return;
  if (chatsLoading && !hasSelectedChat()) {
    renderLoadingChats();
    return;
  }
  if (renderFamilyAccessGate()) return;
  if (restoreSelectedChatOnLoad && state.activeSection === 'chats' && hasSelectedChat()) {
    mobileConversationOpen = true;
    restoreSelectedChatOnLoad = false;
  }
  renderFriendsInvitesPanel();
  renderSettingsPanel();
  renderSection();
  renderChats();
  if (state.activeSection === 'chats' && !activeAction) {
    renderConversation();
    subscribeActiveConversation();
  }
}

async function hydrateChatsFromServer() {
  if (!authReady || currentAuthUser) return;
  const serverState = await loadServerChatState();
  if (!Array.isArray(serverState.contacts) || !serverState.contacts.length) return;
  const serverSnapshot = stringifyChatPayload({
    activeContactId: serverState.activeContactId,
    deletedContactIds: serverState.deletedContactIds ?? [],
    contacts: serverState.contacts
  });
  if (serverSnapshot === lastChatSnapshot) return;

  const syncedState = createInitialState(serverState);
  state = {
    ...state,
    activeContactId: syncedState.contacts.some((contact) => contact.id === state.activeContactId)
      ? state.activeContactId
      : syncedState.activeContactId,
    deletedContactIds: syncedState.deletedContactIds,
    contacts: syncedState.contacts
  };
  rememberChatSnapshot({
    activeContactId: syncedState.activeContactId,
    deletedContactIds: syncedState.deletedContactIds,
    contacts: syncedState.contacts
  });
  try {
    saveLocalChatState(getPersistedChatPayload());
  } catch {
    // Browser storage can be unavailable in incognito.
  }
  if (activeAction === 'newChat') return;
  if (isTextEntryActive()) return;
  renderAll();
}

function startLiveChatSync() {
  window.setInterval(() => {
    if (isSavingChats) return;
    hydrateChatsFromServer();
  }, syncIntervalMs);
}

function showToast(text) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 1800);
}

function explainFirebaseError(error) {
  const message = error?.message ?? '';
  if (error?.code === 'permission-denied' || message.includes('Missing or insufficient permissions')) {
    return 'Firebase rules need publishing, or this account is not approved yet.';
  }
  if (error?.code === 'failed-precondition' || message.toLowerCase().includes('index')) {
    return 'Firebase needs a small index for this list. Ask a parent to open the Firebase link.';
  }
  return message || 'Something went wrong. Please try again.';
}

function showFirebaseError(error) {
  showToast(explainFirebaseError(error));
}

function closeContactMenu() {
  activeContactMenuId = null;
  document.querySelector('.contact-context-menu')?.remove();
}

function closeMessageMenu() {
  activeMessageMenu = null;
  document.querySelector('.message-context-menu')?.remove();
}

function getContactById(contactId) {
  return state.contacts.find((contact) => contact.id === contactId);
}

function getMessageById(contactId, messageId) {
  return getContactById(contactId)?.messages.find((message) => message.id === messageId);
}

function showContactMenu(contactId, anchor = {}) {
  const contact = getContactById(contactId);
  if (!contact) return;
  closeContactMenu();
  closeMessageMenu();
  activeContactMenuId = contactId;
  const isGroup = Boolean(contact.groupId);
  const canManageGroup = isGroup && contact.createdBy === currentAuthUser?.uid;
  const safeContactId = escapeAttribute(contact.id);
  const contactDetail = isGroup ? getGroupMemberLabel(contact) : getContactEmail(contact) || contact.phone || 'No contact detail saved';

  const menu = document.createElement('div');
  menu.className = 'contact-context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <strong>${escapeHtml(contact.name)}</strong>
    <small>${escapeHtml(contactDetail)}</small>
    <small class="verified-contact-note">${isGroup ? 'Saved in your family chat database' : 'Google sign-in keeps names real'}</small>
    ${isGroup ? '<button type="button" data-contact-menu-action="edit-group" data-contact-id="' + safeContactId + '">Edit group name</button>' : ''}
    ${canManageGroup
      ? '<button type="button" class="danger-row" data-contact-menu-action="delete-group" data-contact-id="' + safeContactId + '">Delete group</button>'
      : '<button type="button" class="danger-row" data-contact-menu-action="delete-contact" data-contact-id="' + safeContactId + '">' + (isGroup ? 'Remove group shortcut' : 'Remove chat shortcut') + '</button>'}
  `;
  document.body.append(menu);

  const rect = menu.getBoundingClientRect();
  const left = Math.min(anchor.x ?? window.innerWidth / 2, window.innerWidth - rect.width - 12);
  const top = Math.min(anchor.y ?? window.innerHeight / 2, window.innerHeight - rect.height - 12);
  menu.style.left = `${Math.max(12, left)}px`;
  menu.style.top = `${Math.max(12, top)}px`;
}

function showEditGroupDialog(contactId) {
  const contact = getContactById(contactId);
  if (!contact?.groupId) return;
  closeContactMenu();
  const existing = document.querySelector('.action-dialog-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'action-dialog-backdrop';
  backdrop.innerHTML = `
    <section class="action-dialog menu-dialog" role="dialog" aria-label="Edit group">
      <button class="dialog-close" aria-label="Close">x</button>
      <form class="business-profile-form dialog-form" id="editGroupForm" data-group-id="${escapeAttribute(contact.groupId)}">
        <h2>Edit group</h2>
        <p>Change the group name. Members stay the same.</p>
        <div class="business-fields">
          <label class="profile-field">
            <span>Group name</span>
            <input name="groupName" type="text" autocomplete="off" maxlength="40" value="${escapeAttribute(contact.name)}" required />
          </label>
        </div>
        <button class="detail-action" type="submit">Save group</button>
      </form>
    </section>
  `;
  document.body.append(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('.dialog-close')) {
      backdrop.remove();
    }
  });
  const input = backdrop.querySelector('input[name="groupName"]');
  input?.focus();
  input?.select();
}

function showMessageMenu(contactId, messageId, anchor = {}) {
  const message = getMessageById(contactId, messageId);
  if (!message) return;
  closeMessageMenu();
  closeContactMenu();
  activeMessageMenu = { contactId, messageId };

  const menu = document.createElement('div');
  menu.className = 'message-context-menu contact-context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <button type="button" data-message-menu-action="edit" data-contact-id="${contactId}" data-message-id="${messageId}">Edit message</button>
    <button type="button" class="danger-row" data-message-menu-action="delete" data-contact-id="${contactId}" data-message-id="${messageId}">Delete message</button>
  `;
  document.body.append(menu);

  const rect = menu.getBoundingClientRect();
  const left = Math.min(anchor.x ?? window.innerWidth / 2, window.innerWidth - rect.width - 12);
  const top = Math.min(anchor.y ?? window.innerHeight / 2, window.innerHeight - rect.height - 12);
  menu.style.left = `${Math.max(12, left)}px`;
  menu.style.top = `${Math.max(12, top)}px`;
}

function showEditMessageDialog(contactId, messageId) {
  const message = getMessageById(contactId, messageId);
  if (!message) return;
  closeMessageMenu();
  const existing = document.querySelector('.action-dialog-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'action-dialog-backdrop';
  backdrop.innerHTML = `
    <section class="action-dialog menu-dialog" role="dialog" aria-label="Edit message">
      <button class="dialog-close" aria-label="Close">x</button>
      <form class="business-profile-form dialog-form" id="editMessageForm" data-contact-id="${contactId}" data-message-id="${messageId}">
        <h2>Edit message</h2>
        <p>Change this message text.</p>
        <div class="business-fields">
          <label class="profile-field">
            <span>Message</span>
            <textarea name="message" rows="4" autocomplete="off" required>${escapeHtml(message.deleted ? '' : message.text)}</textarea>
          </label>
        </div>
        <button class="detail-action" type="submit">Save message</button>
      </form>
    </section>
  `;
  document.body.append(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('.dialog-close')) {
      backdrop.remove();
    }
  });
  const input = backdrop.querySelector('textarea[name="message"]');
  input?.focus();
  input?.select();
}

function showActionDialog(view) {
  const existing = document.querySelector('.action-dialog-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'action-dialog-backdrop';
  if (view.discoverItems) {
    backdrop.innerHTML = `
      <section class="action-dialog menu-dialog" role="dialog" aria-label="${view.title}">
        <button class="dialog-close" aria-label="Close">x</button>
        <h2>${view.title}</h2>
        <p>${view.body}</p>
        <div class="discover-list">
          ${view.discoverItems
            .map(
              (item) => `
                <button class="discover-item" data-discover-channel="${item.name}">
                  ${renderAvatar(item.avatar, item.color, 'channel-avatar')}
                  <span>
                    <strong>${item.name}</strong>
                    <small>${item.category} · ${item.followers}</small>
                  </span>
                  <span class="follow-button">Follow</span>
                </button>
              `
            )
            .join('')}
        </div>
      </section>
    `;
  } else if (view.menuItems) {
    backdrop.innerHTML = `
      <section class="action-dialog menu-dialog" role="dialog" aria-label="${view.title}">
        <button class="dialog-close" aria-label="Close">x</button>
        <h2>${view.title}</h2>
        <div class="chat-menu-list">
          ${view.menuItems
            .map(
              (item) => `
                <button class="menu-option ${item.danger ? 'danger-row' : ''}" data-menu-option="${item.label}">
                  <span>
                    <strong>${item.label}</strong>
                    <small>${item.detail}</small>
                  </span>
                  <span class="chevron">›</span>
                </button>
              `
            )
            .join('')}
        </div>
      </section>
    `;
  } else if (view.communityExamples) {
    backdrop.innerHTML = `
      <section class="action-dialog menu-dialog" role="dialog" aria-label="${view.title}">
        <button class="dialog-close" aria-label="Close">x</button>
        <h2>${view.title}</h2>
        <p>${view.body}</p>
        <div class="community-example-list">
          ${view.communityExamples
            .map(
              (item) => `
                <button class="community-example-card" data-community-example="${item.name}">
                  <span class="community-example-avatar" style="background:${item.color}">${item.name[0]}</span>
                  <span>
                    <strong>${item.name}</strong>
                    <small>${item.groups}</small>
                    <small>${item.members}</small>
                  </span>
                  <span class="follow-button">View</span>
                </button>
              `
            )
            .join('')}
        </div>
      </section>
    `;
  } else if (view.form === 'newChat') {
    backdrop.innerHTML = `
      <section class="action-dialog menu-dialog" role="dialog" aria-label="${view.title}">
        <button class="dialog-close" aria-label="Close">x</button>
        <div class="business-profile-form dialog-form">
          <div class="detail-illustration"></div>
          <h2>${view.title}</h2>
          <p>Use Friends & Invites to pick approved friends or send a Gmail invite.</p>
          <button class="detail-action" type="button" data-jump-section="friends">Open Friends & Invites</button>
        </div>
      </section>
    `;
  } else if (view.form === 'createGroup') {
    backdrop.innerHTML = `
      <section class="action-dialog menu-dialog" role="dialog" aria-label="${view.title}">
        <button class="dialog-close" aria-label="Close">x</button>
        ${renderCreateGroupForm()}
      </section>
    `;
  } else {
  const primaryAttribute = view.finalAction ? `data-final-action="${view.finalAction}"` : `data-action-toast="${view.title}"`;
  backdrop.innerHTML = `
    <section class="action-dialog" role="dialog" aria-label="${view.title}">
      <button class="dialog-close" aria-label="Close">x</button>
      <div class="detail-illustration"></div>
      <h2>${view.title}</h2>
      <p>${view.body}</p>
      <div class="detail-list">
        ${view.points.map((point) => `<span>${point}</span>`).join('')}
      </div>
      <button class="detail-action" ${primaryAttribute}>${view.primaryAction}</button>
    </section>
  `;
  }
  document.body.append(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('.dialog-close')) {
      backdrop.remove();
    }
  });
}

function showSettingChoiceDialog(choiceView) {
  const existing = document.querySelector('.action-dialog-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'action-dialog-backdrop';
  backdrop.innerHTML = `
    <section class="action-dialog menu-dialog" role="dialog" aria-label="${choiceView.title}">
      <button class="dialog-close" aria-label="Close">x</button>
      <h2>${choiceView.title}</h2>
      <p>${choiceView.body}</p>
      <div class="choice-list">
        ${choiceView.options
          .map((option) => `<button class="choice-option" data-setting-choice="${option}" data-setting-choice-title="${choiceView.title}">${option}</button>`)
          .join('')}
      </div>
    </section>
  `;
  document.body.append(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('.dialog-close')) {
      backdrop.remove();
    }
  });
}

function openAction(actionId) {
  if (actionId === 'newChat') {
    activeAction = null;
    activeSettingsPage = null;
    mobileConversationOpen = false;
    state = switchSection(state, 'friends');
    renderAll();
    showToast('Friends & Invites opened');
    return;
  }
  activeAction = actionId;
  renderAll();
  const view = getActionView(actionId);
  if (window.matchMedia('(max-width: 850px)').matches) {
    showActionDialog(view);
  } else {
    showToast(`${view.title} opened`);
  }
}

chatList.addEventListener('click', (event) => {
  const menuTrigger = event.target.closest('[data-contact-menu]');
  if (menuTrigger) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = menuTrigger.getBoundingClientRect();
    showContactMenu(menuTrigger.dataset.contactMenu, {
      x: bounds.left + 20,
      y: bounds.bottom + 6
    });
    return;
  }

  const item = event.target.closest('[data-contact-open], [data-contact-id]');
  if (!item) return;
  closeContactMenu();
  activeAction = null;
  mobileConversationOpen = true;
  state = selectContact(state, item.dataset.contactOpen ?? item.dataset.contactId);
  saveChatState();
  renderAll();
});

chatList.addEventListener('contextmenu', (event) => {
  const item = event.target.closest('[data-contact-id]');
  if (!item) return;
  event.preventDefault();
  showContactMenu(item.dataset.contactId, {
    x: event.clientX,
    y: event.clientY
  });
});

searchInput.addEventListener('input', renderChats);

filters.forEach((filter) => {
  filter.addEventListener('click', () => {
    currentFilter = filter.dataset.filter;
    filters.forEach((button) => button.classList.toggle('active', button === filter));
    renderChats();
  });
});

railButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeAction = null;
    activeSettingsPage = null;
    mobileConversationOpen = false;
    state = switchSection(state, button.dataset.section);
    renderAll();
  });
});

document.querySelectorAll('[data-notice]').forEach((notice) => {
  notice.querySelector('button').addEventListener('click', () => notice.remove());
});

document.querySelectorAll('[data-jump-section]').forEach((button) => {
  button.addEventListener('click', () => {
    activeAction = null;
    activeSettingsPage = null;
    state = switchSection(state, button.dataset.jumpSection);
    renderAll();
  });
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-settings-dismiss]')) return;

  if (event.target.closest('[data-auth-sign-in]')) {
    signInWithGoogle().catch((error) => {
      authError = error.message;
      renderAuthGate();
    });
    return;
  }

  if (event.target.closest('[data-open-profile]')) {
    openKidProfilePage();
    return;
  }

  if (event.target.closest('[data-auth-logout]')) {
    handleGoogleLogout();
    return;
  }

  const approveFamilyButton = event.target.closest('[data-approve-family-user]');
  if (approveFamilyButton) {
    approveFamilyMember(approveFamilyButton.dataset.approveFamilyUser, currentAuthUser)
      .then(() => showToast('Family member approved'))
      .catch(showFirebaseError);
    return;
  }

  const authUserButton = event.target.closest('[data-auth-user-id]');
  if (authUserButton) {
    const selectedUser = authenticatedUsers.find((user) => user.uid === authUserButton.dataset.authUserId);
    if (selectedUser) {
      activeAction = null;
      activeSettingsPage = null;
      mobileConversationOpen = true;
      state = createAuthenticatedContact(state, selectedUser);
      saveChatState();
      document.querySelector('.action-dialog-backdrop')?.remove();
      renderAll();
      showToast(`Chat opened with ${getUserName(selectedUser)}`);
    }
    return;
  }

  const contactMenuAction = event.target.closest('[data-contact-menu-action]');
  if (contactMenuAction) {
    const contactId = contactMenuAction.dataset.contactId;
    const contact = getContactById(contactId);
    const action = contactMenuAction.dataset.contactMenuAction;
    if (action === 'edit-group') {
      showEditGroupDialog(contactId);
      return;
    }
    if (action === 'delete-group') {
      if (!contact?.groupId) return;
      deleteFirebaseGroup(contact.groupId, currentAuthUser)
        .then(() => {
          firebaseGroups = firebaseGroups.filter((group) => group.id !== contact.groupId);
          state = deleteContactChat(state, contactId);
          state = reconcileAuthenticatedContacts(state, authenticatedUsers, currentAuthUser.uid, firebaseGroups);
          closeContactMenu();
          saveChatState();
          renderAll();
          showToast('Group deleted');
        })
        .catch(showFirebaseError);
      return;
    }
    state = deleteContactChat(state, contactId);
    closeContactMenu();
    saveChatState();
    renderAll();
    showToast('Chat shortcut removed');
    return;
  }

  const messageMenuAction = event.target.closest('[data-message-menu-action]');
  if (messageMenuAction) {
    const contactId = messageMenuAction.dataset.contactId;
    const messageId = messageMenuAction.dataset.messageId;
    if (messageMenuAction.dataset.messageMenuAction === 'edit') {
      showEditMessageDialog(contactId, messageId);
      return;
    }
    state = deleteMessage(state, contactId, messageId);
    closeMessageMenu();
    saveChatState();
    renderAll();
    showToast('Message deleted');
    return;
  }

  if (activeContactMenuId && !event.target.closest('.contact-context-menu')) {
    closeContactMenu();
  }
  if (activeMessageMenu && !event.target.closest('.message-context-menu')) {
    closeMessageMenu();
  }

  const settingChoice = event.target.closest('[data-setting-choice]');
  if (settingChoice) {
    showToast(`${settingChoice.dataset.settingChoiceTitle}: ${settingChoice.dataset.settingChoice}`);
    settingChoice.closest('.action-dialog-backdrop')?.remove();
    return;
  }

  const menuOption = event.target.closest('[data-menu-option]');
  if (menuOption) {
    showToast(`${menuOption.dataset.menuOption} selected`);
    return;
  }

  const toastButton = event.target.closest('[data-action-toast]');
  if (toastButton) {
    showToast(`${toastButton.dataset.actionToast} selected`);
    return;
  }

  const finalActionButton = event.target.closest('[data-final-action]');
  if (finalActionButton) {
    const finalAction = finalActionButton.dataset.finalAction;
    finalActionButton.closest('.action-dialog-backdrop')?.remove();
    if (finalAction === 'logout') {
      handleGoogleLogout();
      return;
    }
    showToast(`${finalActionButton.textContent.trim()} confirmed`);
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  if (actionTarget.closest('[data-notice]') && event.target.tagName === 'BUTTON') return;
  if (actionTarget.closest('.settings-notice')) {
    activeSettingsPage = 'chooseNotifications';
    activeAction = null;
    renderAll();
    return;
  }
  openAction(actionTarget.dataset.action);
});

document.addEventListener('click', (event) => {
  const dismiss = event.target.closest('[data-settings-dismiss]');
  if (dismiss) {
    dismiss.closest('.settings-notice')?.remove();
    return;
  }

  const jumpButton = event.target.closest('[data-jump-section]');
  if (jumpButton) {
    activeAction = null;
    activeSettingsPage = null;
    mobileConversationOpen = false;
    state = switchSection(state, jumpButton.dataset.jumpSection);
    renderAll();
    return;
  }

  const pageButton = event.target.closest('[data-settings-page]');
  if (pageButton) {
    activeSettingsPage = pageButton.dataset.settingsPage;
    activeAction = null;
    renderAll();
    return;
  }

  if (event.target.closest('[data-settings-back]')) {
    activeSettingsPage = null;
    renderAll();
    return;
  }

  const settingItem = event.target.closest('[data-setting-item]');
  if (!settingItem) return;
  const type = settingItem.dataset.settingType;
  const label = settingItem.dataset.settingLabel;
  if (type === 'toggle') {
    const key = settingItem.dataset.settingItem;
    const current = settingItem.querySelector('.switch')?.classList.contains('on') ?? false;
    settingSwitches.set(key, !current);
    renderAll();
    showToast(`${label} ${!current ? 'on' : 'off'}`);
    return;
  }
  if (type === 'danger') {
    showActionDialog(getSettingDangerView(label));
    return;
  }
  showSettingChoiceDialog(getSettingOptionView(label));
});

document.addEventListener('input', (event) => {
  const settingsInput = event.target.closest('#settingsSearchInput');
  if (!settingsInput) return;

  settingsSearchQuery = settingsInput.value;
  const settingsScroll = document.querySelector('.settings-scroll');
  if (settingsScroll) {
    settingsScroll.innerHTML = renderSettingsScrollableContent();
  } else {
    renderSettingsPanel();
  }
});

document.addEventListener('input', (event) => {
  const friendSearchInput = event.target.closest('#friendSearchInput');
  if (friendSearchInput) {
    friendSearchQuery = friendSearchInput.value;
    const results = document.querySelector('.friend-search-results');
    if (results) results.innerHTML = renderFriendSearchRows('Ask your friend to sign in once.');
  }
});

document.addEventListener('change', (event) => {
  const groupMemberInput = event.target.closest('[data-group-member]');
  if (!groupMemberInput) return;
  if (groupMemberInput.checked) {
    selectedGroupMemberIds.add(groupMemberInput.value);
  } else {
    selectedGroupMemberIds.delete(groupMemberInput.value);
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-open-profile]')) {
    event.preventDefault();
    openKidProfilePage();
    return;
  }
  if (event.key === 'Escape') {
    closeContactMenu();
    closeMessageMenu();
  }
});

document.addEventListener('submit', (event) => {
  const familyInviteForm = event.target.closest('[data-family-invite-form]');
  if (familyInviteForm) {
    event.preventDefault();
    const formData = new FormData(familyInviteForm);
    const email = String(formData.get('email') ?? '');
    sendFamilyInvite(email, currentAuthUser)
      .then(() => {
        familyInviteForm.reset();
        showToast('Invite saved. Ask them to sign in once.');
      })
      .catch(showFirebaseError);
    return;
  }

  const createGroupForm = event.target.closest('#createGroupForm');
  if (createGroupForm) {
    event.preventDefault();
    if (!requireAuth()) return;
    const formData = new FormData(createGroupForm);
    const groupName = String(formData.get('groupName') ?? '');
    const allowedMemberIds = new Set(getGroupCandidateUsers().map((user) => user.uid));
    const requestedMemberUids = [...createGroupForm.querySelectorAll('[data-group-member]:checked')]
      .map((item) => item.value);
    const memberUids = requestedMemberUids.filter((uid) => allowedMemberIds.has(uid));
    selectedGroupMemberIds = new Set(memberUids);
    if (memberUids.length !== requestedMemberUids.length) {
      showToast('Choose friends from the signed-in list.');
      return;
    }
    if (selectedGroupMemberIds.size < 1) {
      showToast('Choose at least 1 friend.');
      return;
    }
    createFirebaseGroup({ groupName, memberUids }, currentAuthUser)
      .then((group) => {
        firebaseGroups = [group, ...firebaseGroups.filter((item) => item.id !== group.id)];
        state = reconcileAuthenticatedContacts(state, authenticatedUsers, currentAuthUser.uid, firebaseGroups);
        state = selectContact(state, group.id);
        selectedGroupMemberIds = new Set();
        activeAction = null;
        currentFilter = 'groups';
        filters.forEach((button) => button.classList.toggle('active', button.dataset.filter === 'groups'));
        mobileConversationOpen = true;
        createGroupForm.closest('.action-dialog-backdrop')?.remove();
        saveChatState();
        renderAll();
        showToast('Group created');
      })
      .catch(showFirebaseError);
    return;
  }

  const editGroupForm = event.target.closest('#editGroupForm');
  if (editGroupForm) {
    event.preventDefault();
    const formData = new FormData(editGroupForm);
    const groupName = String(formData.get('groupName') ?? '');
    const groupId = editGroupForm.dataset.groupId;
    updateFirebaseGroupName(groupId, groupName, currentAuthUser)
      .then((group) => {
        firebaseGroups = firebaseGroups.map((item) => (item.id === group.id ? { ...item, ...group } : item));
        state = reconcileAuthenticatedContacts(state, authenticatedUsers, currentAuthUser.uid, firebaseGroups);
        state = selectContact(state, group.id);
        editGroupForm.closest('.action-dialog-backdrop')?.remove();
        saveChatState();
        renderAll();
        showToast('Group saved');
      })
      .catch(showFirebaseError);
    return;
  }

  const editMessageForm = event.target.closest('#editMessageForm');
  if (editMessageForm) {
    event.preventDefault();
    const formData = new FormData(editMessageForm);
    const message = String(formData.get('message') ?? '');
    if (!message.trim()) {
      showToast('Enter a message');
      return;
    }
    state = updateMessage(
      state,
      editMessageForm.dataset.contactId,
      editMessageForm.dataset.messageId,
      message
    );
    saveChatState();
    editMessageForm.closest('.action-dialog-backdrop')?.remove();
    renderAll();
    showToast('Message saved');
    return;
  }

  const form = event.target.closest('#profileForm');
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    profileValues[key] = String(value);
  }
  const email = typeof profileValues.Email === 'string' ? profileValues.Email.trim() : '';
  if (email && !email.includes('@')) {
    showToast('Enter a valid email address');
    return;
  }
  saveProfileValues();
  showToast('Profile saved');
  renderAll();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-mobile-chat-back]')) return;
  mobileConversationOpen = false;
  activeAction = null;
  renderAll();
});

function updateCurrentPresence(onlineStatus) {
  if (!currentAuthUser) return;
  const nextStatus = getPresenceStatusClass(onlineStatus);
  if (currentPresenceStatus === nextStatus) return;
  currentPresenceStatus = nextStatus;
  setUserOnlineStatus(currentAuthUser, nextStatus).catch(showFirebaseError);
  renderSignedInUser();
}

function areApprovedChatListsReady() {
  return approvedUsersLoaded && userGroupsLoaded;
}

function resetApprovedChatLoadingState() {
  approvedUsersLoaded = false;
  userGroupsLoaded = false;
}

function syncApprovedFamilyContacts(user) {
  const activeContactIdBeforeSync = state.activeContactId;
  const previousGroupContacts = state.contacts.filter(isFirestoreGroupContact);
  state = reconcileAuthenticatedContacts(state, authenticatedUsers, user.uid, firebaseGroups);
  if (!userGroupsLoaded && previousGroupContacts.length) {
    const existingIds = new Set(state.contacts.map((contact) => contact.id));
    state = {
      ...state,
      contacts: [
        ...state.contacts,
        ...previousGroupContacts.filter((contact) => !existingIds.has(contact.id))
      ]
    };
  }
  if (
    !areApprovedChatListsReady() &&
    activeContactIdBeforeSync &&
    !state.contacts.some((contact) => contact.id === activeContactIdBeforeSync)
  ) {
    state = { ...state, activeContactId: activeContactIdBeforeSync };
  }
  chatsLoading = !areApprovedChatListsReady();
  saveChatState();
  renderAll();
}

function startApprovedFamilyLists(user) {
  if (familyListsStarted) return;
  familyListsStarted = true;
  resetApprovedChatLoadingState();
  chatsLoading = true;
  unsubscribeUsers = subscribeAuthenticatedUsers(
    (users) => {
      approvedUsersLoaded = true;
      authenticatedUsers = users;
      syncApprovedFamilyContacts(user);
    },
    (error) => {
      chatsLoading = false;
      showFirebaseError(error);
      renderAll();
    }
  );
  unsubscribeGroups = subscribeUserGroups(
    user.uid,
    (groups) => {
      userGroupsLoaded = true;
      firebaseGroups = groups;
      syncApprovedFamilyContacts(user);
    },
    (error) => {
      chatsLoading = false;
      showFirebaseError(error);
      renderAll();
    }
  );
  if (isFamilyOwnerEmail(user.email)) {
    unsubscribePendingFamilyUsers = subscribePendingFamilyUsers(
      (users) => {
        pendingFamilyUsers = users.filter((item) => item.uid !== user.uid);
        renderAll();
      },
      showFirebaseError
    );
    unsubscribeFamilyInvites = subscribeFamilyInvites(
      (invites) => {
        pendingFamilyInvites = invites;
        renderAll();
      },
      showFirebaseError
    );
  }
}

document.addEventListener('visibilitychange', () => {
  updateCurrentPresence(document.hidden ? 'away' : 'online');
});

window.addEventListener('beforeunload', () => {
  if (currentAuthUser) {
    setUserOnlineStatus(currentAuthUser, 'offline');
  }
});

function startFirebaseAuth() {
  startAuthListener(
    async (user) => {
      authReady = true;
      authError = '';
      currentAuthUser = user;
      chatsLoading = Boolean(user);
      unsubscribeUsers();
      unsubscribeCurrentUserProfile();
      unsubscribePendingFamilyUsers();
      unsubscribeFamilyInvites();
      unsubscribeConversation();
      unsubscribeGroups();
      familyListsStarted = false;
      resetApprovedChatLoadingState();
      subscribedConversationContactId = '';
      if (!user) {
        authenticatedUsers = [];
        firebaseGroups = [];
        pendingFamilyUsers = [];
        pendingFamilyInvites = [];
        currentUserProfile = null;
        friendSearchQuery = '';
        selectedGroupMemberIds = new Set();
        currentPresenceStatus = '';
        restoreSelectedChatOnLoad = Boolean(state.activeContactId);
        chatsLoading = false;
        renderAll();
        return;
      }

      await saveUserProfile(user).catch((error) => {
        authError = error.message;
        chatsLoading = false;
      });
      currentPresenceStatus = '';
      updateCurrentPresence(document.hidden ? 'away' : 'online');
      unsubscribeCurrentUserProfile = subscribeCurrentUserProfile(
        user.uid,
        (profile) => {
          currentUserProfile = profile;
          if (isCurrentUserApproved()) {
            startApprovedFamilyLists(user);
          } else {
            authenticatedUsers = [];
            firebaseGroups = [];
            pendingFamilyUsers = [];
            pendingFamilyInvites = [];
            state = reconcileAuthenticatedContacts(state, [], user.uid, []);
            resetApprovedChatLoadingState();
            chatsLoading = false;
          }
          renderAll();
        },
        (error) => {
          resetApprovedChatLoadingState();
          chatsLoading = false;
          showFirebaseError(error);
          renderAll();
        }
      );
      renderAll();
    },
    (error) => {
      authReady = true;
      authError = error.message;
      currentAuthUser = null;
      resetApprovedChatLoadingState();
      chatsLoading = false;
      renderAll();
    }
  );
}

renderAll();
startFirebaseAuth();
hydrateChatsFromServer();
startLiveChatSync();
