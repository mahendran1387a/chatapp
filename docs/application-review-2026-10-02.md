# Kids WhatsApp 2026 application review

Scope: fix confirmed defects in the existing web application, Firebase access,
Node server and Android shell, then improve the existing interface for children.
No new messaging, media, account or notification capability was added.

## Confirmed defects and repairs

| Area | Before | Repair |
| --- | --- | --- |
| Private server files | Static routes could expose repository/configuration/data files. | Explicit public-file allowlist; reject traversal, dotfiles and symlink aliases. |
| Chat-state API | Anonymous clients shared a single server document. | Require verified Firebase tokens and approved profiles; isolate storage by user. The browser uses Firestore for messages and user-scoped local caches. |
| Voice authorization | Signaling could trust unverified identities and unapproved recipients. | Verify token signatures/expiry and approval, derive sender identity from claims, bound payloads, and expire authenticated sockets. |
| Sender edits/deletes | Changes appeared locally without persisting to Firestore. | Transactional sender-only writes and corresponding rules; immutable message identity and soft deletion. |
| Read receipts | Clients could forge another user's receipt. Hidden chats could be marked read. | Rules only allow adding the current user's receipt; only visible chats send receipts; the existing preference is honored. |
| Group join approval | Client-supplied manager IDs could grant authority; concurrent approvals could lose members. | Check authoritative group ownership/admin fields and merge members in a transaction. |
| First chat/join | Reading a missing, ownership-protected document failed permission checks. | Use authorized queries before subscribing/requesting. |
| Account lifecycle | Chats/settings could leak across accounts; revoked/restored approval left stale subscriptions. | User-scoped caches, clear old UI, cancel listeners and guard late callbacks; restart lists after approval restoration. |
| Composer | Updates interrupted typing; pending sends could retain sent text, allow duplicate submits or crash after logout. | Preserve drafts/focus, track pending sends independently of the form, and ignore stale account completions. |
| Chat navigation | Clicking a contact name opened its menu. Removed shortcuts returned or became inaccessible. | Normal clicks open chats; right-click opens menus; removed shortcuts stay removed and can be explicitly reopened. |
| Unread/search | Inactive chats never refreshed unread counts; search ignored older messages. | Passive subscriptions update previews/counts without marking them read; search checks existing history. |
| Unsafe names | Display names could become executable HTML. | Escape external profile names, labels and attributes. |
| Voice lifecycle | "Connected" appeared before audio connected; canceled microphone requests and late peer events could revive calls. | Wait for actual connection events; stop canceled microphone streams and ignore stale peers/async work. |
| Android shell | File-origin WebView could not support Google sign-in or the hosted signaling origin. | Open the existing HTTPS application in the system browser, with a browser-missing fallback. |
| Storage reliability | A failed write could poison later writes; file writes were non-atomic; PostgreSQL TLS verification was disabled. | Recover the write queue, atomically replace private files, verify database TLS certificates. |
| Misleading settings | Demo controls appeared to change features they did not implement. | Label and disable those controls as previews; retain the existing implemented preferences. |
| Phone layout | Composer/pickers could overflow; group labels clipped. | Responsive layouts, keyboard-aware viewport sizing, readable bubbles and reachable controls. |

## Appearance

Friendly pastel colours, teal actions, rounded cards, clear navigation labels,
larger touch targets, readable text, visible keyboard focus and reduced-motion
support. Existing Chats, Friends, Groups, Settings, emoji, stickers and one-to-one
voice calling remain the scope. Desktop and 320/390/768px layouts were checked.

## Validation

- 133 unit/server/Firebase tests passed, including real Firestore rules emulator checks (zero skipped).
- 29 Chromium regressions passed, exercising the real application with an offline Firebase
  boundary and fake voice transport; they do not write to production accounts.
- Bundled Android web assets match the canonical web files.
- Android Activity source compiles against the Android API jar. A full APK build
  and device test require an Android SDK/Gradle environment.

Commands:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The Firestore integration test is skipped unless `FIRESTORE_EMULATOR_HOST` is set.
For the current cloud workspace, the emulator runs at `127.0.0.1:8088` and the
Firebase test tools are installed under `/tmp/chatapp-firebase-tools/node_modules`:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 npm test
```

Elsewhere, install `firebase`, `@firebase/rules-unit-testing` and `firebase-tools`
in a separate tools directory, set `FIREBASE_TEST_TOOLS` to its `node_modules`,
and start a Firestore emulator for project `demo-chatapp`. Production credentials
are unnecessary for these tests.

## Deployment and remaining validation

1. Publish the updated web/server code to Render.
2. Deploy the included Firestore rules and indexes to the existing Firebase project:
   `firebase deploy --only firestore:rules,firestore:indexes`. Wait for new indexes
   to finish building. Source changes alone do not deploy Firebase configuration.
3. Rebuild/distribute the Android APK to pick up its corrected launcher.
4. Check real Google sign-in, two approved accounts exchanging messages, and a
   two-device microphone call on the hosted HTTPS app. Production OAuth,
   microphones, TURN connectivity and a real PostgreSQL connection were not
   exercised by automated offline tests.

Legacy shared server data is retained privately; it is not assigned to individual
users because the original document has no trustworthy ownership information.
New groups allow up to 10 members including their creator, matching the rules'
profile-validation budget; existing larger groups can still be read. Messages
are limited to 4,000 characters. Unimplemented demo settings remain previews.

This review fixes the confirmed defects covered above; it is not a guarantee
that every possible device, network or production-data issue has been found.
