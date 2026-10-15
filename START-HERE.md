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

## Installing it on a phone or a desktop

The app installs like a real app — its own icon, no browser bar around it.

### Over the office Wi-Fi, right now

While this computer is awake and on the same Wi-Fi:

```bash
npm run serve
```

It prints the address, something like `http://192.168.8.62:5050/kbh-records/`.

* **iPhone, Safari** — open it, then Share → *Add to Home Screen*. It
  installs and opens without the browser bar.
* **Android and desktop Chrome** — it opens and works, but Chrome will not
  offer *Install* from a plain `http` address. For that it needs https,
  which is the next part.

### On the internet, so it installs everywhere

The site is already built and staged. One command puts it on GitHub Pages,
which is free and gives an https address:

```bash
gh auth login                                    # pick the account to publish under
node scripts/publish-to-github.mjs MananBhutta   # creates the repo, pushes, switches Pages on
```

It ends up at `https://mananbhutta.github.io/kbh-records/`. From there:

* **iPhone, Safari** — Share → *Add to Home Screen*
* **Android, Chrome** — menu → *Install app*
* **Desktop Chrome / Edge** — the install icon at the right of the address bar

The repository has to be **public**, because Pages is only free that way.
Nothing secret goes into it: `.env` is ignored, and the Supabase key that
does ship is the publishable one that every web app carries. The money, the
people and the bill photos live in Supabase, behind the PIN login.

### After any change

```bash
npm run build:web     # rebuild
npm run pages         # stage the built site
npm run publish:github MananBhutta
```

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
