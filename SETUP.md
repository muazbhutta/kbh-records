# Phase 1 — set up and test

Follow this once. It takes about 15 minutes. Everything after this is just `npx expo start`.

---

## Step 1 — Make the Supabase project

1. Go to <https://supabase.com/dashboard> and press **New project**.
2. Name it `kbh-rms`. Use a **new, separate project** — not the Ghar Ka Hisaab one.
3. **Region: `Middle East (Bahrain) me-south-1`.** This is the closest region to Jeddah, so the
   app feels fast on site.
4. Save the database password somewhere safe. You will not need it for the app.
5. Wait for the project to finish building (about two minutes).

## Step 2 — Create the tables

> **Already done on this machine.** `0001` to `0006` are applied to
> `isiyzvpjajhkrzkdpsed`. From now on, new migrations go up with
> `npx supabase db push`. The steps below are what to do on a fresh project.


1. In the project, open **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_people_and_auth.sql` from this folder, copy **all** of it, and
   paste it into the editor.
3. Press **Run**. You should see `Success. No rows returned`.

This creates:

| Thing | What it is |
|---|---|
| `app_users` | one row per person: name, mobile, role, owner flag, active flag |
| `user_secrets` | the bcrypt PIN hash and the lockout counters — server only |
| `login_attempts` | every login try, good or bad |
| `people_list` | the view the People screen reads |
| Row Level Security | employees see only their own row, admins see everyone |
| Guard triggers | nobody can be deleted, and the Owner cannot be turned off or downgraded |

Then do the same with `supabase/migrations/0002_entries_and_khata.sql`, which adds:

| Thing | What it is |
|---|---|
| `entries` | the four entry types, with the server clock stamp frozen |
| `entry_photos` | bill photos, with a SHA-256 of each one |
| `expense_categories` | Material, Transport, Fuel, Labour, Food, Tools, Other |
| `entry_lines`, `person_totals`, `entry_feed` | the views that work out every balance in SQL |
| `create_entry` | saves an entry and its photos in one transaction |
| `bills` storage bucket | private, read through short-lived signed links |

Then `0003_control_and_cash_check.sql` and `0004_audit_actor.sql`, which add:

| Thing | What it is |
|---|---|
| `audit_log` | every create, edit and delete, with old value → new value. Append only |
| soft delete | `delete_entry` / `restore_entry`, with a reason, plus `deleted_entries` |
| `update_entry` | an Admin edits a saved entry; who entered it and when stay frozen |
| `check_duplicates` | the warning shown before a bill is saved twice |
| `cash_checks` | expected / counted / difference, worked out on the server |

## Step 3 — Turn off public sign-ups

Still in Supabase: **Authentication** → **Sign In / Providers** → **Email**.

- Leave the **Email** provider **enabled** (the app uses it internally; no mail is ever sent).
- Turn **Allow new users to sign up** **off**.

Only an Admin inside the app can create accounts. This stops anyone from making one from outside.

## Step 4 — Deploy the two Edge Functions

These hold the PIN checking and the account management. They run on Supabase, not on the phone.

In a terminal, in this project folder:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref isiyzvpjajhkrzkdpsed
```

> This is the project you already created: 

```bash
npm run functions:deploy
```

If that last one fails, run the two by hand:

```bash
npx supabase functions deploy pin-auth --no-verify-jwt
```

```bash
npx supabase functions deploy manage-users
```

> `pin-auth` must be deployed with `--no-verify-jwt`, because logging in happens *before* there
> is a session.

## Step 5 — Point the app at your project — ALREADY DONE

`.env` is filled in with your Project URL and your **publishable** key:

```
EXPO_PUBLIC_SUPABASE_URL=https://isiyzvpjajhkrzkdpsed.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

> Never put the **secret** key (`sb_secret_...`, the old `service_role`) in `.env` or in
> `.env.example`. It ignores Row Level Security, so anyone holding it can read and change
> everything. Supabase hands it to the Edge Functions by itself; it never goes near the app.

## Step 6 — Run it

```bash
npm install
```

```bash
npx expo start --clear
```

Then press **`w`** for the browser, **`a`** for Android, or scan the QR code with the **Expo Go**
app on an iPhone.

---

# How to test Phase 1

Work down this list. Each line should behave exactly as written.

## A. First run and the Owner

1. Open the app on an empty database. It goes straight to **Create Owner Account** — there is no
   way to reach the login screen first.
2. Enter `Saleem`, mobile `0501234567`, job title `Owner`, press **Next**.
3. Choose a PIN, for example `7391`, then type it again. (`1234` and `0000` are refused on
   purpose — too easy to guess.)
4. You land on **Home** as `Saleem · Owner · Admin`.
5. Close the app completely and open it again. **You are still logged in.** No PIN asked.

## B. Login

1. **Settings → Log out.**
2. The login screen now shows the mobile number you used last time, already filled in.
3. Type the **wrong** PIN. It says *"Wrong PIN. 4 tries left before the account locks."* and the
   dots shake.
4. Get it wrong five times in a row. It says *"Too many wrong PINs. This account is locked for
   15 minutes."* and the right PIN stops working too until the 15 minutes are up.
5. Try a mobile number nobody has: *"This mobile number is not registered."*
6. Log back in with the right PIN after the lock expires, or reset the clock from the SQL editor:
   ```sql
   update public.user_secrets set failed_attempts = 0, locked_until = null;
   ```

## C. Adding people

1. **Home → Add Person.** Add:
   - `Rana Ahmed`, `0502223344`, **Employee**, PIN `4821`
   - `Ibrar Hussain`, `0503334455`, **Sub-admin**, PIN `5163`
2. Try to add someone with Rana's number again: *"Someone already uses this mobile number."*
3. Try `055` or a 9-digit number: the **Next** / **Save** button refuses it.
4. **People** now lists three people with their roles. Search `rana` — only Rana is shown.

## D. Roles

1. Log out, log in as **Rana** (`0502223344` / `4821`).
2. The bottom bar has only **Home** and **Settings** — no People tab.
3. In the browser, type `/people` in the address bar by hand: Rana gets
   *"Only an Admin can see the people list."* The database refuses the data as well, not just
   the screen.
4. Log out, log in as **Ibrar** (Sub-admin). Ibrar has the full People tab and can add people and
   change roles, exactly like an Admin.

## E. Owner protection

Log back in as Saleem, then open **People → Saleem**:

1. There is no *Turn Off Account* button — only the note that the Owner can never be turned off.
2. In **Edit Details** the role picker is replaced by *"The Owner always stays an Admin."*
3. Now prove it is the database and not the screen. In the Supabase **SQL Editor**:
   ```sql
   update public.app_users set is_active = false where is_owner;
   -- ERROR: The Owner account cannot be disabled.

   update public.app_users set role = 'employee' where is_owner;
   -- ERROR: The Owner account must stay an Admin.

   delete from public.app_users;
   -- ERROR: People are never deleted in KBH Records. Disable the account instead.
   ```
   All three must fail.

## F. Turning an account off

1. **People → Rana → Turn Off Account.**
2. Rana now shows an **Off** badge, and disappears from the list unless you tick
   *"Also show accounts that are turned off"*.
3. Log out and try to log in as Rana: *"This account is turned off. Ask the owner to turn it
   back on."*
4. If Rana was still logged in on another device, that device drops to the login screen the next
   time it loads, because Row Level Security stops a turned-off account reading anything.
5. Turn Rana back on and log in again. Everything is back, nothing was lost.

## G. Resetting a PIN

1. **People → Rana → Reset PIN.** Set `9042`, type it again, save.
2. Rana's old PIN no longer works; `9042` does.
3. Open **Saleem** as Ibrar the Sub-admin and press **Reset PIN**: *"Only the Owner can change
   the Owner PIN."* Nobody can take the Owner's account.

## H. Editing someone

1. **People → Rana → Edit Details.** Change the name and the job title, save. The list updates.
2. Change Rana's mobile number to `0509998877` and save. Rana now logs in with the **new** number
   and the same PIN.
3. Open your own profile. The role picker says *"You cannot change your own role"*, and there is
   no way to turn your own account off — so an Admin can never lock themselves out.

## I. The three platforms

| Where | What to check |
|---|---|
| **Web** (`w`) | Wide window: navy sidebar on the left. Narrow the window past about 900px: it turns into the phone layout with a bottom bar. |
| **Android** (`a`) | Bottom tab bar, big PIN pad, keyboard pushes the form up instead of covering it. |
| **iPhone** (Expo Go) | Same, and the notch and home bar are respected. |

The logo, app icon and splash screen are all generated from the real KBH logo.

---

# How to test Phase 2

## J. The example from the brief

Log in as the Owner and record these three, then check the three balances.

1. **Home → Money Given**, SAR 500 to Rana. Save.
2. Log out, log in as **Rana**. **Send Money**, SAR 100 to Ibrar. Save.
3. **Send Money** again, SAR 200 to Ali. Save.

| Person | Balance should be |
|---|---|
| Rana | SAR 200.00 |
| Ibrar | SAR 100.00 |
| Ali | SAR 200.00 |

Open Rana's khata: the two transfers read **"Sent to Ibrar"** and **"Sent to Ali"**, in red.
Open Ibrar's: the same money reads **"Received from Rana"**, in green. One entry, both khatas.

## K. Cash in hand

As Rana, the home screen shows one big card: **Cash in hand** with Given, Spent and Returned
underneath, then the two big buttons **Add Expense** and **Send Money**, then her recent entries.
The numbers come from the database, not the phone.

## L. An expense with a bill

1. As Rana: **Add Expense** → SAR 60 → **Fuel** → **Take Photo** (or **From Gallery**).
2. Try to save without a photo first: *"A bill photo is required."* The database refuses it too,
   not just the screen.
3. Add the photo and save. Her balance drops by 60 and the entry shows a thumbnail and a
   **1 bill** badge.
4. Tap the entry, then tap the bill: it fills the screen. Pinch or double tap to zoom.

## M. Entering for someone else

As Ibrar (Sub-admin): **Add Expense**, change **For** to **Ali**, pick Material, SAR 45, add a
photo, save. Now log in as **Ali**: the expense is in *his* khata with a blue
**"Entered by Ibrar"** badge, and it came off *his* balance, not Ibrar's.

## N. What an Employee may not do

As Rana, in the browser address bar:

- `/entry/new?type=money_given` → *"Only an Admin can record this kind of entry."*
- `/entry/new?type=returned` → same.

She also cannot send someone else's cash: on **Send Money** the **From** field is locked to her.

## O. Bad input

| Try | What should happen |
|---|---|
| Amount `0` or empty | *"Enter an amount bigger than zero."* |
| A date after today | the calendar will not let you tap it |
| Send money to yourself | you cannot pick yourself in **To** |
| Six photos | the buttons disappear at five |

## P. Categories

**Settings → Expense Categories.** Add one, rename one, hide one. A hidden category disappears
from Add Expense but old entries keep it. Try to delete a category that has been used: the
database refuses, and tells you to hide it instead.

## Q. Privacy of the bills

The bucket is private. Open a bill's storage path directly in a browser with no session: it
refuses. One employee cannot open another employee's bill. An Admin can open any of them.

---

# How to test Phase 3

## R. An Admin edits an entry

1. Open any entry → **Edit Entry**. Change the amount and save.
2. The balance follows the change straight away.
3. **Saved at** still shows the original time. Who entered it and when can never be moved —
   not from the screen, not from the API.
4. On the entry, open **History**: *Amount ~~SAR 25.00~~ → SAR 30.00, Saleem, 12 Oct 2026*.

## S. Delete and put back

1. **Delete Entry** → type a reason → **Yes, Delete It**.
2. It leaves the balance and the khata at once.
3. **Settings → Deleted Entries**: it is still there, with who deleted it and why.
4. **Put It Back**: the balance comes back. Both the delete and the restore are in the history.
5. Nobody, not even an Admin, can really remove it. From the SQL editor:
   ```sql
   delete from public.entries;    -- removes nothing
   ```

## T. Change History

**Settings → Change History.** Filter by person, by period, and by what changed
(Entries / Cash Checks / People / Categories). Each line reads: what happened, whose khata, the
old value crossed out, the new value, who did it and when.

Then prove it cannot be touched, in the SQL editor:

```sql
update public.audit_log set summary = 'nope';   -- ERROR: cannot be edited
delete from public.audit_log;                   -- ERROR: cannot be edited
```

An Employee opening `/history` gets *"Only an Admin can see the change history."*

## U. The same bill twice

1. As any person: **Add Expense**, pick a bill photo you have already used, and save.
2. A dialog appears: *"This bill photo was already used on 11 Oct by Rana Ahmed — SAR 60."*
3. **Save Anyway** is allowed — the owner decides, not the app.
4. Open the saved entry as an Admin: it carries a **Duplicate photo** flag and a warning banner.
5. The same amount on the same day for the same person raises the same kind of warning.

> This one needs a real photo, so test it on a phone rather than in a browser.

## V. Cash Check

1. **People → Rana → Cash Check** (or the **Cash Check** tab → *Run a Cash Check*).
2. The dialog shows **Should be holding**. Type what you actually counted.
3. Below the box it already says **Short: SAR 30.00**, **Extra: SAR 20.00** or **Matched**,
   before you even save.
4. Save. The result screen shows expected, counted and the difference, and says plainly that
   this does not change the balance.
5. Check the balance: **it has not moved**. That is the point — to settle a difference the Admin
   adds a normal entry with a note.
6. The **Cash Check** tab now shows *Checks 2 · Short 2 · Total short SAR 80.00* and every count.
7. **People** shows the last result next to each person: *Matched*, *Short: SAR 50.00*,
   *Extra: SAR 20.00*, or *Never counted*.
8. An Employee cannot run one, and cannot see anybody else's.
9. Nobody can edit a count. From the SQL editor:
   ```sql
   update public.cash_checks set counted = 9999;  -- ERROR: cannot be changed
   ```
   An Admin can remove a wrong one, and that removal goes to the change history.

---

# How to test Phase 4

## W. The dashboard

Log in as an Admin. The home screen is the dashboard.

1. The chips at the top switch the period: **This month / Last month / This year / All time /
   Custom**. Pick **Custom** and two date pickers appear.
2. The big navy card is **Cash with people** — every positive balance added up, right now — with
   Given, Spent and Returned for the chosen period under it.
3. **Expenses per month** shows the last 12 months. Tap any bar and the figure above it changes
   to that month.
4. **Expenses by category** is a donut. Tap a slice, or its line in the legend, and the middle
   shows that category and its share. Every slice is also written out with its amount, so it
   reads fine in black and white.
5. **Who is holding the most cash** lists the top five. Tap one to open that person.
6. The **Cash checks** card shows what is short in the period and who has not been counted for
   over 30 days. Tap a name to go and count them.
7. **Recent activity** is the last ten entries, flagged where a bill photo is a duplicate or
   somebody entered for somebody else.
8. Tap any heading, or its arrow, to fold that section away. **Record cash** has no arrow on
   purpose: the four buttons stay on screen whatever else is folded. A folded heading still shows a
   one-line summary, so nothing disappears completely. **Hide all** / **Show all** folds the
   whole screen at once.
9. Close a couple of sections, then close the app and open it again: it comes back exactly as
   you left it. The choice is kept on that device, so each person can set up their own view.

## X. Heads and teams

1. **People → Ibrar → Details → Edit Details.** Tick **"This person is a head"** and save.
   His profile now shows **Head · 0 people**.
2. **People → Rana → Details → Edit Details → Works under → Ibrar.** Save. Rana's profile now
   shows **Under Ibrar Hussain**, and the People list says *under Ibrar Hussain* beneath her
   number.
3. Do the same for another person. Ibrar now shows **Head · 2**, and the dashboard grows a
   **Teams** section: *"Ibrar Hussain · 2 people under them · SAR 2,152.00 team cash"*.
4. You can also set all of this while adding a new person.
5. The database refuses the silly cases, with a plain message each time:

   | Try | What it says |
   |---|---|
   | Put someone under themselves | *A person cannot work under themselves.* |
   | Put a head under their own team member | *That would put the team in a circle.* |
   | Choose somebody who is not a head | *That person is not a head.* |
   | Un-tick "is a head" while people are under them | *2 people work under this head. Move them to another head first.* |

---

## If something goes wrong

| What you see | What it means |
|---|---|
| *"This app is not connected to its database yet"* | `.env` is missing or empty. Fill it in and restart with `npx expo start --clear`. |
| *"No internet connection. Please try again."* on login | The Edge Functions are not deployed yet, or the project ref in the link step was wrong. Re-run Step 4. |
| *"Could not start your session."* | The **Email** provider is turned off in Supabase. Turn it back on (Step 3) — keep sign-ups off. |
| Login works but the People screen is empty for an Admin | The SQL from Step 2 did not finish. Re-run it; it is safe to run twice. |
| Edge Function errors | `npx supabase functions logs pin-auth` shows the server side. |
| A bill photo will not upload | The phone blocked the camera or photos. Turn them on for KBH Records in the phone settings. |
| Balances look wrong | They are worked out in SQL. `select * from public.people_list;` in the SQL editor shows the same numbers the app shows. |
| The history says "System" did it | Re-deploy the functions: `npm run functions:deploy`. The Admin's name comes from their own session token. |
| A Cash Check looks wrong | It is a snapshot of that moment. Counts are never edited; remove it and run a new one. |

## Starting over

To wipe the people and do the first-run setup again:

```sql
-- Supabase SQL editor. This removes every person, including the Owner.
alter table public.app_users disable trigger app_users_guard_trg;
delete from public.app_users;
alter table public.app_users enable trigger app_users_guard_trg;
delete from auth.users;
delete from public.login_attempts;
```

Then log out in the app (or clear the browser site data) and it will offer **Create Owner
Account** again.
