import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const DB_FILE = process.env.DB_FILE || "./data.sqlite";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// --- DB init ---
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// Create tables if not exists
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY,
  balance_paise INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- deposit | withdraw | investment | payout
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL, -- pending | approved | rejected | completed
  meta_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  min_invest_paise INTEGER NOT NULL,
  return_percent REAL NOT NULL,
  duration_days INTEGER NOT NULL,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,
  start_at TEXT DEFAULT (datetime('now')),
  end_at TEXT NOT NULL,
  status TEXT NOT NULL, -- active | completed | cancelled
  payout_paise INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);
`);

// Seed admin + user + plans if empty
const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
if (userCount === 0) {
  const adminPass = bcrypt.hashSync("admin123", 10);
  const userPass = bcrypt.hashSync("123456", 10);

  const insUser = db.prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)");
  const insWallet = db.prepare("INSERT INTO wallets (user_id, balance_paise) VALUES (?, ?)");

  const admin = insUser.run("admin", adminPass, 1);
  insWallet.run(admin.lastInsertRowid, 0);

  const raju = insUser.run("raju", userPass, 0);
  insWallet.run(raju.lastInsertRowid, 50000); // ₹500.00 seed

  const insPlan = db.prepare("INSERT INTO plans (name, min_invest_paise, return_percent, duration_days, active) VALUES (?,?,?,?,?)");
  insPlan.run("Starter 7D 20%", 10000, 20, 7, 1);   // min ₹100
  insPlan.run("Growth 15D 30%", 20000, 30, 15, 1);  // min ₹200
  insPlan.run("Pro 30D 70%", 50000, 70, 30, 1);     // min ₹500
  console.log("Seeded admin, raju, and plans.");
}

// --- Helpers ---
function rupeesToPaise(r){ return Math.round(Number(r) * 100); }
function paiseToRupees(p){ return Number(p) / 100; }
function auth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
function adminOnly(req, res, next){
  if (!req.user?.is_admin) return res.status(403).json({ error: "Admin only" });
  next();
}
function nowPlusDays(days){
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,19).replace('T',' ');
}
function getWallet(user_id){
  return db.prepare("SELECT balance_paise FROM wallets WHERE user_id = ?").get(user_id);
}

// --- Auth ---
app.post("/api/register", (req,res)=>{
  const { username, password } = req.body || {};
  if(!username || !password) return res.status(400).json({ error: "username & password required"});
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare("INSERT INTO users (username, password_hash) VALUES (?,?)").run(username, hash);
    db.prepare("INSERT INTO wallets (user_id, balance_paise) VALUES (?,0)").run(info.lastInsertRowid);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/api/login", (req,res)=>{
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if(!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if(!ok) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ id: user.id, username: user.username, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

app.get("/api/me", auth, (req,res)=>{
  const u = db.prepare("SELECT id, username, is_admin, created_at FROM users WHERE id = ?").get(req.user.id);
  res.json(u);
});

// --- Wallet & Transactions ---
app.get("/api/wallet", auth, (req,res)=>{
  const w = getWallet(req.user.id);
  res.json({ balance_paise: w.balance_paise, balance_rupees: paiseToRupees(w.balance_paise) });
});

app.post("/api/deposit", auth, (req,res)=>{
  const { amount_rupees } = req.body || {};
  const amt = rupeesToPaise(amount_rupees);
  if(!amt || amt <= 0) return res.status(400).json({ error: "Invalid amount" });
  const meta = { note: "Simulated deposit, admin approval required" };
  const info = db.prepare("INSERT INTO transactions (user_id, type, amount_paise, status, meta_json) VALUES (?,?,?,?,?)")
    .run(req.user.id, "deposit", amt, "pending", JSON.stringify(meta));
  res.json({ ok: true, transaction_id: info.lastInsertRowid });
});

app.post("/api/withdraw", auth, (req,res)=>{
  const { amount_rupees } = req.body || {};
  const amt = rupeesToPaise(amount_rupees);
  if(!amt || amt <= 0) return res.status(400).json({ error: "Invalid amount" });
  const w = getWallet(req.user.id);
  if (w.balance_paise < amt) return res.status(400).json({ error: "Insufficient balance" });
  const meta = { note: "Simulated withdraw, admin approval required" };
  const info = db.prepare("INSERT INTO transactions (user_id, type, amount_paise, status, meta_json) VALUES (?,?,?,?,?)")
    .run(req.user.id, "withdraw", amt, "pending", JSON.stringify(meta));
  res.json({ ok: true, transaction_id: info.lastInsertRowid });
});

app.get("/api/transactions", auth, (req,res)=>{
  const rows = db.prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  res.json(rows.map(r => ({...r, amount_rupees: paiseToRupees(r.amount_paise)})));
});

// --- Plans & Investments ---
app.get("/api/plans", auth, (req,res)=>{
  const rows = db.prepare("SELECT * FROM plans WHERE active = 1").all();
  res.json(rows.map(p => ({...p, min_invest_rupees: paiseToRupees(p.min_invest_paise)})));
});

app.post("/api/invest", auth, (req,res)=>{
  const { plan_id, amount_rupees } = req.body || {};
  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND active = 1").get(plan_id);
  if(!plan) return res.status(400).json({ error: "Invalid plan" });
  const amt = rupeesToPaise(amount_rupees);
  if (amt < plan.min_invest_paise) return res.status(400).json({ error: "Below plan minimum" });

  // check wallet
  const w = getWallet(req.user.id);
  if (w.balance_paise < amt) return res.status(400).json({ error: "Insufficient balance" });

  // deduct immediately
  db.prepare("UPDATE wallets SET balance_paise = balance_paise - ? WHERE user_id = ?").run(amt, req.user.id);
  // create investment
  const payout = Math.round(amt * (1 + plan.return_percent / 100));
  const endAt = nowPlusDays(plan.duration_days);
  const info = db.prepare(`INSERT INTO investments (user_id, plan_id, amount_paise, end_at, status, payout_paise) 
                           VALUES (?,?,?,?,?,?)`)
                 .run(req.user.id, plan.id, amt, endAt, "active", payout);
  // log transaction
  db.prepare("INSERT INTO transactions (user_id, type, amount_paise, status, meta_json) VALUES (?,?,?,?,?)")
    .run(req.user.id, "investment", amt, "completed", JSON.stringify({ plan_id: plan.id }));

  res.json({ ok: true, investment_id: info.lastInsertRowid, end_at: endAt, payout_rupees: paiseToRupees(payout) });
});

function computeStatus(inv){
  const now = new Date();
  const end = new Date(inv.end_at.replace(' ', 'T') + "Z");
  const matured = now >= end;
  return { matured };
}

app.get("/api/investments", auth, (req,res)=>{
  const rows = db.prepare(`
    SELECT i.*, p.name as plan_name, p.return_percent, p.duration_days
    FROM investments i
    JOIN plans p ON p.id = i.plan_id
    WHERE i.user_id = ?
    ORDER BY i.id DESC
  `).all(req.user.id);
  const mapped = rows.map(r => {
    const { matured } = computeStatus(r);
    return {
      id: r.id,
      plan_name: r.plan_name,
      amount_rupees: paiseToRupees(r.amount_paise),
      payout_rupees: paiseToRupees(r.payout_paise),
      start_at: r.start_at,
      end_at: r.end_at,
      status: r.status,
      matured
    };
  });
  res.json(mapped);
});

app.post("/api/claim/:id", auth, (req,res)=>{
  const id = Number(req.params.id);
  const inv = db.prepare("SELECT * FROM investments WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if(!inv) return res.status(404).json({ error: "Not found" });
  if(inv.status !== "active") return res.status(400).json({ error: "Already claimed or cancelled" });
  const { matured } = computeStatus(inv);
  if(!matured) return res.status(400).json({ error: "Not matured yet" });
  // credit payout
  db.prepare("UPDATE wallets SET balance_paise = balance_paise + ? WHERE user_id = ?").run(inv.payout_paise, req.user.id);
  db.prepare("UPDATE investments SET status = 'completed' WHERE id = ?").run(inv.id);
  db.prepare("INSERT INTO transactions (user_id, type, amount_paise, status, meta_json) VALUES (?,?,?,?,?)")
    .run(req.user.id, "payout", inv.payout_paise, "completed", JSON.stringify({ investment_id: inv.id }));
  res.json({ ok: true, credited_rupees: (inv.payout_paise/100) });
});

// --- Admin ---
app.get("/api/admin/pending", auth, adminOnly, (req,res)=>{
  const rows = db.prepare("SELECT * FROM transactions WHERE status = 'pending' ORDER BY id ASC").all();
  res.json(rows.map(r => ({...r, amount_rupees: r.amount_paise/100 })));
});

app.post("/api/admin/approve-deposit/:id", auth, adminOnly, (req,res)=>{
  const id = Number(req.params.id);
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ? AND type = 'deposit'").get(id);
  if(!tx || tx.status !== "pending") return res.status(400).json({ error: "Invalid tx" });
  db.prepare("UPDATE wallets SET balance_paise = balance_paise + ? WHERE user_id = ?").run(tx.amount_paise, tx.user_id);
  db.prepare("UPDATE transactions SET status = 'approved' WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.post("/api/admin/reject-deposit/:id", auth, adminOnly, (req,res)=>{
  const id = Number(req.params.id);
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ? AND type = 'deposit'").get(id);
  if(!tx || tx.status !== "pending") return res.status(400).json({ error: "Invalid tx" });
  db.prepare("UPDATE transactions SET status = 'rejected' WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.post("/api/admin/approve-withdraw/:id", auth, adminOnly, (req,res)=>{
  const id = Number(req.params.id);
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ? AND type = 'withdraw'").get(id);
  if(!tx || tx.status !== "pending") return res.status(400).json({ error: "Invalid tx" });
  const w = getWallet(tx.user_id);
  if (w.balance_paise < tx.amount_paise) return res.status(400).json({ error: "Insufficient user balance" });
  db.prepare("UPDATE wallets SET balance_paise = balance_paise - ? WHERE user_id = ?").run(tx.amount_paise, tx.user_id);
  db.prepare("UPDATE transactions SET status = 'approved' WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.post("/api/admin/reject-withdraw/:id", auth, adminOnly, (req,res)=>{
  const id = Number(req.params.id);
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ? AND type = 'withdraw'").get(id);
  if(!tx || tx.status !== "pending") return res.status(400).json({ error: "Invalid tx" });
  db.prepare("UPDATE transactions SET status = 'rejected' WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/api/admin/users", auth, adminOnly, (req,res)=>{
  const rows = db.prepare(`
    SELECT u.id, u.username, u.is_admin, u.created_at, w.balance_paise 
    FROM users u JOIN wallets w ON w.user_id = u.id ORDER BY u.id ASC
  `).all();
  res.json(rows.map(r => ({...r, balance_rupees: r.balance_paise/100 })));
});

app.post("/api/admin/plans", auth, adminOnly, (req,res)=>{
  const { name, min_invest_rupees, return_percent, duration_days, active = 1 } = req.body || {};
  if(!name) return res.status(400).json({ error: "name required" });
  const info = db.prepare("INSERT INTO plans (name, min_invest_paise, return_percent, duration_days, active) VALUES (?,?,?,?,?)")
    .run(name, Math.round(min_invest_rupees*100), return_percent, duration_days, active ? 1 : 0);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.patch("/api/admin/plans/:id", auth, adminOnly, (req,res)=>{
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM plans WHERE id = ?").get(id);
  if(!existing) return res.status(404).json({ error: "Plan not found" });
  const { name, min_invest_rupees, return_percent, duration_days, active } = req.body || {};
  const minPaise = (min_invest_rupees != null) ? Math.round(min_invest_rupees*100) : existing.min_invest_paise;
  const ret = (return_percent != null) ? return_percent : existing.return_percent;
  const dur = (duration_days != null) ? duration_days : existing.duration_days;
  const act = (active != null) ? (active ? 1 : 0) : existing.active;
  const nm = name || existing.name;
  db.prepare("UPDATE plans SET name=?, min_invest_paise=?, return_percent=?, duration_days=?, active=? WHERE id=?")
    .run(nm, minPaise, ret, dur, act, id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("INR Investment server running on http://localhost:" + PORT);
});
