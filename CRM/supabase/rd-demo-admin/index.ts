// supabase/functions/rd-demo-admin/index.ts
//
// Back end for the "Demo calendar" tab in the Venue CRM: Marc's weekly
// hours, time off, and demo bookings. Guarded by the same studio secret
// as rd-control and resend-send.
//
// Deploy: supabase functions deploy rd-demo-admin --no-verify-jwt
// URL:    https://tehxobdokbvqtwtgqzrh.supabase.co/functions/v1/rd-demo-admin
//
// Actions (POST JSON { action, ... }):
//   get        { from?: "YYYY-MM-DD", days?: 14 }  -> settings, days with slot states, bookings, time off
//   settings   { settings: {...} }                 -> save weekly hours, rules and the Zoom link
//   block      { start, end, reason? }             -> add time off (ISO times)
//   unblock    { id }                              -> remove time off
//   cancel     { id }                              -> cancel a demo booking (frees the time)
//   confirm    { id }                              -> confirm a visit request (restaurant gets the confirmation + invite)
//   decline    { id }                              -> answer a visit request with a Zoom video-call invitation

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-studio-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function rpc(name: string, args: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("This function has no Supabase credentials");
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Database said ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const expected = Deno.env.get("STUDIO_SECRET");
  if (!expected) return json({ error: "STUDIO_SECRET is not set on this function" }, 500);
  if (req.headers.get("x-studio-secret") !== expected) return json({ error: "Wrong studio secret" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Send JSON" }, 400); }

  try {
    switch (body.action) {
      case "ping":
        return json({ ok: true });
      case "get":
        return json(await rpc("rd_demo_admin_get", {
          p_from: /^\d{4}-\d{2}-\d{2}$/.test(body.from || "") ? body.from : null,
          p_days: Number(body.days) || 14,
        }));
      case "settings":
        return json(await rpc("rd_demo_admin_save_settings", { p: body.settings || {} }));
      case "block":
        return json(await rpc("rd_demo_admin_block", {
          p_start: body.start, p_end: body.end, p_reason: body.reason || null,
        }));
      case "unblock":
        return json(await rpc("rd_demo_admin_unblock", { p_id: body.id }));
      case "cancel":
        return json(await rpc("rd_demo_admin_cancel", { p_id: body.id }));
      case "confirm":
        return json(await rpc("rd_demo_admin_confirm", { p_id: body.id }));
      case "decline":
        return json(await rpc("rd_demo_admin_decline", { p_id: body.id }));
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("rd-demo-admin", e);
    return json({ error: (e as Error).message }, 502);
  }
});
