# Firebase Multiplayer

The V2 quest prototype uses Firebase Realtime Database for shared quest rooms
and Firebase Hosting for deployed share links.

## Environment

Copy `.env.example` to `.env.local` and fill in the Firebase web app values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

## Database Rules

The prototype uses open room data for low-friction remote testing:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Local Testing

Run:

```bash
npm start
```

Open `http://localhost:5173/`, create a game, then open the generated
`?game=<roomId>` URL in a second browser window.

## Manual Two-Window QA

1. Create a room in the first window.
2. Open the share URL in a second window.
3. Pick a Dreamcaller in either window and verify both windows enter the same
   dreamscape.
4. Open a draft site, pick a card in one window, and verify the other window
   shows the updated deck and next offer.
5. Trigger an essence-changing action in one window while taking a different
   shared action in the other window, then verify both changes are present.
6. Open a reward, shop, Dreamsign, or essence site and verify both windows show
   the same revealed result.
7. Refresh both windows and verify they reload the room state.
8. Reset the quest and verify both windows return to the shared start state.

## Deploy

Run:

```bash
npm run build
firebase deploy
```

Firebase Hosting serves `dist/` and rewrites all routes to `index.html`, so
share links with `?game=<roomId>` load the app shell.
