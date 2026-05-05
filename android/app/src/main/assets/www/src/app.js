import {
  createContactChat,
  createInitialState,
  filterContacts,
  getActionView,
  getActiveContact,
  getSettingDangerView,
  getSettingOptionView,
  getSettingsPage,
  searchSettings,
  selectContact,
  sendMessage,
  switchSection,
  toggleChannelFollow
} from './chat-store.js';

const savedChatStorageKey = 'chatapp.savedChats.v1';
const clientIdStorageKey = 'chatapp.clientId.v1';
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
let settingsSearchQuery = '';
let isLoggedOut = false;
let mobileConversationOpen = false;
const settingSwitches = new Map();
const profileValues = {
  Name: 'Sangavi Mahendran',
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

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderDetailView(view, type = 'action') {
  if (view.form === 'newChat') {
    renderNewChatForm(view);
    return;
  }
  if (view.form === 'createChannel') {
    renderCreateChannelForm(view);
    return;
  }
  if (view.form === 'createStatus') {
    renderCreateStatusForm(view);
    return;
  }
  if (view.discoverItems) {
    renderDiscoverChannelsView(view);
    return;
  }
  if (view.listItems) {
    renderBusinessListView(view);
    return;
  }
  if (view.communityExamples) {
    renderCommunityExamplesView(view);
    return;
  }
  if (view.menuItems) {
    renderMenuView(view);
    return;
  }
  if (view.fields) {
    renderBusinessProfileForm(view);
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

function renderBusinessListView(view) {
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

function renderCreateStatusForm(view) {
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

function renderCommunityExamplesView(view) {
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

function renderDiscoverChannelsView(view) {
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

function renderCreateChannelForm(view) {
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

function renderNewChatForm(view) {
  emptyState.classList.remove('hidden');
  conversation.classList.add('hidden');
  emptyState.innerHTML = `
    <form class="business-profile-form" id="newChatForm">
      <div class="detail-illustration"></div>
      <h2>${view.title}</h2>
      <p>Add your friend by name and phone number, then start chatting.</p>
      <div class="business-fields">
        <label class="profile-field">
          <span>Friend name</span>
          <input name="name" type="text" autocomplete="off" placeholder="Aisha Friend" required />
        </label>
        <label class="profile-field">
          <span>Phone number</span>
          <input name="phone" type="tel" autocomplete="off" placeholder="+971 50 123 4567" required />
        </label>
      </div>
      <button class="detail-action" type="submit">Create chat</button>
    </form>
  `;
}

function renderBusinessProfileForm(view) {
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
        <div class="profile-edit-photo">SM</div>
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
  const navigation = row.section ? `data-jump-section="${row.section}"` : `data-settings-page="${row.page}"`;
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
        <p>Try searching for chats, privacy, account, notifications, or business tools.</p>
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
  const isSearchingSettings = settingsSearchQuery.trim().length > 0;
  return `
    <header class="panel-header">
      <h1>Settings</h1>
    </header>
    <label class="search-box settings-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 4a5.5 5.5 0 0 1 4.38 8.83l4.15 4.14-1.06 1.06-4.14-4.15A5.5 5.5 0 1 1 9.5 4Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>
      <input id="settingsSearchInput" type="search" placeholder="Search settings" value="${escapeAttribute(settingsSearchQuery)}" autocomplete="off" />
    </label>
    <div class="settings-scroll">
      ${
        isSearchingSettings
          ? renderSettingsSearchResults()
          : `
      <div class="settings-notice" data-action="chooseNotifications">
        <span class="line-icon bulb-icon"></span>
        <span><strong>Choose your notifications</strong><small>Get notifications for messages, groups or your status. <b>Choose now</b></small></span>
        <button data-settings-dismiss aria-label="Dismiss settings notice">x</button>
      </div>
      <button class="profile-row" data-settings-page="profile">
        <span class="profile-photo">SM</span>
        <strong>Sangavi Mahendran</strong>
      </button>
      <div class="settings-list">
        <button class="settings-row" data-jump-section="business">
          <span class="line-icon store-icon"></span>
          <span><strong>Business tools</strong><small>Quick replies, labels, catalog</small></span>
        </button>
        <button class="settings-row active" data-settings-page="account">
          <span class="line-icon key-icon"></span>
          <span><strong>Account</strong><small>Security notifications, account info</small></span>
        </button>
        <button class="settings-row" data-settings-page="privacy">
          <span class="line-icon lock-icon"></span>
          <span><strong>Privacy</strong><small>Blocked contacts, disappearing messages</small></span>
        </button>
        <button class="settings-row" data-settings-page="chatsSettings">
          <span class="line-icon chats-icon"></span>
          <span><strong>Chats</strong><small>Theme, wallpaper, chat settings</small></span>
        </button>
        <button class="settings-row" data-settings-page="notificationsSettings">
          <span class="line-icon bell-icon"></span>
          <span><strong>Notifications</strong><small>Messages, groups, sounds</small></span>
        </button>
        <button class="settings-row" data-settings-page="keyboardShortcuts">
          <span class="line-icon keyboard-icon"></span>
          <span><strong>Keyboard shortcuts</strong><small>Quick actions</small></span>
        </button>
        <button class="settings-row" data-settings-page="help">
          <span class="line-icon help-icon"></span>
          <span><strong>Help and feedback</strong><small>Help center, contact us, privacy policy</small></span>
        </button>
        <button class="settings-row logout-row" data-settings-page="logout">
          <span class="line-icon logout-icon"></span>
          <span><strong>Log out</strong></span>
        </button>
      </div>
      `
      }
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
        <button class="chat-item ${contact.id === state.activeContactId ? 'active' : ''}" data-contact-id="${contact.id}">
          ${renderAvatar(contact.avatar, contact.color)}
          <span class="chat-copy">
            <span class="chat-title-row">
              <span class="chat-name">${contact.name}</span>
              <span class="chat-time">${contact.time}</span>
            </span>
            <span class="chat-preview">${contact.deleted ? 'This message was deleted' : contact.preview}</span>
          </span>
          ${contact.unread ? `<span class="unread">${contact.unread}</span>` : '<span></span>'}
        </button>
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
      ${renderAvatar(contact.avatar, contact.color, 'small')}
      <span class="conversation-title">
        <strong>${contact.name}</strong>
        <small>online</small>
      </span>
      <span class="conversation-actions">
        <button title="Search" aria-label="Search chat" data-action="chatSearch">Search</button>
        <button title="Menu" aria-label="Chat menu" data-action="chatMenu">...</button>
      </span>
    </header>
    <div class="messages" id="messages">
      ${contact.messages
        .map(
          (message) => {
            const direction = message.senderId
              ? message.senderId === currentClientId
                ? 'out'
                : 'in'
              : message.direction;
            return `
              <div class="bubble ${direction} ${message.deleted ? 'deleted' : ''}">
                ${message.deleted ? 'This message was deleted' : message.text}
                <time>${message.time}</time>
              </div>
            `;
          }
        )
        .join('')}
    </div>
    <form class="composer" id="composer">
      <button type="button" title="Attach" aria-label="Attach" data-action="attach">+</button>
      <input id="messageInput" autocomplete="off" placeholder="Type a message" />
      <button type="submit" title="Send" aria-label="Send">➤</button>
    </form>
  `;

  const messages = conversation.querySelector('#messages');
  messages.scrollTop = messages.scrollHeight;
  conversation.querySelector('#composer').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = conversation.querySelector('#messageInput');
    state = sendMessage(state, input.value, { senderId: currentClientId });
    saveChatState();
    input.value = '';
    renderAll();
    conversation.querySelector('#messageInput').focus();
  });
}

function renderStatuses() {
  recentStatuses.innerHTML = state.statuses.recent.map(renderStatusItem).join('');
  viewedStatuses.innerHTML = state.statuses.viewed.map(renderStatusItem).join('');
}

function renderChannels() {
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

  if (state.activeSection === 'status') {
    conversation.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="status-illustration"></div>
      <h2>Share status updates</h2>
      <p>Share photos, videos and text that disappear after 24 hours.</p>
      <small>Your status updates are end-to-end encrypted</small>
    `;
  } else if (state.activeSection === 'channels') {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="channels-illustration"></div>
      <h2>Discover channels</h2>
      <p>Entertainment, sports, news, lifestyle, people and more. Follow the channels<br>that interest you</p>
    `;
  } else if (state.activeSection === 'communities') {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="communities-illustration"></div>
      <h2>Create communities</h2>
      <p>Bring members together in topic-based groups and easily send them admin<br>announcements.</p>
      <small>Your personal messages in communities are end-to-end encrypted</small>
    `;
  } else if (state.activeSection === 'business') {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="channels-illustration"></div>
      <h2>Discover channels</h2>
      <p>Entertainment, sports, news, lifestyle, people and more. Follow the channels<br>that interest you</p>
    `;
  } else if (state.activeSection === 'settings') {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="settings-illustration"></div>
      <h2>Settings</h2>
    `;
  } else {
    conversation.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="empty-illustration">WA</div>
      <h2>WhatsApp Business on Web</h2>
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

function renderAll() {
  renderSettingsPanel();
  renderSection();
  renderChats();
  renderStatuses();
  renderChannels();
  if (state.activeSection === 'chats' && !activeAction) renderConversation();
}

async function hydrateChatsFromServer() {
  const serverState = await loadServerChatState();
  if (!Array.isArray(serverState.contacts) || !serverState.contacts.length) return;
  const serverSnapshot = stringifyChatPayload({
    activeContactId: serverState.activeContactId,
    contacts: serverState.contacts
  });
  if (serverSnapshot === lastChatSnapshot) return;

  const syncedState = createInitialState(serverState);
  state = {
    ...state,
    activeContactId: syncedState.contacts.some((contact) => contact.id === state.activeContactId)
      ? state.activeContactId
      : syncedState.activeContactId,
    contacts: syncedState.contacts
  };
  rememberChatSnapshot({
    activeContactId: syncedState.activeContactId,
    contacts: syncedState.contacts
  });
  try {
    saveLocalChatState(getPersistedChatPayload());
  } catch {
    // Browser storage can be unavailable in incognito.
  }
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
        <form class="business-profile-form dialog-form" id="newChatForm">
          <div class="detail-illustration"></div>
          <h2>${view.title}</h2>
          <p>Add your friend by name and phone number, then save the chat.</p>
          <div class="business-fields">
            <label class="profile-field">
              <span>Friend name</span>
              <input name="name" type="text" autocomplete="off" placeholder="Aisha Friend" required />
            </label>
            <label class="profile-field">
              <span>Phone number</span>
              <input name="phone" type="tel" autocomplete="off" placeholder="+971 50 123 4567" required />
            </label>
          </div>
          <button class="detail-action" type="submit">Save chat</button>
        </form>
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
  const item = event.target.closest('[data-contact-id]');
  if (!item) return;
  activeAction = null;
  mobileConversationOpen = true;
  state = selectContact(state, item.dataset.contactId);
  saveChatState();
  renderAll();
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

channelList.addEventListener('click', (event) => {
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
  renderSettingsPanel();
  const refreshedInput = document.querySelector('#settingsSearchInput');
  if (!refreshedInput) return;
  refreshedInput.focus();
  refreshedInput.setSelectionRange(settingsSearchQuery.length, settingsSearchQuery.length);
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
    const formData = new FormData(newChatForm);
    const name = String(formData.get('name') ?? '');
    const phone = String(formData.get('phone') ?? '');
    if (!name.trim() || !phone.trim()) {
      showToast('Enter name and phone number');
      return;
    }
    activeAction = null;
    activeSettingsPage = null;
    mobileConversationOpen = true;
    state = createContactChat(state, { name, phone });
    saveChatState();
    newChatForm.closest('.action-dialog-backdrop')?.remove();
    renderAll();
    showToast('Chat saved');
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

renderAll();
hydrateChatsFromServer();
startLiveChatSync();
