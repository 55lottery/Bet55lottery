const API = "http://localhost:4000/api";

export function getToken(){ return localStorage.getItem("token"); }
export function setToken(t){ localStorage.setItem("token", t); }
export function clearToken(){ localStorage.removeItem("token"); }

async function req(path, method="GET", body){
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: "Bearer " + getToken() } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if(!res.ok){
    const e = await res.json().catch(()=>({error: res.statusText}));
    throw new Error(e.error || "Request failed");
  }
  return res.json();
}

export const api = {
  register: (u,p) => req("/register","POST",{username:u, password:p}),
  login: (u,p) => req("/login","POST",{username:u, password:p}),
  me: () => req("/me"),
  wallet: () => req("/wallet"),
  plans: () => req("/plans"),
  invest: (plan_id, amount_rupees) => req("/invest","POST",{plan_id, amount_rupees}),
  investments: () => req("/investments"),
  claim: (id) => req(`/claim/${id}`,"POST"),
  deposit: (amt) => req("/deposit","POST",{amount_rupees: amt}),
  withdraw: (amt) => req("/withdraw","POST",{amount_rupees: amt}),
  tx: () => req("/transactions"),
  adminPending: () => req("/admin/pending"),
  adminApproveDeposit: (id) => req(`/admin/approve-deposit/${id}`,"POST"),
  adminRejectDeposit: (id) => req(`/admin/reject-deposit/${id}`,"POST"),
  adminApproveWithdraw: (id) => req(`/admin/approve-withdraw/${id}`,"POST"),
  adminRejectWithdraw: (id) => req(`/admin/reject-withdraw/${id}`,"POST"),
  adminUsers: () => req("/admin/users"),
  adminCreatePlan: (payload) => req("/admin/plans","POST",payload),
  adminUpdatePlan: (id,payload) => req(`/admin/plans/${id}`,"PATCH",payload),
};
