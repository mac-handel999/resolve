# Resolve web app
Plain HTML, CSS and JavaScript front end for the Resolve FastAPI backend. No build step.

## Run
    cd resolve
    python3 -m http.server 5500
Open http://localhost:5500

## Point at another API
Edit BASE in js/api.js, or in the browser console:
    localStorage.setItem('resolve_api','http://localhost:8000')

## Roles
- **Complainant** – files tickets, comments, attaches files, reopens resolved/closed/rejected tickets.
- **Agent** – sees tickets in their departments, claims tickets, updates status. Department *heads* can also assign and transfer.
- **Admin** – triages the intake queue (route or reject), manages users, departments, department members and categories.

## First-time setup (empty database)
1. Create an admin: `python -m app.scripts.create_admin --email you@bank.com --name "You"`
2. Sign in, open **Categories** (add or use the starter set) and **Departments** (add departments).
3. Register staff accounts, promote them on **Users**, then add them to a department under **Departments → Members**.

## Notes
- The API must allow your origin in CORS (`CORS_ORIGINS` must be non-empty on the backend).
- Render's free tier sleeps; the first request can take ~30s (a banner is shown).
- Sessions refresh automatically; if the refresh token is rejected you're returned to sign-in.
- Supports the backend's MFA login challenge (`/auth/login/mfa`) if/when that router is enabled.
