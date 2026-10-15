# KBH Records — starting for real

The books were wiped clean on **15 Oct 2026**. There are no entries, no bill
photos, no cash checks and no history. One person is on the books:

| | |
| --- | --- |
| **Owner** | Saleem |
| **Mobile** | 0560235733 |
| **PIN** | sent separately — change it on first use |

> The PIN is deliberately not written down in this folder. This file goes
> into a public repository; a PIN in a public file is a PIN anyone can
> use. Change it from Settings → People & Roles → Saleem → Reset PIN.

Everyone else — the practice staff and the leftover test accounts — is gone.
Add the company's real people yourself: **Settings → Add Person**.

## Putting the real company in

1. **Add the staff.** Each person needs a name, a Saudi mobile and a 4-digit
   PIN you give them. Pick the role: Employee, Sub-admin or Admin. A
   Sub-admin can do everything an Admin can.
2. **Mark the heads.** On a person's Details tab, turn on *Is a head*. A head
   can hand his own cash to his people and see what they spent — nothing
   more.
3. **Put people under their head.** On each worker's Details tab, set *Works
   under*. Only then does the head see them.
4. **Check the categories.** Settings → Expense Categories. Rename, hide or
   add whatever KBH actually files expenses under.
5. **Hand out cash.** Home → Money Given, choosing Cash in hand or Bank
   transfer each time.

## Opening it on a phone

While this computer is on and on the same Wi-Fi:

```bash
node scripts/serve-dist.mjs
```

It prints the address to type into the phone, something like
`http://192.168.8.62:5050`. The files never leave this computer; the phone
fetches them over the Wi-Fi.

To rebuild after a change:

```bash
npx expo export --platform web
```

For a link that works anywhere, away from this Wi-Fi, the built `dist`
folder needs a host (Vercel, Netlify, Cloudflare Pages or Expo's own
hosting). That is one upload; nothing in the app has to change.

## Still open

- **The bill reader.** Set `GOOGLE_VISION_API_KEY` as a Supabase secret and
  the app starts reading QR codes and VAT numbers off bill photos by itself.
  Until then every bill says "Petty (not checked)" rather than guessing.
- **Working without signal**, the Android file and web hosting — the last
  phase, not started.

## The tests

`tests/` holds five programs that sign in as real people and check the rules
against the live database. They expect the practice accounts, which are now
gone, so they will not pass until a set of test people exists again. Keep
them for the day you want to prove the rules still hold — and run them on a
test project, never on the company's real books.
