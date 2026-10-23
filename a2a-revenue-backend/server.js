/**
 * A2A Revenue Dashboard API — Supabase-only backend
 * Node.js 20+, Express, @supabase/supabase-js, cors, dotenv.
 * No fake agent execution, IMAP polling, AI success, or payment success is generated.
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const app = express();
const PORT = Number(process.env.PORT || 3000);
const requiredEnv = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "A2A_ADMIN_USER_IDS"];
for (const key of requiredEnv) {
  if (!process.env[key]) { console.error(`Missing required environment variable: ${key}`); process.exit(1); }
}
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
app.disable("x-powered-by");
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "PATCH", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
}));
app.use(express.json({ limit: "32kb" }));
const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const adminIds = new Set(process.env.A2A_ADMIN_USER_IDS.split(",").map(v => v.trim()).filter(Boolean));
const VALID_STAGES = new Set(["Outreach Sent", "Awaiting Reply", "Call Scheduled", "Proposal Sent", "Paid Won", "Lost"]);
async function requireAdmin(req, res, next) {
  try {
    const match = (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ success: false, error: "Bearer token required" });
    const { data, error } = await authClient.auth.getUser(match[1]);
    if (error || !data?.user) return res.status(401).json({ success: false, error: "Invalid or expired Supabase session" });
    if (!adminIds.has(data.user.id)) return res.status(403).json({ success: false, error: "Dashboard access not authorized" });
    req.user = data.user;
    return next();
  } catch (e) {
    console.error("Authentication middleware failed:", e.message);
    return res.status(500).json({ success: false, error: "Authentication check failed" });
  }
}
app.get("/api/health", (_req, res) => res.json({
  status: "ONLINE",
  database: "Supabase configured; database operation not tested by this endpoint",
  timestamp: new Date().toISOString()
}));
app.use("/api", requireAdmin);
app.get("/api/leads", async (_req, res) => {
  const { data, error } = await db.from("a2a_revenue_leads")
    .select("id,name,contact,stage,target_amount,target_currency,agent,notes,sent_verified,sent_verified_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) { console.error("Lead read failed:", error.message); return res.status(500).json({ success: false, error: "Could not load leads" }); }
  return res.json({ success: true, data });
});
app.patch("/api/leads/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return res.status(400).json({ success: false, error: "Invalid lead ID" });
  const allowed = ["stage", "target_amount", "target_currency", "notes"];
  const updates = {};
  for (const field of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) updates[field] = req.body[field];
  if (!Object.keys(updates).length) return res.status(400).json({ success: false, error: "No supported fields supplied" });
  if (updates.stage !== undefined && !VALID_STAGES.has(updates.stage)) return res.status(400).json({ success: false, error: "Invalid stage" });
  if (updates.target_amount !== undefined && (!Number.isFinite(updates.target_amount) || updates.target_amount < 0))
    return res.status(400).json({ success: false, error: "Target amount must be a non-negative number" });
  if (updates.target_currency !== undefined && !["USD", "INR", "EUR", "GBP"].includes(updates.target_currency))
    return res.status(400).json({ success: false, error: "Unsupported currency" });
  if (updates.notes !== undefined && (typeof updates.notes !== "string" || updates.notes.length > 4000))
    return res.status(400).json({ success: false, error: "Notes must be text up to 4000 characters" });
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db.from("a2a_revenue_leads").update(updates).eq("id", id)
    .select("id,name,contact,stage,target_amount,target_currency,agent,notes,sent_verified,sent_verified_at,updated_at").maybeSingle();
  if (error) { console.error("Lead update failed:", error.message); return res.status(500).json({ success: false, error: "Could not update lead" }); }
  if (!data) return res.status(404).json({ success: false, error: "Lead not found" });
  const { error: logError } = await db.from("a2a_execution_logs").insert({
    actor_user_id: req.user.id, event_type: "lead_updated", agent: "dashboard",
    message: `Lead updated: ${data.name}; fields: ${Object.keys(updates).filter(k => k !== "updated_at").join(", ")}`,
    evidence_status: "recorded"
  });
  if (logError) console.error("Lead update audit insert failed:", logError.message);
  return res.json({ success: true, data });
});
app.get("/api/logs", async (_req, res) => {
  const { data, error } = await db.from("a2a_execution_logs")
    .select("id,created_at,actor_user_id,event_type,agent,message,evidence_status")
    .order("created_at", { ascending: false }).limit(50);
  if (error) { console.error("Log read failed:", error.message); return res.status(500).json({ success: false, error: "Could not load logs" }); }
  return res.json({ success: true, data });
});
app.post("/api/logs", async (req, res) => {
  const { message } = req.body || {};
  if (typeof message !== "string" || !message.trim() || message.length > 2000)
    return res.status(400).json({ success: false, error: "Message must be 1–2000 characters" });
  const { data, error } = await db.from("a2a_execution_logs").insert({
    actor_user_id: req.user.id, event_type: "operator_note", agent: "dashboard",
    message: message.trim(), evidence_status: "operator_note"
  }).select("id,created_at,actor_user_id,event_type,agent,message,evidence_status").single();
  if (error) { console.error("Operator note insert failed:", error.message); return res.status(500).json({ success: false, error: "Could not save note" }); }
  return res.status(201).json({ success: true, data });
});
app.use((error, _req, res, _next) => {
  if (error.message === "Origin not allowed by CORS") return res.status(403).json({ success: false, error: "Origin not allowed" });
  if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ success: false, error: "Invalid JSON body" });
  console.error("Unhandled API error:", error.message);
  return res.status(500).json({ success: false, error: "Internal server error" });
});
app.listen(PORT, () => console.log(`A2A Supabase API listening on port ${PORT}`));
