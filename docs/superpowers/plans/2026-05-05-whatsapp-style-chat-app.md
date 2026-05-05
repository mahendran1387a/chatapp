# WhatsApp Style Chat App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable WhatsApp-style front-end chat app with chats, statuses, search, filters, conversation view, and message sending.

**Architecture:** Use a static single-page app. Keep state operations in `src/chat-store.js` so they can be tested without a browser, and keep DOM rendering/events in `src/app.js`.

**Tech Stack:** HTML, CSS, JavaScript modules, Node built-in test runner.

---

### Task 1: Test Chat State

**Files:**
- Create: `tests/chat-store.test.mjs`
- Create: `src/chat-store.js`

- [ ] **Step 1: Write failing tests**

Test contact filtering, chat selection, message sending, and auto-reply generation.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

- [ ] **Step 3: Implement chat state helpers**

Add contacts, statuses, active chat state, filtering, sending, and reply helpers.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

### Task 2: Build Static UI

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/app.js`

- [ ] **Step 1: Add page skeleton**

Create the app shell with icon rail, sidebar, chat pane, and status pane.

- [ ] **Step 2: Add styling**

Match the reference layout with clean spacing, green accents, chat bubbles, status rings, and responsive behavior.

- [ ] **Step 3: Wire interactions**

Support chat/status navigation, search, filters, contact selection, message sending, and dismissible notices.

### Task 3: Verify Locally

**Files:**
- Modify: none

- [ ] **Step 1: Run tests**

Run: `npm test`

- [ ] **Step 2: Start static server**

Run a local server and open `http://localhost:4173`.
