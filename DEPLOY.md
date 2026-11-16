# Deployment (short version)

The complete, step-by-step guide (run locally in VS Code, data backup and
restore, GitHub, Neon database, Vercel hosting, driver link and QR codes) is in
**README.md**, section 7 "Deploy it online".

Quick checklist:

1. Code on GitHub (`.env` is excluded automatically).
2. Neon: create a project, copy the connection string with `sslmode=require`.
3. Create tables on Neon: `npx drizzle-kit push` with `DATABASE_URL` set to the Neon string, or paste `schema.sql` into the Neon SQL Editor.
4. Vercel: Import the GitHub repository, add the environment variable `DATABASE_URL`, click Deploy.
5. Open the live app: set the Admin PIN (save the recovery code), enter the live URL in **Driver Form & Link → Public URL**, turn the driver form ON, upload your Full backup Excel.
