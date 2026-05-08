import {
  createAuthenticatedContact,
  createInitialState,
  deleteContactChat,
  deleteMessage,
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
  toggleChannelFollow,
  updateContactChat,
  updateMessage
} from './chat-store.js';
import {
  getFirebaseSetupStatus,
  logoutGoogleUser,
  saveUserProfile,
  sendFirebaseMessage,
  signInWithGoogle,
  startAuthListener,
  subscribeAuthenticatedUsers,
  subscribeUserByEmail,
  subscribeConversationMessages
} from './firebase-chat.js';

const savedChatStorageKey = 'chatapp.savedChats.v1';
const clientIdStorageKey = 'chatapp.clientId.v1';
const newChatDraftStorageKey = 'chatapp.newChatDraft.v1';
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

function getPersistedChatPayload() {
  return {
    activeContactId: state.activeContactId,
    deletedContactIds: state.deletedContactIds ?? [],
    contacts: state.contacts
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

function loadNewChatDraft() {
  try {
    const saved = window.localStorage.getItem(newChatDraftStorageKey);
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      email: typeof parsed.email === 'string' ? parsed.email : ''
    };
  } catch {
    return { name: '', phone: '', email: '' };
  }
}

function saveNewChatDraft() {
  try {
    window.localStorage.setItem(newChatDraftStorageKey, JSON.stringify(newChatDraft));
  } catch {
    // Browser storage can be unavailable in incognito.
  }
}

function clearNewChatDraft() {
  newChatDraft.name = '';
  newChatDraft.phone = '';
  newChatDraft.email = '';
  try {
    window.localStorage.removeItem(newChatDraftStorageKey);
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
  if (currentAuthUser) return;
  isSavingChats = true;
  saveServerChatState(payload)
    .catch(() => showToast('Could not save chat on this browser'))
    .finally(() => {
      isSavingChats = false;
    });
}

const currentClientId = getClientId();
let state = createInitialState(loadSavedChatState());
rememberChatSnapshot();
let currentFilter = 'all';
let activeAction = null;
let activeSettingsPage = null;
let activeContactMenuId = null;
let activeMessageMenu = null;
let currentAuthUser = null;
let authReady = false;
let authError = '';
let authenticatedUsers = [];
let friendSearchResults = [];
let unsubscribeUsers = () => {};
let unsubscribeFriendSearch = () => {};
let unsubscribeConversation = () => {};
let subscribedConversationContactId = '';
let settingsSearchQuery = '';
let friendSearchQuery = '';
let isLoggedOut = false;
let mobileConversationOpen = false;
const settingSwitches = new Map();
const profileValues = {
  Name: 'Aadhish Mahendran',
  Email: '',
  Password: '',
  About: 'Available'
};
const businessProfileValues = {
  'Business name': 'Sangavi Store',
  Username: '',
  Password: '',
  Website: ''
};
const createdChannelValues = {
  'Channel name': '',
  Description: ''
};
const statusValues = {
  'Status text': '',
  'Background color': 'Green'
};
const newChatDraft = loadNewChatDraft();

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
  const avatar = renderAvatar(
    contact.avatar,
    contact.color,
    extraClass,
    contact.textColor ?? '#ffffff'
  );
  if (!getContactEmail(contact)) return avatar;
  return `<span class="contact-avatar-wrap">${avatar}<span class="gmail-badge">G</span></span>`;
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
  return user?.displayName || user?.email || 'Google user';
}

function getUserAvatar(user) {
  return initials(getUserName(user)) || 'GU';
}

function renderUserPhoto(user, extraClass = '') {
  if (user?.photoURL) {
    return `<img class="avatar ${extraClass}" src="${escapeAttribute(user.photoURL)}" alt="" />`;
  }
  return renderAvatar(getUserAvatar(user), '#cbd6dc', extraClass, '#42545d');
}

function renderAuthGate() {
  const configured = getFirebaseSetupStatus().configured;
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
      <p>A bright, safe place to chat with friends after Google sign-in.</p>
      ${authError ? `<small class="auth-error">${authError}</small>` : ''}
      ${configured
        ? '<button class="google-sign-in" type="button" data-auth-sign-in>Sign in with Google</button>'
        : '<small class="auth-error">Firebase is not configured yet. Add your project keys in src/firebase-config.js.</small>'}
    </div>
  `;
}

function renderSignedInUser() {
  if (!signedInUser) return;
  if (!currentAuthUser) {
    signedInUser.innerHTML = '';
    signedInUser.classList.add('hidden');
    return;
  }
  signedInUser.classList.remove('hidden');
  signedInUser.innerHTML = `
    <span class="signed-in-avatar">${escapeHtml(getUserAvatar(currentAuthUser))}</span>
    <span>
      <strong>${escapeHtml(getUserName(currentAuthUser))}</strong>
      <small>${escapeHtml(currentAuthUser?.email ?? '')}</small>
    </span>
  `;
}

function requireAuth() {
  if (currentAuthUser) return true;
  showToast('Sign in with Google first');
  renderAuthGate();
  return false;
}

function renderDetailView(view, type = 'action') {
  if (view.form === 'newChat') {
    renderAuthenticatedUserList(view);
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

function renderLoggedOutState() {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="settings-illustration"></div>
    <h2>Logged out</h2>
    <p>You logged out from this computer.</p>
    <button class="detail-action" data-login-again>Log in again</button>
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

function disabledStatusComposer(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <form class="business-profile-form status-compose-form" id="createStatusForm">
      <div class="status-preview-card">${statusValues['Status text'] || 'Type a status'}</div>
      <h2>${view.title}</h2>
      <p>Write a text status for your contacts. It disappears after 24 hours.</p>
      <div class="business-fields">
        ${view.fields
          .map((field) => {
            const value = statusValues[field.name] ?? field.value ?? '';
            return `
              <label class="profile-field">
                <span>${field.name}</span>
                <input name="${field.name}" type="${field.type}" value="${value}" autocomplete="off" placeholder="${field.name === 'Status text' ? 'What is happening?' : 'Green'}" required />
              </label>
            `;
          })
          .join('')}
      </div>
      <button class="detail-action" type="submit">Post status</button>
    </form>
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

function disabledChannelComposer(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <form class="business-profile-form" id="createChannelForm">
      <div class="channels-illustration"></div>
      <h2>${view.title}</h2>
      <p>Create a channel for updates, announcements, or your favorite topic.</p>
      <div class="business-fields">
        ${view.fields
          .map((field) => {
            const value = createdChannelValues[field.name] ?? field.value ?? '';
            return `
              <label class="profile-field">
                <span>${field.name}</span>
                <input name="${field.name}" type="${field.type}" value="${value}" autocomplete="off" placeholder="${field.name === 'Channel name' ? 'My updates' : 'What is this channel about?'}" required />
              </label>
            `;
          })
          .join('')}
      </div>
      <button class="detail-action" type="submit">Create channel</button>
    </form>
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

function renderAuthenticatedUserRows(emptyMessage) {
  const users = authenticatedUsers.filter((user) => user.uid !== currentAuthUser?.uid);
  return users.length
    ? users.map((user) => `
        <button class="auth-user-row" type="button" data-auth-user-id="${user.uid}">
          ${renderUserPhoto(user, 'small')}
          <span><strong>${escapeHtml(getUserName(user))}</strong><small>${escapeHtml(user.email ?? '')}</small></span>
        </button>
      `).join('')
    : `<p class="empty-copy">${emptyMessage}</p>`;
}

function renderFriendSearchRows() {
  const query = friendSearchQuery.trim();
  if (!query) return '<p class="empty-copy">Type your friend Gmail to find them.</p>';
  const users = friendSearchResults.filter((user) => user.uid !== currentAuthUser?.uid);
  if (!users.length) return '<p class="empty-copy">Friend not found. Ask them to sign in first.</p>';
  return users.map((user) => `
    <button class="auth-user-row" type="button" data-auth-user-id="${user.uid}">
      ${renderUserPhoto(user, 'small')}
      <span><strong>${escapeHtml(getUserName(user))}</strong><small>${escapeHtml(user.email ?? '')}</small></span>
    </button>
  `).join('');
}

function renderAuthenticatedUserList(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <div class="business-profile-form">
      <div class="detail-illustration"></div>
      <h2>${view.title}</h2>
      <p>Choose a Google signed-in user to start a chat. Names and emails come from Google only.</p>
      <label class="friend-search">
        <span>Find friend by Gmail</span>
        <input id="friendSearchInput" type="email" autocomplete="off" value="${escapeAttribute(friendSearchQuery)}" placeholder="friend@gmail.com" />
      </label>
      <div class="auth-user-list friend-search-results">
        ${renderFriendSearchRows()}
      </div>
      <div class="auth-user-list">
        ${renderAuthenticatedUserRows('No Google signed-in users were found yet. Ask your friend to sign in once, then they will appear here automatically.')}
      </div>
    </div>
  `;
}

function disabledProfileForm(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  const formTitle = view.form ? view.form : 'businessProfileForm';
  emptyState.innerHTML = `
    <form class="business-profile-form" id="businessToolForm" data-business-form="${formTitle}" data-business-title="${view.title}">
      <div class="detail-illustration"></div>
      <h2>${view.title}</h2>
      <p>${view.body}</p>
      <div class="business-fields">
        ${view.fields
          .map((field) => {
            const value = view.form ? field.value ?? '' : businessProfileValues[field.name] ?? field.value ?? '';
            return `
              <label class="profile-field">
                <span>${field.name}</span>
                <input name="${field.name}" type="${field.type}" value="${value}" autocomplete="${field.type === 'password' ? 'new-password' : 'off'}" />
              </label>
            `;
          })
          .join('')}
      </div>
      <button class="detail-action" type="submit">${view.primaryAction}</button>
    </form>
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
  return `
    <div class="nested-settings">
      <header class="nested-header">
        <button class="back-button" data-settings-back aria-label="Back">‹</button>
        <h2>${page.title}</h2>
      </header>
      <form class="profile-form" id="profileForm">
        <div class="profile-edit-photo">AM</div>
        ${page.items
          .map((item) => {
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
                <span>${item.label}</span>
                <input name="${item.label}" type="${inputType}" value="${value}" autocomplete="${item.type === 'password' ? 'new-password' : 'off'}" placeholder="${item.label === 'Email' ? 'example@gmail.com' : ''}" />
                <small>${item.detail}</small>
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
        <h2>No settings found</h2>
        <p>Try searching for chats, account, notifications, or logout.</p>
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
      <button class="profile-row" data-auth-logout>
        <span class="profile-photo">${escapeHtml(getUserAvatar(currentAuthUser))}</span>
        <strong>${escapeHtml(getUserName(currentAuthUser))}</strong>
      </button>
      <div class="settings-list">
        <button class="settings-row active" data-settings-page="account">
          <span class="line-icon key-icon"></span>
          <span><strong>Account</strong><small>Google login keeps names real</small></span>
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
          <span><strong>Log out of Google</strong><small>${escapeHtml(currentAuthUser?.email ?? '')}</small></span>
        </button>
      </div>
  `;
}

function renderLoggedOutPanel() {
  return `
    <div class="settings-logged-out">
      <div class="settings-illustration"></div>
      <h1>Logged out</h1>
      <p>You logged out from this computer.</p>
      <button class="detail-action" data-login-again>Log in again</button>
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

  chatList.innerHTML = contacts
    .map(
      (contact) => `
        <div class="chat-item ${contact.id === state.activeContactId ? 'active' : ''}" data-contact-id="${contact.id}">
          <button class="chat-main" type="button" data-contact-open="${contact.id}">
            ${renderContactAvatar(contact)}
            <span class="chat-copy" data-contact-menu="${contact.id}">
              <span class="chat-title-row">
                <span class="chat-name">${contact.name}</span>
                <span class="chat-time">${contact.time}</span>
              </span>
              <span class="chat-preview">${contact.deleted ? 'This message was deleted' : contact.preview}</span>
            </span>
            ${contact.unread ? `<span class="unread">${contact.unread}</span>` : '<span></span>'}
          </button>
        </div>
      `
    )
    .join('');
}

function renderConversation() {
  const contact = getActiveContact(state);
  if (!contact) {
    conversation.classList.add('hidden');
    emptyState.classList.remove('hidden');
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
        <small>online</small>
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
            const isRead = direction === 'out' && Boolean(contact.uid && readBy.includes(contact.uid));
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
  resizeComposer();
  conversation.querySelector('#composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireAuth()) return;
    const input = conversation.querySelector('#messageInput');
    const text = input.value;
    const activeContact = getActiveContact(state);
    if (!activeContact?.uid) {
      showToast('Choose a signed-in Google friend first.');
      return;
    }
    try {
      await sendFirebaseMessage(activeContact.uid, text, currentAuthUser);
    } catch (error) {
      showToast(error.message);
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
  if (!['chats', 'settings'].includes(state.activeSection)) {
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

  if (isLoggedOut) {
    renderLoggedOutState();
    return;
  }

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
  } else {
    conversation.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="empty-illustration">WA</div>
      <h2>Kids WhatsApp on Web</h2>
      <p>Grow, organise and manage your account.</p>
      <small>Your personal messages are end-to-end encrypted</small>
    `;
  }
}

function renderSettingsPanel() {
  const settingsPanel = document.querySelector('[data-panel="settings"]');
  if (!settingsPanel) return;
  if (isLoggedOut) {
    settingsPanel.innerHTML = renderLoggedOutPanel();
    return;
  }
  settingsPanel.innerHTML = activeSettingsPage ? renderSettingsPage(activeSettingsPage) : renderSettingsHome();
}

function subscribeActiveConversation() {
  const activeContact = getActiveContact(state);
  if (!currentAuthUser || !activeContact?.uid || subscribedConversationContactId === activeContact.uid) return;
  unsubscribeConversation();
  subscribedConversationContactId = activeContact.uid;
  unsubscribeConversation = subscribeConversationMessages(
    currentAuthUser.uid,
    activeContact.uid,
    (messages) => {
      state = {
        ...state,
        contacts: state.contacts.map((contact) =>
          contact.id === activeContact.uid
            ? {
                ...contact,
                messages,
                preview: messages.at(-1)?.deleted ? 'This message was deleted' : messages.at(-1)?.text ?? contact.email,
                time: messages.at(-1)?.time ?? contact.time
              }
            : contact
        )
      };
      if (!isTextEntryActive()) renderAll();
    },
    (error) => showToast(error.message)
  );
}

function renderAll() {
  renderAuthGate();
  renderSignedInUser();
  if (!currentAuthUser) return;
  renderSettingsPanel();
  renderSection();
  renderChats();
  if (state.activeSection === 'chats' && !activeAction) {
    renderConversation();
    subscribeActiveConversation();
  }
}

async function hydrateChatsFromServer() {
  if (currentAuthUser) return;
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

  const menu = document.createElement('div');
  menu.className = 'contact-context-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <strong>${contact.name}</strong>
    <small>${getContactEmail(contact) || contact.phone || 'No contact detail saved'}</small>
    ${
      contact.uid
        ? '<small class="verified-contact-note">Google verified contact</small>'
        : `<button type="button" data-contact-menu-action="edit" data-contact-id="${contact.id}">Edit name and phone</button>`
    }
    <button type="button" class="danger-row" data-contact-menu-action="delete-contact" data-contact-id="${contact.id}">Delete username</button>
  `;
  document.body.append(menu);

  const rect = menu.getBoundingClientRect();
  const left = Math.min(anchor.x ?? window.innerWidth / 2, window.innerWidth - rect.width - 12);
  const top = Math.min(anchor.y ?? window.innerHeight / 2, window.innerHeight - rect.height - 12);
  menu.style.left = `${Math.max(12, left)}px`;
  menu.style.top = `${Math.max(12, top)}px`;
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

function showEditContactDialog(contactId) {
  const contact = getContactById(contactId);
  if (!contact) return;
  if (contact.uid) {
    showToast('Google contact details cannot be edited here');
    return;
  }
  closeContactMenu();
  const existing = document.querySelector('.action-dialog-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'action-dialog-backdrop';
  backdrop.innerHTML = `
    <section class="action-dialog menu-dialog" role="dialog" aria-label="Edit contact">
      <button class="dialog-close" aria-label="Close">x</button>
      <form class="business-profile-form dialog-form" id="editContactForm" data-contact-id="${contact.id}">
        ${renderContactAvatar(contact, 'small')}
        <h2>Edit contact</h2>
        <p>Change this username and phone number.</p>
        <div class="business-fields">
          <label class="profile-field">
            <span>Friend name</span>
            <input name="name" type="text" autocomplete="off" value="${escapeAttribute(contact.name)}" required />
          </label>
          <label class="profile-field">
            <span>Phone number</span>
            <input name="phone" type="tel" autocomplete="off" value="${escapeAttribute(contact.phone || '')}" required />
          </label>
          <label class="profile-field">
            <span>Gmail</span>
          <input name="email" type="email" autocomplete="off" value="${escapeAttribute(getContactEmail(contact))}" placeholder="friend@gmail.com" />
          </label>
        </div>
        <button class="detail-action" type="submit">Save contact</button>
      </form>
    </section>
  `;
  document.body.append(backdrop);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('.dialog-close')) {
      backdrop.remove();
    }
  });
  backdrop.querySelector('input[name="name"]')?.focus();
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
          <p>Choose a Google signed-in user to start a chat.</p>
          <label class="friend-search">
            <span>Find friend by Gmail</span>
            <input id="friendSearchInput" type="email" autocomplete="off" value="${escapeAttribute(friendSearchQuery)}" placeholder="friend@gmail.com" />
          </label>
          <div class="auth-user-list friend-search-results">
            ${renderFriendSearchRows()}
          </div>
          <div class="auth-user-list">
            ${renderAuthenticatedUserRows('No Google signed-in users were found yet.')}
          </div>
        </div>
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

channelList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-channel-id]');
  if (!button) return;
  state = toggleChannelFollow(state, button.dataset.channelId);
  renderAll();
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

  if (event.target.closest('[data-auth-logout]')) {
    logoutGoogleUser().catch((error) => showToast(error.message));
    return;
  }

  const authUserButton = event.target.closest('[data-auth-user-id]');
  if (authUserButton) {
    const selectedUser = [...friendSearchResults, ...authenticatedUsers].find((user) => user.uid === authUserButton.dataset.authUserId);
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
    const action = contactMenuAction.dataset.contactMenuAction;
    if (action === 'edit') {
      showEditContactDialog(contactId);
      return;
    }
    state = deleteContactChat(state, contactId);
    closeContactMenu();
    saveChatState();
    renderAll();
    showToast('Username deleted');
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

  const discoverChannel = event.target.closest('[data-discover-channel]');
  if (discoverChannel) {
    showToast(`Following ${discoverChannel.dataset.discoverChannel}`);
    discoverChannel.querySelector('.follow-button').textContent = 'Following';
    discoverChannel.querySelector('.follow-button').classList.add('following');
    return;
  }

  const settingChoice = event.target.closest('[data-setting-choice]');
  if (settingChoice) {
    showToast(`${settingChoice.dataset.settingChoiceTitle}: ${settingChoice.dataset.settingChoice}`);
    settingChoice.closest('.action-dialog-backdrop')?.remove();
    return;
  }

  const communityExample = event.target.closest('[data-community-example]');
  if (communityExample) {
    showToast(`${communityExample.dataset.communityExample} opened`);
    communityExample.querySelector('.follow-button').textContent = 'Opened';
    communityExample.querySelector('.follow-button').classList.add('following');
    return;
  }

  const businessListItem = event.target.closest('[data-business-list-item]');
  if (businessListItem) {
    showToast(`${businessListItem.dataset.businessListItem} opened`);
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
      isLoggedOut = true;
      activeAction = null;
      activeSettingsPage = null;
      state = switchSection(state, 'settings');
      renderAll();
      showToast('Logged out from this computer');
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

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-login-again]')) return;
  isLoggedOut = false;
  state = switchSection(state, 'settings');
  renderAll();
  showToast('Logged in again');
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
    friendSearchResults = [];
    unsubscribeFriendSearch();
    const results = document.querySelector('.friend-search-results');
    if (!friendSearchQuery.trim()) {
      if (results) results.innerHTML = renderFriendSearchRows();
      return;
    }
    unsubscribeFriendSearch = subscribeUserByEmail(
      friendSearchQuery,
      (users) => {
        friendSearchResults = users;
        const nextResults = document.querySelector('.friend-search-results');
        if (nextResults) nextResults.innerHTML = renderFriendSearchRows();
      },
      (error) => showToast(error.message)
    );
    if (results) results.innerHTML = renderFriendSearchRows();
    return;
  }

  const newChatInput = event.target.closest('#newChatForm input[name="name"], #newChatForm input[name="phone"], #newChatForm input[name="email"]');
  if (!newChatInput) return;

  if (newChatInput.name === 'name') {
    newChatDraft.name = newChatInput.value;
  } else if (newChatInput.name === 'phone') {
    newChatDraft.phone = newChatInput.value;
  } else {
    newChatDraft.email = newChatInput.value;
  }
  saveNewChatDraft();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeContactMenu();
    closeMessageMenu();
  }
});

document.addEventListener('submit', (event) => {
  const createStatusForm = event.target.closest('#createStatusForm');
  if (createStatusForm) {
    event.preventDefault();
    const formData = new FormData(createStatusForm);
    for (const [key, value] of formData.entries()) {
      statusValues[key] = String(value);
    }
    showToast('Status posted');
    renderAll();
    return;
  }

  const createChannelForm = event.target.closest('#createChannelForm');
  if (createChannelForm) {
    event.preventDefault();
    const formData = new FormData(createChannelForm);
    for (const [key, value] of formData.entries()) {
      createdChannelValues[key] = String(value);
    }
    showToast(`Channel created: ${createdChannelValues['Channel name']}`);
    renderAll();
    return;
  }

  const newChatForm = event.target.closest('#newChatForm');
  if (newChatForm) {
    event.preventDefault();
    showToast('Choose a signed-in Google user');
    return;
  }

  const editContactForm = event.target.closest('#editContactForm');
  if (editContactForm) {
    event.preventDefault();
    const contact = getContactById(editContactForm.dataset.contactId);
    if (contact?.uid) {
      showToast('Google contact details cannot be edited here');
      editContactForm.closest('.action-dialog-backdrop')?.remove();
      return;
    }
    const formData = new FormData(editContactForm);
    const name = String(formData.get('name') ?? '');
    const phone = String(formData.get('phone') ?? '');
    const email = String(formData.get('email') ?? '');
    if (!name.trim() || !phone.trim()) {
      showToast('Enter name and phone number');
      return;
    }
    if (email.trim() && !email.includes('@')) {
      showToast('Enter a valid Gmail address');
      return;
    }
    state = updateContactChat(state, editContactForm.dataset.contactId, { name, phone, email });
    saveChatState();
    editContactForm.closest('.action-dialog-backdrop')?.remove();
    renderAll();
    showToast('Contact saved');
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

  const businessForm = event.target.closest('#businessToolForm');
  if (businessForm) {
    event.preventDefault();
    const formData = new FormData(businessForm);
    if (businessForm.dataset.businessForm === 'businessProfileForm') {
      for (const [key, value] of formData.entries()) {
        businessProfileValues[key] = String(value);
      }
    }
    showToast(`${businessForm.dataset.businessTitle} saved`);
    renderAll();
    return;
  }

  const form = event.target.closest('#profileForm');
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    profileValues[key] = String(value);
  }
  const email = profileValues.Email.trim();
  if (email && !email.includes('@')) {
    showToast('Enter a valid email address');
    return;
  }
  showToast('Profile saved');
  renderAll();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-mobile-chat-back]')) return;
  mobileConversationOpen = false;
  activeAction = null;
  renderAll();
});

function startFirebaseAuth() {
  startAuthListener(
    async (user) => {
      authReady = true;
      authError = '';
      currentAuthUser = user;
      unsubscribeUsers();
      unsubscribeFriendSearch();
      unsubscribeConversation();
      subscribedConversationContactId = '';
      if (!user) {
        authenticatedUsers = [];
        friendSearchResults = [];
        renderAll();
        return;
      }

      await saveUserProfile(user).catch((error) => {
        authError = error.message;
      });
      unsubscribeUsers = subscribeAuthenticatedUsers(
        (users) => {
          authenticatedUsers = users;
          state = reconcileAuthenticatedContacts(state, users, user.uid);
          saveChatState();
          renderAll();
        },
        (error) => showToast(error.message)
      );
      renderAll();
    },
    (error) => {
      authReady = true;
      authError = error.message;
      currentAuthUser = null;
      renderAll();
    }
  );
}

renderAll();
startFirebaseAuth();
hydrateChatsFromServer();
startLiveChatSync();
