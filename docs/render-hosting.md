# Render Hosting

This app is ready to deploy as a Render Web Service.

## Steps

1. Push this project to a GitHub repository.
2. Open Render and choose **New +** > **Blueprint**.
3. Connect the GitHub repository.
4. Render will read `render.yaml`.
5. Deploy the `chatapp-web` service.

The public chat app URL is:

```text
https://chatapp-c4a7.onrender.com
```

Send that URL to friends so they can open the chat app from phones and computers.

The local development URL is:

```text
http://127.0.0.1:4173
```

Do not share the local URL with friends. It only works on the computer where the app is running locally.

The same public link is also saved in `PUBLIC_CHAT_LINK.txt` and `Open Chat App Online.url`.

## Data and authentication

- Google authentication and Firestore handle profiles, approvals, groups and chat messages.
- Deploy `firestore.rules` and `firestore.indexes.json` using `firebase deploy --only firestore:rules,firestore:indexes`; wait for indexes to finish building.
- Browser preferences and cached chat state are scoped to the signed-in user on that device.
- The legacy `/api/chats` endpoint requires a Bearer Firebase ID token and an approved profile. Its storage is isolated by verified user ID; the browser no longer polls the old shared document.
- Old shared server data remains private and is not automatically assigned to any user.
- Voice signaling also requires verified, approved accounts. Tokens expire and must be refreshed by reconnecting.
- The server uses Render's `PORT`, binds to `0.0.0.0`, and exposes `/healthz` for health checks.
- Android opens this same public HTTPS URL in the system browser so Google sign-in and browser microphone access work on a supported origin.

## Optional PostgreSQL storage

The legacy authenticated chat-state API uses `public.chat_state` when `DATABASE_URL` is configured. Without it, user records are stored beneath the private `.data/users` directory. Render's ordinary local filesystem is ephemeral; Firestore remains the application's message source.

Set the database connection string only in Render environment variables. PostgreSQL TLS certificates are verified; provide a trusted certificate chain when your database provider requires one. Do not disable verification or put credentials in browser code.

After deployment, check Google sign-in, messages between two approved accounts and a two-device voice call. See `docs/application-review-2026-10-02.md` for fixes and validation limits.
