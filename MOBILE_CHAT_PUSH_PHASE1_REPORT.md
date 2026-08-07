# Universal AI Chat System — Phase 1 Report
## Mobile Full-Screen Chat + Push Notifications

## What this covers
Phase 1 of the requested "JEDIDA Universal AI Chat System" upgrade. The full
spec (desktop 3-panel workspace, AI Tools button polish, etc.) is scoped into
later phases — see the open items at the bottom.

## Chat UI consolidation
Two parallel, unfinished chat UIs existed in the uploaded zip:
`ChatWorkspace.jsx` (used by `FloatingChatButton`) and `JedidaChatSuite.jsx`
(used by `FloatingChatButtonV2`, which turned out to not be mounted anywhere
in `App.jsx`). Per your decision, `ChatWorkspace` is now the single base —
`JedidaChatSuite.jsx`, `FloatingChatButtonV2.jsx`, and
`jedida-chat-suite.css` were removed. No other files referenced them, so
this was a clean deletion.

## Mobile full-screen chat
`FloatingChatButton.jsx` now renders two different presentations instead of
always using the bottom-sheet layout:
- **Mobile / native shell** (viewport < 768px, or running inside the
  Capacitor app): true full-screen chat — `100dvh`/`100vw`, respects
  `--safe-area-top`/`--safe-area-bottom`, only its own close button as
  chrome (ChatWorkspace's header still carries identity/status/AI tools).
  The Android hardware back button closes it instead of backing out of the
  app or falling through to the app-level nav handler.
- **Desktop/tablet**: unchanged floating bottom-sheet, pending the Phase 2
  desktop 3-panel workspace.

### Back-button fix worth flagging
Capacitor's `backButton` event has no event-consumption concept — every
listener fires on every press. Wiring chat's "close on back" naively would
have run *alongside* the existing app-level nav handler in
`NativeAppShell.jsx`, not instead of it. Fixed by turning
`jedidaNative.onBackButton` into a proper LIFO interceptor stack in
`jedidaNativeBridge.js`: the most-recently-registered handler runs first,
and returning `true` stops it from reaching older handlers. `NativeAppShell`
needed no changes — it's registered first, so it naturally sits at the
bottom of the stack.

## Push notifications
The `@capacitor/push-notifications` plugin was already installed in the
mobile shell but nothing used it. Now wired end-to-end:

**Backend**
- `schema_phase46_push_notifications.sql` — `device_push_tokens` table
  (one row per user+device) and a `users.chat_push_enabled` toggle.
- `services/pushService.js` — Firebase Cloud Messaging (covers Android +
  iOS via one integration). Follows the same pattern as
  `anthropicClient.js`: with no `FIREBASE_SERVICE_ACCOUNT` set, every call
  logs and no-ops instead of failing, so the platform works end-to-end
  without a Firebase project. Also prunes dead tokens FCM reports back.
- `routes/push.js` — `POST/DELETE /api/push/register`,
  `PUT /api/push/preferences`. Mounted at `/api/push`.
- Both message-send paths (`chatSocket.js`'s real-time handler and the
  `chatV2.js` REST fallback) now push-notify the other participant, but
  only when they're not already connected via a live socket (reuses the
  existing `isUserOnline` presence check) — no double-notifying someone
  already looking at the conversation.
- Added `GET /chat-v2/:conversationId` (participant-only) since the
  existing API only exposed a user's *default* conversation via `/mine` —
  needed so a push tap can deep-link into a specific conversation.

**Frontend**
- `native/pushNotifications.js` — orchestrates registration (asks OS
  permission, gets the FCM token from the shell, POSTs it to
  `/api/push/register`), listens for a notification tap and dispatches
  the existing `OPEN_CHAT_EVENT` with the conversation id, and unregisters
  the token on logout (`utils/auth.js` now calls this before clearing the
  session).
- `jedidaNativeBridge.js` — added `onPushReceived` / `onPushTapped`.
- `MessagesMenu.jsx` — refreshes the unread badge on a foreground push.
- `FloatingChatButton.jsx` — registers for push once signed in; opens
  straight into the right conversation when `OPEN_CHAT_EVENT` carries one.

## What you need to do to turn real push on
1. Create a Firebase project, add Android + iOS apps to it.
2. Firebase Console → Project Settings → Service Accounts → generate a
   private key → `base64 -w0 service-account.json` → set as
   `FIREBASE_SERVICE_ACCOUNT` in the backend `.env`.
3. Drop `google-services.json` / `GoogleService-Info.plist` into the
   Android/iOS native projects per Capacitor's push-notifications plugin
   docs (this is a native-project file, not something this chat-sandbox can
   generate).
4. `cd mobile-shell && npm install && npx cap sync`.

Until step 2 is done, everything still works — `pushService.js` just logs
what it would have sent.

## Open items (next phases of this stage)
- Desktop 3-panel workspace (conversations list / active conversation /
  customer-and-order profile panel) as its own page — not built this phase.
- AI Tools button polish + human-handover UX refinement.
- Voice messages, swipe gestures.
- Cross-device conversation sync is inherited "for free" (same backend
  conversation regardless of device) but hasn't been explicitly tested
  across two simultaneous sessions.
