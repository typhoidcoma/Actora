# Sign-in, Google and push reminders

One Google sign-in (Supabase OAuth) both signs the user in and connects Calendar and Gmail. Push reminders are a
doorbell for when the app is closed; while it's open they arrive over the socket. Full reference:
[services.md](../services.md) sections 1 and 2.

## Where things are

| What                                                                 | File                                         |
| -------------------------------------------------------------------- | -------------------------------------------- |
| Supabase client, `GOOGLE_SCOPES`, `signInWithGoogle`                 | `src/auth/supabase.ts`                       |
| Auth gate, `oauthError`, token refresh → reconnect                   | `src/App.tsx` (2D), `3dapp/src/App.tsx` (3D) |
| Google status / connect / sync / disconnect, `linkGoogleFromSession` | `src/google/google.ts`                       |
| REST with the JWT                                                    | `src/aelora/http.ts`                         |
| Push: register, subscribe, resubscribe, test, background notify      | `src/push/push.ts`, `src/push/start.ts`      |
| Push status and snooze                                               | `src/stores/push.ts`                         |
| Service worker (push transport only, no caching)                     | `public/sw.js`                               |

## Rules

- **`GOOGLE_SCOPES` must match Aelora's** (`src/integrations/google-calendar/google-oauth.ts` there).
- **Sign-in always shows the account chooser and consent.** The `prompt` and `access_type` query params are what
  make Google return a refresh token every time. Don't "simplify" them away.
- **The popup Connect finishes in the app.** Aelora's callback only hands back a code; `onGoogleMessage` must check the
  origin and redeem it with `/finish` as the signed-in user. Don't bring back the same-tab fallback, and don't add
  `Cross-Origin-Opener-Policy: same-origin`: either one means the code never arrives.
- **The socket pins the JWT at connect.** Both apps call `reconnectAelora()` on `TOKEN_REFRESHED`; keep that.
- **`enablePush()` must run from a tap**, and asks permission before any `await` (Safari drops the gesture).
- **`resubscribe()` runs on every `hello`**; iOS drops subscriptions silently.
- **The service worker always shows a notification** for a push, and never caches.
- Mock mode skips Supabase and Google entirely.

## Outside this repo

Every origin needs adding to Aelora's `AELORA_CORS_ORIGINS` and Supabase's redirect URLs
([development.md](../development.md), "Backend checklist"). The 3D app at `/3d/` shares the origin and needs nothing.

## Check

`src/google/google.test.ts`, `src/push/push.test.ts`. Sign-in only works on `http://localhost:5173` (the redirect
URL), so test it on the real dev server, not a mock port.
