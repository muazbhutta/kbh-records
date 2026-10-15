# KBH Records

Cash record keeping for **KBH Construction**, Jeddah. One codebase for **Android, iPhone and
Web**: every riyal the owner hands out is tracked against the person holding it, with a bill
photo behind every expense.

> **Phases 1 to 4 are done: login and roles, the whole money model, the controls on top, and
> the owner's dashboard.** PDF reports come next.
> See [SETUP.md](SETUP.md) for how to set it up and test everything.

---

## Stack

| Piece | Choice |
|---|---|
| App | Expo (React Native) + Expo Router + TypeScript, `react-native-web` for the browser |
| Backend | Supabase: Postgres, Row Level Security, Storage, Edge Functions (Deno) |
| Data layer | TanStack Query |
| Money | SAR only, `SAR 1,250.00` |
| Time | Asia/Riyadh, `11 Oct 2026` and `08:21 PM` |
| Theme | Light only. Navy `#0E2340`, amber `#F2A900`, green in, red out |

## Running it

```bash
npm install
```

Create `.env` from `.env.example` and fill in the two values from your Supabase project, then:

```bash
npx expo start
```

Press `w` for the browser, `a` for Android, or scan the QR code with Expo Go on an iPhone.

| Command | What it does |
|---|---|
| `npm run start` | Dev server for all three platforms |
| `npm run web` | Browser only |
| `npm run android` | Android emulator or attached phone |
| `npm run ios` | iOS simulator (needs a Mac) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build:web` | Static web build into `dist/` |
| `npm run functions:deploy` | Pushes both Edge Functions to Supabase |

## Layout

```
app/                      screens (file = route, Expo Router)
  (auth)/login.tsx        mobile number + 4-digit PIN
  (auth)/setup.tsx        one-time "Create Owner Account"
  (main)/_layout.tsx      bottom tabs on phones, left sidebar on desktop
  (main)/index.tsx        home: cash in hand for staff, the dashboard for an Admin
  (main)/khata.tsx        My Khata: my entries, with filters
  (main)/entry/new.tsx    add Money Given / Transfer / Expense / Returned
  (main)/entry/[id].tsx   one entry, with its bill photos
  (main)/people/          list with balances, add person, person khata
  (main)/entry/edit.tsx   an Admin changes a saved entry
  (main)/categories.tsx   add, rename or hide expense categories
  (main)/history.tsx      Change History: who changed what, and when
  (main)/deleted.tsx      deleted entries, and putting one back
  (main)/settings.tsx
src/
  api/                    TanStack Query hooks (people, entries, categories)
  auth/AuthProvider.tsx   session, profile, login, logout
  components/             Button, Field, PinPad, pickers, EntryRow, Money, ...
  lib/                    supabase client, photos, money and date formatting
  lib/database.types.ts   generated from the live schema, so queries are typed
  theme/                  brand colours, spacing, shadows
supabase/
  migrations/             SQL, in order. 0001 people, 0002 money, 0003 control, 0005 teams
  functions/pin-auth/     public: owner setup + PIN login
  functions/manage-users/ admin only: add person, edit, reset PIN, turn off
assets/                   logo, app icon, splash, generated from the KBH logo
```

## How login works

There is no email and no password screen. A person logs in with their **Saudi mobile number and
a 4-digit PIN**.

1. The app sends the mobile number and PIN to the `pin-auth` Edge Function.
2. The function looks the person up, checks the lockout, and compares the PIN against a
   **bcrypt hash** held in `public.user_secrets` — a table with Row Level Security on and no
   policies at all, so no API key except the server's own `service_role` can read it.
3. On a match it mints a real Supabase session with a long random password that only the server
   ever sees, and hands the session back to the app.
4. The app keeps that session on the device, so people stay logged in until they press Log out.

**5 wrong PINs locks the account for 15 minutes.** Every attempt, good or bad, is written to
`public.login_attempts`.

## The money model

```
Balance = Money Given + Transfers In - Transfers Out - Expenses - Returned
```

A negative balance means the person spent more than they were given, and the app says
**"Company owes"** in red.

A transfer is stored **once**: the row names the sender and the receiver. A database view then
shows it in both khatas — *"Sent to Ibrar"* on one side, *"Received from Rana"* on the other — so
the two halves can never disagree. Every total is worked out in SQL, never on the phone.

| Entry | Who can record it |
|---|---|
| **Money Given** | Admin, Sub-admin |
| **Transfer** | the sender, or an Admin |
| **Expense** | anyone, for themselves or for a colleague — needs a category and at least one bill photo |
| **Returned** | Admin, Sub-admin |

Bill photos are shrunk to 1600px JPEG on the phone, stored in a **private** bucket with a small
thumbnail for lists, and shown through short-lived signed links. A SHA-256 of each photo is saved
so Phase 3 can warn when the same bill is used twice.

## Keeping it honest

Nothing is ever really removed. A delete hides the entry and takes it out of the balances; the
row stays, and an Admin can put it back from **Deleted entries**.

**Every** create, edit and delete is written to `public.audit_log` by a Postgres trigger — who,
when, and old value → new value. The log is **append-only**: a trigger refuses any update or
delete on it, even from an Admin. Admins read it on the **Change History** screen, filtered by
person, period or kind, and each entry also shows its own history.

**Who entered an entry, and when, can never be changed** — not by an Admin, not through the API.
A trigger puts the old values back on every update.

A bill photo that has been seen before raises a warning before saving (*"already used on 14 Oct
by Rana — SAR 120"*), as does the same amount on the same day for the same person. Saving anyway
is allowed, and the entry is then flagged **Duplicate photo** for admins.

### Cash Check

A balance says what someone *should* be holding. A **Cash Check** records what they *really* had.
An Admin opens a person, counts the cash and types the real amount; the app saves expected,
counted, difference, who checked and the server time, and reports **Matched**, **Short** or
**Extra**. The expected figure is read on the server at that moment, so it cannot be typed in or
tampered with. A Cash Check never changes a balance — to settle a difference, the Admin adds a
normal entry with a note. It can never be edited, only removed by an Admin, and that removal
goes to the change history too.

## The dashboard

The Admin home is the dashboard, filtered by **This month / Last month / This year / All time /
Custom**. The hero number is **Cash with people** — the sum of every positive balance right now —
with Money Given, Expenses and Returned for the period underneath.

Three charts, all worked out in SQL and drawn with `react-native-svg` so they look the same on a
phone and in a browser:

- **Expenses per month**, the last 12 months. One series, so one colour and no legend; tap a bar
  to read its figure.
- **Expenses by category**, a donut. Its colours are a fixed, never-cycled order checked for
  colour-blind separation, and every slice is also named with its figure in the legend, so the
  colour is never the only thing telling two categories apart. A ninth category folds into
  "Other" rather than inventing a colour.
- **Who is holding the most cash**, the top five, with the figure written on every bar.

Plus a **Cash check** card (short in the period, how many people are short, and who has not been
counted for over 30 days) and the last ten entries with their **Duplicate photo** and
**Entered by someone else** flags.

**Record cash** is always on screen, because that is what an Admin opens the app to do. Every
other section folds away with the arrow on its heading, and a folded heading still carries a
one-line summary (*"1 short · SAR 230.00"*). **Hide all** / **Show all** does the lot. The choice
is kept on the device, so the dashboard opens the way it was left.

## Heads and teams

A person can be marked as a **head**, and other people put **under** that head. The dashboard
then shows one row per head — *"Ibrar Hussain · 2 people under them · SAR 2,152.00 team cash"* —
and the People screen shows **Head · 2** on the head and *under Ibrar* on their team.

The database refuses anything that would not make sense: a person cannot be their own head, a
team cannot loop back on itself, only somebody marked as a head can be chosen, and a head who
still has people under them cannot stop being a head until the team is moved.

## Who can do what

| | Admin | Sub-admin | Employee |
|---|---|---|---|
| See everyone's records | yes | yes | no |
| Add, edit, delete any entry | yes | yes | adds their own only |
| Add people and change roles | yes | yes | no |
| Reset someone's PIN | yes | yes | no |
| Turn an account off | yes | yes | no |

One account is the **Owner** (Saleem). The database itself refuses to delete it, turn it off, or
make it anything other than an Admin — not just the screens. Only the Owner can change the Owner
PIN. **Nobody is ever deleted**: a person who leaves is turned off, and every record and report
keeps their name.

## Build phases

- [x] **1. Setup and login** — schema, RLS, PIN login, Owner setup, people and roles
- [x] **2. Entries and khata** — Money Given, Transfer, Expense with bill photos, Returned, balances
- [x] **3. Control** — admin edit/delete, audit log, duplicate photo check, Cash Check
- [x] **4. Dashboard** — cards and charts, plus heads and teams
- [ ] **5. PDF reports** — one person and all people
- [ ] **6. Polish and launch** — offline retry, speed, Android APK, web deployment
