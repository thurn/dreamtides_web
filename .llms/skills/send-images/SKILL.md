---
name: send-images
description: Use when asked to send, post, or share screenshots or images to Discord. Triggers on send images, send screenshots, post to discord, share screenshot, discord webhook, /send-images.
---

# Send Images to Discord

Post one or more screenshots/images to the project's Discord channel using
`scripts/send-screenshots-to-discord.mjs`. The script batches images into
Discord messages (up to 10 attachments each) and uploads them via an incoming
webhook. No npm dependencies; requires Node 18+.

## Usage

```bash
node scripts/send-screenshots-to-discord.mjs [options] <image> [<image> ...]
# or
npm run send-screenshots -- [options] <image> [<image> ...]
```

Send two screenshots with a caption:

```bash
node scripts/send-screenshots-to-discord.mjs \
  -m "New pool viewer" shotA.png shotB.png
```

Preview batching without sending:

```bash
node scripts/send-screenshots-to-discord.mjs --dry-run *.png
```

## Options

- `-m, --message <str>` — text posted with the (first) batch.
- `-u, --username <str>` — override the webhook's display name for this post.
- `-w, --webhook <url>` — Discord webhook URL.
- `--per-message` — repeat `--message` on every batch (default: first batch only).
- `-n, --dry-run` — validate inputs and print the plan without sending.
- `-h, --help` — full help text.

## Webhook resolution

The webhook URL is chosen in this order:

1. `--webhook <url>`
2. the `DISCORD_WEBHOOK_URL` environment variable
3. a built-in default (the project's "Screenshot Bot" channel)

The default channel is whatever the "Screenshot Bot" webhook is bound to — not
necessarily `#general`. To find it in Discord: Server Settings → Integrations →
Webhooks. To post elsewhere, create a webhook on the target channel and pass it
via `--webhook` or `DISCORD_WEBHOOK_URL`.

## Notes

- Supported types: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`.
- Discord's default per-request upload limit is 10 MiB; the script warns when a
  batch exceeds it (boosted servers allow more).
- Delivery is confirmed by Discord returning a message ID (the script uses
  `wait=true`), though the message may appear in the channel after a short delay.
