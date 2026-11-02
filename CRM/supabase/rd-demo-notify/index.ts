// rd-demo-notify — called by public.rd_demo_book() (via pg_net) after a restaurant
// books a demo on webescapade.com/Restaurant/demo.html.
// Sends: 1) a confirmation to the restaurant, with a calendar invite (.ics)
//        2) an alert to Marc (REPORT_TO, default sales@webescapade.com)
// Authorised with the Vault key checked by public.rd_cron_key_ok().

const SB = Deno.env.get("SUPABASE_URL") ?? "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const REPORT_TO = Deno.env.get("REPORT_TO") || "sales@webescapade.com";
const PHONE = "0413 872 994";

const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function resend(path: string, body?: unknown) {
  const r = await fetch("https://api.resend.com" + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.message || `Resend ${r.status}`);
  return d;
}

const MODE: Record<string, string> = { phone: "Phone call", video: "Video call", visit: "Visit at your restaurant" };
const when = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const length = (m: number) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m === 60 ? "1 hour" : `${m / 60} hours`) : `${m} minutes`);

function ics(b: any) {
  const s = new Date(b.start_at), e = new Date(s.getTime() + (b.minutes || 30) * 60000);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Webescapade//Restaurant Deluxe demo//EN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${b.id}@webescapade.com`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(s)}`, `DTEND:${icsDate(e)}`,
    `SUMMARY:Restaurant Deluxe demo with Marc (${MODE[b.mode] || ""})`,
    `DESCRIPTION:${b.mode === "phone" ? "Marc will call you on " + (b.phone || "your number") : b.mode === "video" ? "Marc will email you a video link before the call" : "Marc will come to " + b.restaurant}. Questions: ${PHONE}`,
    "END:VEVENT", "END:VCALENDAR",
  ];
  return btoa(lines.join("\r\n"));
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Use POST", { status: 405 });
    const key = req.headers.get("x-cron-key") || "";
    const ok = await db("rpc/rd_cron_key_ok", { method: "POST", body: JSON.stringify({ p_key: key }) });
    if (ok !== true) return new Response("unauthorised", { status: 401 });
    const { id } = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return new Response("bad id", { status: 400 });
    const b = (await db(`rd_demo_bookings?id=eq.${id}&select=*`))?.[0];
    if (!b) return new Response("not found", { status: 404 });

    const doms = await resend("/domains");
    const dom = ((doms?.data ?? []) as any[]).find((d) => d?.status === "verified")?.name || "webescapade.com";
    const from = `Marc · Restaurant Deluxe <marc@${dom}>`;
    const F = "Arial,Helvetica,sans-serif";
    const how = b.mode === "phone" ? `I’ll call you on <b>${h(b.phone || "the number you gave")}</b>.` :
      b.mode === "video" ? "I’ll email you a video-call link before we start." :
      `I’ll come to <b>${h(b.restaurant)}</b>. Please reply with the address if it isn’t on your website.`;

    const guest = `<div style="font-family:${F};max-width:560px;margin:0 auto;color:#1b1730">
      <h1 style="font-size:22px;margin:0 0 8px">Your demo is booked</h1>
      <p style="font-size:15px">Hi ${h(b.name)},</p>
      <p style="font-size:15px">Thanks for booking a Restaurant Deluxe demo for <b>${h(b.restaurant)}</b>.</p>
      <table style="font-size:15px;border-collapse:collapse;margin:14px 0">
        <tr><td style="padding:6px 14px 6px 0;color:#6b6788">When</td><td><b>${h(when(b.start_at))}</b> (Sydney time, about ${h(length(b.minutes || 30))})</td></tr>
        <tr><td style="padding:6px 14px 6px 0;color:#6b6788">How</td><td>${h(MODE[b.mode])}</td></tr>
      </table>
      <p style="font-size:15px">${how} I’ll show you bookings, the digital waitlist and ordering at the table, working together on the tablets you already have.</p>
      <p style="font-size:15px">Need to change the time? Just reply to this email or call me on ${PHONE}.</p>
      <p style="font-size:15px">See you soon,<br>Marc<br><span style="color:#6b6788">Webescapade · Restaurant Deluxe</span></p>
      <p style="font-size:12px;color:#8a86a3">A calendar invite is attached.</p></div>`;
    await resend("/emails", { from, to: [b.email], reply_to: `marc@${dom}`, subject: `Your Restaurant Deluxe demo — ${when(b.start_at)}`, html: guest,
      attachments: [{ filename: "restaurant-deluxe-demo.ics", content: ics(b) }] });

    const alert = `<div style="font-family:${F};color:#1b1730"><h2 style="margin:0 0 10px">📅 New demo booked</h2>
      <p style="font-size:15px"><b>${h(b.restaurant)}</b> — ${h(b.name)}<br>${h(when(b.start_at))} · ${h(MODE[b.mode])} · ${h(length(b.minutes || 30))}</p>
      <p style="font-size:14px">Phone: ${h(b.phone || "—")}<br>Email: ${h(b.email)}${b.note ? "<br>Note: " + h(b.note) : ""}</p>
      <p style="font-size:13px;color:#6b6788">They’re now <b>Demo booked</b> in your Venue CRM, with a follow-up at the demo time. The time is locked in your Demo calendar. A calendar invite is attached.</p></div>`;
    await resend("/emails", { from: `Restaurant Deluxe CRM <reports@${dom}>`, to: [REPORT_TO], reply_to: b.email, subject: `📅 Demo booked: ${b.restaurant} — ${when(b.start_at)}`, html: alert,
      attachments: [{ filename: "demo.ics", content: ics(b) }] });

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("rd-demo-notify", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
});
