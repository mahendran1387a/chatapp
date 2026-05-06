# Render Hosting

This app is ready to deploy as a Render Web Service.

## Steps

1. Push this project to a GitHub repository.
2. Open Render and choose **New +** > **Blueprint**.
3. Connect the GitHub repository.
4. Render will read `render.yaml`.
5. Deploy the `chatapp-web` service.

The app is currently available locally at:

```text
http://127.0.0.1:4173
```

That local URL is only for this computer.

Important: the previously saved URL `https://chatapp-web.onrender.com` is not this app right now. It returns a Create React App page. To share with friends, open Render and copy the public URL from the Web Service connected to:

```text
https://github.com/mahendran1387a/chatapp
```

After you copy the correct Render URL, save it in `PUBLIC_CHAT_LINK.txt`.

## Notes

- The app uses `/api/chats` on the same server to save messages.
- The server uses Render's `PORT` environment variable automatically.
- The server binds to `0.0.0.0`, which Render requires for public web services.
- Render can use `/healthz` as the service health check endpoint.
- When `DATABASE_URL` is set, messages are saved in Supabase.
- When `DATABASE_URL` is not set, messages fall back to the local `.data/chats.json` file.
- Do not put the database password into browser code. Put the full database connection string only in Render environment variables.

## Supabase Database

This project uses a Supabase table named `public.chat_state`.

To connect Render to Supabase:

1. Open your Supabase project.
2. Go to **Project Settings** > **Database**.
3. Copy the database connection string.
4. In Render, open the web service.
5. Go to **Environment**.
6. Add:

```text
DATABASE_URL=your-supabase-database-connection-string
```

After that, all phones and computers using the hosted Render URL will read and write the same online chat data.
