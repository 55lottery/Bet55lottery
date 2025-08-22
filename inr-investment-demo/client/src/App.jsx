import React, { useEffect, useState } from "react";
import { api, setToken, clearToken } from "./api";

function Currency({ value }){
  return <span>₹{Number(value).toFixed(2)}</span>;
}

function Login({ onAuthed }){
  const [u,setU] = useState("raju");
  const [p,setP] = useState("123456");
  const [error,setError] = useState("");

  async function doLogin(e){
    e.preventDefault();
    setError("");
    try{
      const { token } = await api.login(u,p);
      setToken(token);
      onAuthed();
    }catch(err){ setError(err.message); }
  }

  async function doRegister(e){
    e.preventDefault();
    setError("");
    try{
      await api.register(u,p);
      await doLogin(e);
    }catch(err){ setError(err.message); }
  }

  return (
    <div style={{maxWidth:420, margin:"60px auto", padding:20, border:"1px solid #eee", borderRadius:12}}>
      <h2>Login (Demo)</h2>
      <p>Try <b>raju / 123456</b> or <b>admin / admin123</b></p>
      {error && <div style={{color:"red"}}>{error}</div>}
      <form onSubmit={doLogin}>
        <input placeholder="Username" value={u} onChange={e=>setU(e.target.value)} style={{width:"100%", padding:10, margin:"8px 0"}}/>
        <input placeholder="Password" type="password" value={p} onChange={e=>setP(e.target.value)} style={{width:"100%", padding:10, margin:"8px 0"}}/>
        <div style={{display:"flex", gap:10}}>
          <button type="submit">Login</button>
          <button onClick={doRegister} type="button">Register</button>
        </div>
      </form>
    </div>
  );
}

function Dashboard({ me, onLogout }){
  const [wallet,setWallet] = useState({ balance_rupees: 0 });
  const [plans,setPlans] = useState([]);
  const [investments,setInvestments] = useState([]);
  const [amount,setAmount] = useState("");
  const [tx,setTx] = useState([]);
  const [msg,setMsg] = useState("");

  async function refresh(){
    const w = await api.wallet(); setWallet(w);
    const ps = await api.plans(); setPlans(ps);
    const inv = await api.investments(); setInvestments(inv);
    const t = await api.tx(); setTx(t);
  }
  useEffect(()=>{ refresh(); },[]);

  async function deposit(){
    setMsg("");
    try{
      await api.deposit(Number(amount));
      setMsg("Deposit request submitted (pending admin approval).");
      setAmount("");
      refresh();
    }catch(e){ setMsg(e.message); }
  }
  async function withdraw(){
    setMsg("");
    try{
      await api.withdraw(Number(amount));
      setMsg("Withdraw request submitted (pending admin approval).");
      setAmount("");
      refresh();
    }catch(e){ setMsg(e.message); }
  }
  async function invest(plan){
    const amt = prompt(`Enter amount in ₹ (min ₹${plan.min_invest_rupees}):`);
    if(!amt) return;
    try{
      const res = await api.invest(plan.id, Number(amt));
      alert(`Invested! Payout ₹${res.payout_rupees.toFixed(2)} on ${res.end_at}`);
      refresh();
    }catch(e){ alert(e.message); }
  }
  async function claim(inv){
    try{
      await api.claim(inv.id);
      alert("Payout credited to wallet!");
      refresh();
    }catch(e){ alert(e.message); }
  }

  return (
    <div style={{maxWidth:1000, margin:"20px auto", padding:20}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <h2>Welcome, {me.username} {me.is_admin ? "(Admin)" : ""}</h2>
        <button onClick={()=>{ clearToken(); onLogout(); }}>Logout</button>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20}}>
        <div style={{border:"1px solid #eee", padding:16, borderRadius:12}}>
          <h3>Wallet</h3>
          <p>Balance: <b><Currency value={wallet.balance_rupees}/></b></p>
          <div style={{display:"flex", gap:10, marginTop:10}}>
            <input type="number" placeholder="Amount (₹)" value={amount} onChange={e=>setAmount(e.target.value)} />
            <button onClick={deposit}>Deposit</button>
            <button onClick={withdraw}>Withdraw</button>
          </div>
          {msg && <p>{msg}</p>}
        </div>

        <div style={{border:"1px solid #eee", padding:16, borderRadius:12}}>
          <h3>Plans</h3>
          <ul>
            {plans.map(p => (
              <li key={p.id} style={{marginBottom:8}}>
                <b>{p.name}</b> — min <Currency value={p.min_invest_rupees}/> — Return {p.return_percent}% in {p.duration_days} days
                <button onClick={()=>invest(p)} style={{marginLeft:10}}>Invest</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{border:"1px solid #eee", padding:16, borderRadius:12, marginTop:20}}>
        <h3>Your Investments</h3>
        <table width="100%" cellPadding="6" style={{borderCollapse:"collapse"}}>
          <thead>
            <tr><th align="left">Plan</th><th align="right">Amount</th><th align="right">Payout</th><th>End</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {investments.map(inv => (
              <tr key={inv.id} style={{borderTop:"1px solid #eee"}}>
                <td>{inv.plan_name}</td>
                <td align="right"><Currency value={inv.amount_rupees} /></td>
                <td align="right"><Currency value={inv.payout_rupees} /></td>
                <td>{inv.end_at}</td>
                <td>{inv.status}{inv.matured ? " (Matured)" : ""}</td>
                <td>{inv.matured && inv.status==="active" ? <button onClick={()=>claim(inv)}>Claim</button> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{border:"1px solid #eee", padding:16, borderRadius:12, marginTop:20}}>
        <h3>Transactions</h3>
        <table width="100%" cellPadding="6" style={{borderCollapse:"collapse"}}>
          <thead>
            <tr><th align="left">Type</th><th align="right">Amount</th><th>Status</th><th>Time</th></tr>
          </thead>
          <tbody>
            {tx.map(t => (
              <tr key={t.id} style={{borderTop:"1px solid #eee"}}>
                <td>{t.type}</td>
                <td align="right"><Currency value={t.amount_rupees} /></td>
                <td>{t.status}</td>
                <td>{t.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {me.is_admin && <AdminPanel />}
    </div>
  );
}

function AdminPanel(){
  const [pending,setPending] = useState([]);
  const [users,setUsers] = useState([]);
  const [newPlan,setNewPlan] = useState({ name:"", min_invest_rupees:100, return_percent:10, duration_days:7 });

  async function refresh(){
    setPending(await api.adminPending());
    setUsers(await api.adminUsers());
  }
  useEffect(()=>{ refresh(); },[]);

  async function approveDeposit(id){ await api.adminApproveDeposit(id); refresh(); }
  async function rejectDeposit(id){ await api.adminRejectDeposit(id); refresh(); }
  async function approveWithdraw(id){ await api.adminApproveWithdraw(id); refresh(); }
  async function rejectWithdraw(id){ await api.adminRejectWithdraw(id); refresh(); }
  async function createPlan(){
    await api.adminCreatePlan(newPlan);
    alert("Plan created");
    setNewPlan({ name:"", min_invest_rupees:100, return_percent:10, duration_days:7 });
    refresh();
  }

  return (
    <div style={{border:"2px dashed #aaa", padding:16, borderRadius:12, marginTop:30}}>
      <h3>Admin Panel</h3>

      <h4>Pending Requests</h4>
      <table width="100%" cellPadding="6" style={{borderCollapse:"collapse"}}>
        <thead>
          <tr><th>ID</th><th>User</th><th>Type</th><th align="right">Amount</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          {pending.map(p => (
            <tr key={p.id} style={{borderTop:"1px solid #eee"}}>
              <td>{p.id}</td>
              <td>{p.user_id}</td>
              <td>{p.type}</td>
              <td align="right">₹{p.amount_rupees.toFixed(2)}</td>
              <td>{p.status}</td>
              <td>
                {p.type === "deposit" ? (
                  <>
                    <button onClick={()=>approveDeposit(p.id)}>Approve</button>{" "}
                    <button onClick={()=>rejectDeposit(p.id)}>Reject</button>
                  </>
                ) : (
                  <>
                    <button onClick={()=>approveWithdraw(p.id)}>Approve</button>{" "}
                    <button onClick={()=>rejectWithdraw(p.id)}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{marginTop:20}}>Users</h4>
      <table width="100%" cellPadding="6" style={{borderCollapse:"collapse"}}>
        <thead>
          <tr><th>ID</th><th>Username</th><th>Admin</th><th align="right">Balance</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{borderTop:"1px solid #eee"}}>
              <td>{u.id}</td>
              <td>{u.username}</td>
              <td>{u.is_admin ? "Yes" : "No"}</td>
              <td align="right">₹{u.balance_rupees.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{marginTop:20}}>Create Plan</h4>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, maxWidth:600}}>
        <input placeholder="Name" value={newPlan.name} onChange={e=>setNewPlan({...newPlan, name:e.target.value})}/>
        <input type="number" placeholder="Min (₹)" value={newPlan.min_invest_rupees} onChange={e=>setNewPlan({...newPlan, min_invest_rupees:Number(e.target.value)})}/>
        <input type="number" placeholder="Return %%" value={newPlan.return_percent} onChange={e=>setNewPlan({...newPlan, return_percent:Number(e.target.value)})}/>
        <input type="number" placeholder="Days" value={newPlan.duration_days} onChange={e=>setNewPlan({...newPlan, duration_days:Number(e.target.value)})}/>
        <button onClick={createPlan}>Create</button>
      </div>
    </div>
  );
}

export default function App(){
  const [me,setMe] = useState(null);

  async function fetchMe(){
    try {
      const m = await api.me();
      setMe(m);
    } catch{
      setMe(null);
    }
  }

  useEffect(()=>{ fetchMe(); },[]);

  if(!me){
    return <Login onAuthed={fetchMe} />;
  }
  return <Dashboard me={me} onLogout={()=>setMe(null)} />;
}
