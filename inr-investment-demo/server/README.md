# INR Investment Server (Demo)

- Node.js + Express + SQLite (better-sqlite3)
- JWT auth
- INR currency (stored in paise)
- Admin approvals for deposits & withdrawals
- Investment plans with fixed % return and duration
- Seed users:
  - admin / admin123 (admin)
  - raju / 123456 (user)

## Run
```bash
cd server
cp .env.example .env   # change JWT secret if you want
npm install
npm start
```
Server runs on http://localhost:4000
