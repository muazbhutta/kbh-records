# Tests

These run against the **live** Supabase project, signing in as real people
with their PINs, exactly the way the app does. They clean up after
themselves, but they do write to the database, so run them on the test
project, not on a company's real books.

Run them from the project root:

```bash
node tests/role-test.mjs
node tests/team-test.mjs
node tests/category-filter-test.mjs
node tests/joined-up-test.mjs
node tests/reports-test.mjs .env
```

| File | What it proves |
| --- | --- |
| `role-test.mjs` | What each kind of person may and may not do: owner, admin, sub-admin, a head, an employee, and a turned-off account. |
| `team-test.mjs` | Cash in hand vs Bank transfer on every handover, and what a head of employees may do: pay his own people, watch their spending, and reach nothing else. |
| `category-filter-test.mjs` | Narrowing a report to one category, and to Petty or Invoice inside it: the rows, the money, the photo ZIP and the download log all follow the same filter. |
| `joined-up-test.mjs` | The dashboard, the People list, each khata, the teams and the reports all count the same money and land on the same figures. |
| `reports-test.mjs` | The three PDFs and the photo ZIP: who may take them, that the totals agree, that a cancelled expense leaves them, and that the download log cannot be rubbed out. |

They need these accounts to exist (`lib.mjs` has the numbers):

| Person | Role |
| --- | --- |
| Saleem | Owner + Admin |
| Nadeem Khan | Admin, not the owner |
| Ibrar Hussain | Sub-admin, and a head |
| Kamran Butt | Employee who is a head |
| Waqas Ali, Rana Ahmed, Ali Raza | Employees |
| Audit Test | A turned-off account |
