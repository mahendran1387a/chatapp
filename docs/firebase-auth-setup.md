# Firebase Google Authentication Setup

This chat app now trusts Firebase Authentication instead of typed names. Users must sign in with Google before they can see chats, start chats, or send messages.

## 1. Create or Open a Firebase Project

1. Go to <https://console.firebase.google.com/>.
2. Create a project, or open your existing chat app project.
3. Add a Web app from Project settings.
4. Copy the web config into `src/firebase-config.js`.

Only use the normal web config in this file. Do not paste Firebase Admin SDK service account JSON, private keys, or server credentials into frontend code.

## 2. Enable Google Sign-In

1. In Firebase, open Authentication.
2. Click Sign-in method.
3. Enable Google.
4. Add a support email.
5. In Authentication settings, add your allowed domains:
   - `localhost`
   - `127.0.0.1`
   - your Render domain, for example `chatapp-c4a7.onrender.com`
   - your custom domain if you add one later

## 3. Enable Firestore

1. Open Firestore Database.
2. Create a database.
3. Start in production mode.
4. Publish the rules from `firestore.rules`.

## 4. What Gets Stored

The app writes Google user profiles to:

```text
users/{uid}
```

Each message is written to:

```text
conversations/{sorted_uid_pair}/messages/{messageId}
```

Messages store:

```text
text
senderUid
senderEmail
senderDisplayName
senderPhotoURL
participants
timestamp
```

The browser never lets a user type or edit the sender UID, sender email, or sender display name. Those values come from the signed-in Google account.

## 5. Test Google Login

1. Run the app locally.
2. Open the page.
3. Click Sign in with Google.
4. Sign in with a Gmail account.
5. Open another browser or another device and sign in with a second Gmail account.
6. Press the new chat button and choose the other signed-in user.
7. Send messages from both accounts.
8. Confirm messages show the Google display name/email owner and cannot be spoofed from the UI.
9. Use Settings > Log out of Google to sign out.
