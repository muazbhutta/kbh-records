# What I tested while you were out, and what I fixed

Date: 14 Oct 2026

I signed in as every kind of person and went through the app page by page,
then wrote test programs that do the same checks against the live database
so you can run them again any time:

```bash
node tests/role-test.mjs
node tests/joined-up-test.mjs
node tests/reports-test.mjs .env
```

**186 checks, all passing.**

---

## The people I tested as

I added the three that were missing, so every kind of person now exists:

| Person | Mobile | PIN | What they are |
| --- | --- | --- | --- |
| Saleem | 0501234567 | 7391 | Owner + Admin |
| Nadeem Khan | 0505556677 | 8264 | Admin, **not** the owner |
| Ibrar Hussain | 0503334455 | 5163 | Sub-admin, and a head |
| Kamran Butt | 0506667788 | 3947 | Employee who is a head |
| Waqas Ali | 0507778899 | 5728 | Employee |
| Rana Ahmed | 0502223344 | 4821 | Employee |
| Ali Raza | 0504445566 | 6137 | Employee |
| Audit Test | 0508887766 | — | A turned-off account |

Change these PINs before the company starts using the app.

---

## Two serious holes, both closed

### 1. An employee could spend other people's money

Waqas could record a SAR 5,000 expense **on Rana's khata**. Rana's balance
dropped and Waqas's name was only in the small print. I proved it by doing
it, then closed it:

* the database now refuses any entry an employee writes into someone
  else's khata (`0015_employee_entry_guard.sql`);
* the Add Expense screen only offers the employee himself, and says
  "This comes out of your own cash".

An Admin and a Sub-admin can still record anything for anybody, as before.

### 2. Any admin could lock the owner out of his own account

The owner cannot be deleted, turned off, or taken off Admin — that was all
working. But **any Admin or Sub-admin could change the owner's mobile
number**. Change the number, and Saleem can no longer log in. That is
being turned off by another name. I did it by accident during the test and
had to put his number back.

Now only the owner can change the owner's own card — name, number, job
title, head settings. The buttons are gone from the screen for everyone
else, and the server refuses it even if someone goes around the screen.

---

## Other things I found and fixed

3. **"Looks right" did nothing.** On *Check Bill Type*, pressing
   "Looks right" said it was marked, but the expense stayed on the list
   for ever and still said "not checked". Fixed: when a person looks at a
   bill, that counts as the check (`0016_admin_check_closes_it.sql`).

4. **"Checking bill..." spun for ever.** With no bill-reading key set, every
   expense sat there saying it was being looked at. Now, after ten
   minutes, it says plainly **"Petty (not checked)"**.

5. **"Should be holding SAR 1,560.00"** was shown over a *minus* balance —
   it sent you off to count money that is not there. It now reads
   **"Company owes"**, in red, with "More was spent than was handed over".
   On an employee's own screen: "The company owes you".

6. **The change history was talking machine.** It printed things like
   `bill_scan_state: pending → done` and raw row ids. Now it reads
   "Bill reading: waiting → checked", "Bill type: Petty → Invoice", and a
   raw id turns into a name or "another entry".

7. **Settings still advertised "PDF reports — Soon"** although they are
   built. Removed, and the list is now in three groups: Company,
   Checks & history, Reports.

8. **Duplicate bill photos were a thin letterbox slice** — you could not
   tell two bills apart. The pictures are now bill-shaped.

9. **"Money Given" was cut to "Money Gi..."** on a phone. The label now
   wraps to two lines.

10. **The database could not be rebuilt.** `0001_people_and_auth.sql` — the
    file that creates people, roles and the PIN login — was an **empty
    file**. Everything else was in version control; that one was not. I
    read the real definitions back out of the live database and wrote the
    file properly. While doing it I also found the `anon` (not signed in)
    role still had blanket grants on the people table; row level security
    was already turning it away, but I removed them anyway
    (`0019_tighten_and_tidy.sql`).

---

## What I checked and found already correct

**Who can see what**

* An employee sees only money that touches him — his own khata, his own
  photos, his own entries. Nothing of a colleague's.
* An employee cannot: see the people list, open the dashboard figures, read
  the change history, the deleted entries, the duplicates list, the
  download log, or any report. Typing the address by hand gets him a
  plain "Only an Admin can..." message.
* An employee cannot hand himself cash, mark money returned, edit or
  delete anything, cancel an entry, change Petty to Invoice, record a cash
  check, or add a category.
* A **head of employees** who is an employee gets no extra power and does
  **not** see his team's money. Being a head is a label for the admin's
  dashboard. Tell me if you wanted it to be more than that.
* A Sub-admin can do everything an Admin can: reports, the audit log, the
  dashboard, adding and turning off people.
* Nobody, not even the owner, can read a PIN. Nobody can edit or delete a
  line of the change history or the download log.
* A bill photo has no public link and cannot be opened without signing in.
* A wrong PIN, an unknown number and a turned-off account are all refused.

**Do the screens agree with each other**

Every balance equals given + received − sent − spent − returned. Every
riyal handed between staff was received by someone. The dashboard's "cash
with people" is exactly the positive balances; "owed back" is exactly the
negative ones. The all-time report equals the dashboard's expenses. Petty
plus Invoice equals the whole. One person's report equals what the People
list says they spent. Each team's cash equals its members'. The photo ZIP
carries exactly the photos the report counted. Nothing cancelled or
deleted leaks into any of it.

**On screen**

Every page checked on a wide screen and at phone width (375px): the
dashboard and all six of its sections, People, a person's khata and
details, Add Expense, Money Given, Cash Check, the entry page, Reports,
Check Bill Type, Suspected Duplicates, Change History, Deleted Entries,
Categories, Settings and the login. I also saved a real Money Given and a
real Cash Check through the screens and watched the figures move
correctly, then took them back out again.

---

## Still waiting on you

* **The Google Vision key.** Until it is set, bills are not read
  automatically and say "(not checked)". There are 11 old ones waiting.
* **Rotate the `sb_secret_` key** at
  https://supabase.com/dashboard/project/isiyzvpjajhkrzkdpsed/settings/api-keys
  It was pasted into a file once and should not be trusted.
* **Step 5 of the add-on** (the safety sweep) — not started, as agreed.
* **Phase 6** of the first plan (working offline, the Android file, putting
  the web app online) — not started.
* **Test data.** The books still hold the practice entries, 19 deleted
  ones, and five turned-off "Made By Sub" accounts from a test. `SETUP.md`
  has the wipe for when you are ready to start for real.
