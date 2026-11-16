# CabTrack — Daily Cab & Driver Tracking

CabTrack tracks every cab and driver every day: who is on duty, when the duty
started and ended, late arrivals, early Duty OFF, leave, and absences. Drivers
record their own Duty ON / OFF / LEAVE from their phone with a link or QR code,
and the owner sees everything live on the dashboard.

Contents

1. [What the application does](#1-what-the-application-does)
2. [What data is stored (the database)](#2-what-data-is-stored-the-database)
3. [Where your real data is right now](#3-where-your-real-data-is-right-now)
4. [Run it on your computer in VS Code](#4-run-it-on-your-computer-in-vs-code)
5. [Move your data into your own computer](#5-move-your-data-into-your-own-computer)
6. [Daily use](#6-daily-use)
7. [Deploy it online (so drivers can open the link)](#7-deploy-it-online-so-drivers-can-open-the-link)
8. [Security: PIN, recovery code and driver link](#8-security-pin-recovery-code-and-driver-link)
9. [Project structure](#9-project-structure)
10. [Tests](#10-tests)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What the application does

| Page | What you do there |
| --- | --- |
| **Dashboard** | Today's summary, live updates from drivers, data-quality warnings, cab status cards |
| **Daily Attendance** | Edit each cab's day and night row: status, driver, actual in/out time |
| **Reports** | Daily report (with WhatsApp / CSV / print) and date-range report |
| **Driver Form & Link** | Turn the driver form ON/OFF, send links, print QR stickers, set the Admin PIN |
| **Cabs** | Add cabs, owner, day/night driver, timings, shift ON/OFF, quick driver set |
| **Drivers** | Add drivers, phone, licence, regular cab |
| **Upload Data** | Import Excel / CSV sheets, re-process old uploads, download a full backup |
| **Automation** | Generate daily sheets, backfill, clear attendance only |

Driver side (`/driver`, mobile friendly, no login):

1. Open the link or scan the QR code.
2. Enter the cab number (full number, last 4 digits, or the driver's mobile).
3. See the cab, the regular driver and the shift timing.
4. Tap **DUTY ON**, **DUTY OFF** or **LEAVE**, optionally add a note, then Submit.

The time is taken from the server, so the driver cannot type a wrong time.

Automatic behaviour:

- Duty ON after the scheduled start → **late** minutes are calculated.
- Duty OFF before the scheduled end → **early OFF** alert.
- Duty OFF after the scheduled end → **overtime** is calculated.
- A shift that has not started Duty ON 30 minutes after its start → **"not reported"** alert (only for cabs whose drivers use the form).
- Night shifts that cross midnight are calculated correctly.

---

## 2. What data is stored (the database)

CabTrack uses **PostgreSQL**, a relational database. Everything is saved in
these tables. Times are in India time (IST) where relevant.

| Table | One row is… | Important columns |
| --- | --- | --- |
| `cabs` | one vehicle | `cab_number` (unique), `model`, `owner_name`, `status` (active / inactive / maintenance), `color` |
| `drivers` | one driver | `name`, `phone`, `license_number`, `license_expiry`, `status` (active / inactive) |
| `cab_shifts` | one cab × one shift (day or night) | `scheduled_in`, `scheduled_out` (the usual timing), `enabled` (does this shift run?), `default_driver_id` (the regular driver) |
| `attendance` | one cab × one date × one shift (the daily sheet row) | `status` (pending / present / absent / leave / half_day / off), `driver_id`, `actual_in`, `actual_out`, `late_minutes`, `early_off_minutes`, `overtime_minutes`, `reason`, `notes`, `source` (auto / manual / upload / driver) |
| `driver_submissions` | every Duty ON / OFF / LEAVE tap from the driver form | `action`, `actual_in`, `actual_out`, `note`, `date`, `shift_type` |
| `notifications` | one live alert on the dashboard | `type` (duty_on, late, duty_off, early_off, leave, not_reported), `title`, `message`, `read` |
| `uploads` | one imported file | `file_name`, counts of new / updated rows, `file_data` (the original file, so it can be processed again) |
| `app_settings` | key/value settings | driver form ON/OFF, driver link key, public URL, admin PIN hash, recovery code hash |

How the tables connect:

- A **cab** has two `cab_shifts` rows (day and night).
- Each `cab_shifts` row may point to one **driver** (the regular driver).
- Each **attendance** row belongs to one cab, one date and one shift. It can
  record which driver actually drove that day.
- A **driver submission** creates or updates one attendance row and creates
  one notification.

The `app_settings` table holds the **admin PIN hash** (not the PIN itself), a
salt, and the **recovery code hash**. The plain PIN and recovery code are never
stored, so they cannot be read from the database.

The **schema** (the table definitions) is in `src/db/schema.ts` and in the
generated file `schema.sql`.

---

## 3. Where your real data is right now

Your real data (27 cabs, 19 drivers, the daily attendance history and the
original uploaded sheet) lives in the **database of the preview sandbox**
where this app was built. It is **not** automatically copied to your computer.
A backup copy was saved in this project at:

- `.backups/cabtrack-data-latest.sql` — full PostgreSQL dump (tables + data).
  Keep it private: it contains the PIN hash and the recovery hash.

The easiest way to move the data is the **Full backup (Excel)** button
(section 5). That file does not contain the PIN.

---

## 4. Run it on your computer in VS Code

### 4.1 Install the tools (one time)

1. **Node.js 22 LTS** (or any version 20.9 or newer): https://nodejs.org
   Check: open a terminal and run `node -v` and `npm -v`.
2. **PostgreSQL 15 or 16**:
   - Windows: https://www.postgresql.org/download/windows/ (EDB installer). Remember the password you set for the `postgres` user. Keep the default port 5432.
   - macOS: `brew install postgresql@16` then `brew services start postgresql@16`
   - Ubuntu / Debian: `sudo apt install postgresql` then `sudo service postgresql start`
3. **VS Code**: https://code.visualstudio.com (optional extensions: *ESLint*, *Tailwind CSS IntelliSense*, *PostgreSQL* by Chris Kolkman).

### 4.2 Create the database

Option A — terminal:

```bash
psql -U postgres -h localhost -c "create database cabtrack;"
```

Option B — pgAdmin (installed with PostgreSQL): right-click *Databases* → *Create* → name it `cabtrack`.

### 4.3 Open the project in VS Code

1. Unzip the project folder (or copy it from the sandbox download).
2. VS Code → **File → Open Folder…** → select the `cabtrack` folder.
3. Open the terminal: **Terminal → New Terminal** (`` Ctrl+` `` / `` Cmd+` ``).

### 4.4 Create your `.env` file

1. Copy `.env.example` to a new file named `.env` in the project root.
2. Set your connection string (replace `YOUR_PASSWORD`):

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/cabtrack
```

`.env` contains your password, so it is listed in `.gitignore` and must never
be committed to GitHub.

### 4.5 Install packages and create the tables

```bash
npm install
npx drizzle-kit push
```

`drizzle-kit push` creates all tables from `src/db/schema.ts`. You can run it
again any time; it only adds what is missing.

Alternative (same result): `psql "postgresql://postgres:YOUR_PASSWORD@localhost:5432/cabtrack" -f schema.sql`

### 4.6 Start the app

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. Stop the server with `Ctrl+C`.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build (run this before deploying) |
| `npm start` | Run the production build locally (run `npm run build` first) |
| `npx tsc --noEmit` | TypeScript check |
| `npx drizzle-kit push` | Create or update tables after a schema change |

---

## 5. Move your data into your own computer

1. In the **preview / current app**, open **Upload Data → ⬇️ Full backup (Excel)**. A file `cabtrack-backup-YYYY-MM-DD.xlsx` downloads. It contains three sheets: `Cabs`, `Drivers`, `Attendance`.
2. In your **local app** (`http://localhost:3000`), open **Upload Data**.
3. Drag the backup file into the upload box → **Preview** → check the counts → **Save to database**.
4. Open the **Dashboard**, **Cabs** and **Drivers** pages to check everything came across.

Notes:

- Uploading the same file again does not create duplicates; rows are updated.
- The backup does **not** include the admin PIN. Set a new PIN on your local app (section 8).
- The original uploaded sheets (for example `cabs detils .xlsx`) are stored inside the uploads table and can be processed again from the Upload history.
- Alternative: restore the full SQL dump with `psql "postgresql://postgres:YOUR_PASSWORD@localhost:5432/cabtrack" -f .backups/cabtrack-data-latest.sql` (this also restores the PIN, so you can keep the same PIN).

---

## 6. Daily use

1. **Morning:** open the Dashboard. The daily sheet is created automatically when you open the Attendance page.
2. **During the day:** drivers tap Duty ON / OFF on the form. Alerts appear in the 🔔 bell and as pop-ups.
3. **Check missing entries:** the Dashboard's *Data check* box lists cabs without a driver and slots still pending.
4. **Fill gaps manually:** Daily Attendance → edit the row → Save. Manual edits show the source as *manual*.
5. **Evening:** send the daily report on WhatsApp (Reports → Daily report → 💬 Send on WhatsApp).
6. **Weekly:** download the Full backup (Excel) and keep it safe.

Adding things:

- **New cab:** Cabs → **+ Add cab** (owner, timings, day/night driver).
- **New driver:** Drivers → **+ Add driver** (optionally assign a regular cab).
- **Many cabs at once:** Cabs → **⚡ Quick driver set**.
- **New sheet:** Upload Data → drag the file in.

---

## 7. Deploy it online (so drivers can open the link)

`localhost` only works on your own computer. Drivers need a public address,
so deploy the app to **Vercel** (hosting) and use **Neon** (cloud PostgreSQL).
Both have free plans.

### 7.1 Put the code on GitHub

1. Create a free account at https://github.com and create a new **private** repository named `cabtrack`.
2. In VS Code open the **Source Control** panel (`Ctrl+Shift+G`).
3. Click **Initialize Repository**, type a message such as `first version`, press **Commit**.
4. Click **Publish Branch** (or run in terminal: `git remote add origin https://github.com/YOUR_USER/cabtrack.git` then `git push -u origin main`).

Check that `.env` is **not** in the list of files. `.gitignore` already excludes it.

### 7.2 Create the cloud database (Neon)

1. Go to https://neon.tech → sign up → **New project** (name: `cabtrack`, region: closest to you).
2. Copy the **connection string**. It looks like:
   `postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`
3. Create the tables in Neon. Easiest: in your local project `.env`, temporarily set `DATABASE_URL` to the Neon string, run `npx drizzle-kit push`, then set `.env` back to your local database.
   Alternative: open Neon's **SQL Editor**, paste the whole content of `schema.sql`, click **Run**.

### 7.3 Deploy the app (Vercel)

1. Go to https://vercel.com → sign up with GitHub → **Add New… → Project** → select the `cabtrack` repository → **Import**.
2. Framework preset: **Next.js** (detected automatically). Leave the build command as `npm run build`.
3. Expand **Environment Variables** and add:
   - Name: `DATABASE_URL`
   - Value: your Neon connection string (with `?sslmode=require`)
4. Click **Deploy**. After 1–3 minutes you get a link like `https://cabtrack-yourname.vercel.app`.

### 7.4 Finish the setup on the live app

1. Open your Vercel link → you will see the login screen. Go to **Driver Form & Link**. Because no PIN exists yet, the dashboard is open: set an **Admin PIN** now and save the **recovery code** shown on screen.
2. In **Driver Form & Link → Public URL**, enter your Vercel link (`https://cabtrack-yourname.vercel.app`) and press **Save**. All driver links and QR codes now use this address.
3. Turn the **Driver form** switch **ON**.
4. Import your data: Upload Data → upload the Full backup Excel from section 5.
5. Send each driver their own link from the table on the same page (**💬 WhatsApp**), or send the group message. Print the QR stickers (**🖨️ Print a QR sticker for each cab**) and stick one in each cab.

### 7.5 Updating the live app later

Every time you `git push` (or **Commit → Push** in VS Code), Vercel deploys the new version automatically.

Database schema changes: run `npx drizzle-kit push` with `DATABASE_URL` pointing to Neon (same as step 7.2, point 3).

### 7.6 Other hosts (optional)

Any host that runs Node.js 20+ and gives a PostgreSQL `DATABASE_URL` works
(Render, Railway, a VPS). Use `npm run build` then `npm start`.

---

## 8. Security: PIN, recovery code and driver link

- **Admin PIN:** protects the dashboard and all admin pages. Set it on **Driver Form & Link → Admin PIN**. It must be 4 to 8 digits. The app stores only a salted scrypt hash.
- **Recovery code:** shown once when the PIN is set. Write it down. On the login screen choose **Forgot your PIN? Use the recovery code**. The code works only once and does not remove your current PIN; set a new PIN afterwards.
- **Lock (logout):** in the sidebar. Changing the PIN logs out other browsers.
- **Driver link:** contains a secret key (`?k=…`). Drivers can only submit the form with the key. If the link leaks, press **Create new link** — the old link and QR codes stop working.
- **Driver form ON/OFF:** when OFF, the link opens but submissions are refused.
- **Login protection:** after repeated wrong PINs the login is paused for a few minutes.
- **Never** commit `.env`, backups or the database password to GitHub.

---

## 9. Project structure

```
src/
  app/
    (admin)/            Admin pages (protected by the PIN)
      page.tsx          Dashboard
      attendance/       Daily Attendance
      reports/          Daily and date-range reports
      share/            Driver Form & Link, PIN settings, QR printing
      cabs/             Cabs and shift timings
      drivers/          Drivers
      upload/           Upload Data and backup
      settings/         Automation tools
    driver/             Public mobile form for drivers (uses the secret key)
    api/                Server endpoints (login, settings, cabs, drivers, attendance, upload, export, driver-form, notifications)
  components/           UI components
  db/
    index.ts            Database connection (reads DATABASE_URL)
    schema.ts           All table definitions
  lib/
    data.ts             Reading and calculating sheet/report data
    duty.ts             Driver Duty ON / OFF / LEAVE logic
    importer.ts         Excel / CSV reader (understands Hindi / English headers)
    settings.ts         Settings and PIN storage
    auth.ts             Session cookies and access checks
    notify.ts           Live alerts
    tracking.ts         Time and date helpers
scripts/
  test-environment.cjs  Test database and browser setup (tests only)
  verify-app.cjs        Full automated regression suite
schema.sql              Table definitions as plain SQL (for Neon SQL Editor)
drizzle.config.ts       Drizzle settings (reads DATABASE_URL)
```

---

## 10. Tests

The regression suite runs the production build against a **separate test
database** (`cabtrack_checks_test`), so your real data is never touched.
It checks the PIN flows, driver actions, alerts, reports, uploads and backup.

```bash
npm run build
npx playwright install --with-deps chromium
node scripts/verify-app.cjs
```

Requirements: PostgreSQL user `postgres` with password `postgres` at
`localhost:5432` (the test script uses this fixed connection), ports 3100 and
3443 free, and `openssl` on the PATH. On Windows you can run the tests in WSL.
The tests are optional for daily use.

---

## 11. Troubleshooting

| Problem | Fix |
| --- | --- |
| `DATABASE_URL is required` | Create `.env` (section 4.4) and restart `npm run dev`. |
| `password authentication failed` | Check the password in `DATABASE_URL`. |
| `relation "cabs" does not exist` | Run `npx drizzle-kit push` (section 4.5). |
| Login says the cookie was blocked | Allow cookies / site data for this site in the browser, then press Login again. Your PIN is fine. |
| Driver sees "form closed" | Turn the driver form ON (Driver Form & Link). |
| Driver sees "link is invalid or outdated" | Send the current link from the Driver Form & Link page. |
| Driver sees 403 Forbidden | You are using a preview / local link from the internet. Deploy (section 7) and use the public Vercel link. |
| Port 3000 in use | `npm run dev -- -p 3001` and open http://localhost:3001. |
| Build fails on Vercel with a DB error | Make sure `DATABASE_URL` is set in Vercel's Environment Variables for the Production environment. |
| Forgot PIN and recovery code | Reset in the database: `psql "$DATABASE_URL" -c "delete from app_settings where key like 'admin_%';"` then set a new PIN. |
#   C a r - T r a c k i n g  
 