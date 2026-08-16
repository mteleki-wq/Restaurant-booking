# Restaurant Deluxe — Ordering Platform

QR table ordering, kitchen displays, counter payments, shift readings and
bookkeeping — for one restaurant or many, on a single Supabase project.

Guests scan a code on their table, order, and the food routes to the
kitchen while drinks go to the bar. Staff settle the bill at the counter.
You close the shift with a Z reading and export it for the books.

Restaurants' existing websites are untouched by any of this. Their
booking systems, editors and deploy pipelines keep working exactly as
before. Ordering is a separate set of pages that share nothing but a
venue identifier.

---

## The pieces

**Run once per database**, in this order:

| File | What it does |
|---|---|
| `supabase-digital-ordering-migration.sql` | Core: venues, menus, orders, routing |
| `supabase-menu-seed.sql` | *Optional* demo menu — skip for real clients |
| `supabase-add-order-url.sql` | Where the QR codes point |
| `supabase-payments.sql` | Table sessions and payments |
| `supabase-readings.sql` | X and Z shift readings |
| `supabase-reports.sql` | Report data for exports |
| `supabase-menu-photos.sql` | Storage bucket for dish photos |
| `supabase-gst.sql` | GST per dish, snapshotted onto each sale |
| `supabase-platform.sql` | Multi-restaurant and the admin role |

**Hosted once, used by every restaurant:**

| File | Who opens it |
|---|---|
| `table-order.html` | **Guests**, by scanning a QR code |
| `staff-kds.html` | Kitchen and bar screens |
| `staff-counter.html` | Counter — bills, payments, shift readings |
| `restaurant-menu-manager.html` | Managers — menu, tables, QR codes |
| `platform-admin.html` | **You only** — onboarding and support |
| `bookkeeping.html` | Turns exported readings into an Excel workbook |
| `new-restaurant.html` | **You only** — builds a deployment kit for a client who wants their own Supabase project |

All are single self-contained files. No build step, no framework.

---

## How one project serves many restaurants

Every table is scoped to a venue, and access is decided by Row Level
Security. Two restaurants on the same database cannot see each other.

That was verified rather than assumed: a second venue was run end to end —
its own orders, payments and Z reading — while the first venue's manager
saw **zero** rows of its items, tables, orders, payments, readings and
sessions, and was refused outright by the reporting functions.

The practical consequences are large:

- **The SQL runs once, ever.** Not once per restaurant.
- **The files are hosted once.** Every venue's QR points at the same
  `table-order.html`; only the `?v=` code differs.
- **Adding a restaurant is data entry**, not deployment.

---

## The two keys

Supabase gives you two keys under **Settings → API**. Getting them the
wrong way round is the most damaging mistake available.

**anon / public — safe.** Designed to be visible. It belongs in
`table-order.html`, which every guest can read. Alone it grants nothing:
it cannot read a table token, an order, or change a price. Verified: the
anon role has **zero** direct table privileges.

**service_role — never.** It bypasses every rule. It must never appear in
an HTML file, a QR code, a screenshot, a repository or a chat message. If
it leaks, rotate it immediately. Every screen here actively refuses one if
you paste it by accident.

---

## First-time setup

**1. Run the nine SQL files** in the order above. Supabase → SQL Editor →
paste → Run. **"Success. No rows returned" is correct** — these create
things rather than fetch them. All are additive and safe to re-run: no
`DROP TABLE`, no `DELETE`, and nothing outside their own `rd_` prefixed
tables. Existing booking tables are not touched.

**2. Create your own login** — Authentication → Users → Add user, with
**Auto Confirm User** ticked.

**3. Make yourself platform owner.** This is SQL-only by design; there is
no way to promote yourself from any screen.

```sql
insert into rd_platform_admins (user_id, note)
select id, 'platform owner' from auth.users
 where email = 'you@example.com'
on conflict (user_id) do nothing;
```

**4. Host the six HTML files.** Anywhere static — GitHub Pages is fine.
`platform-admin.html` should not be linked publicly.

**5. Fill in `table-order.html`.** It is the only file that needs editing,
because a guest's phone has never visited before, so the details must
already be inside it:

```js
var SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOi...';
```

The URL is the project origin only — no `/rest/v1` on the end. Open it in
a browser afterwards to confirm it loads.

> **Replace the contents of that file when updating it — never save it
> under a new filename.** QR codes point at one fixed address, and a
> renamed copy is simply never loaded.

The other screens ask for the details on-screen and remember them.

---

## Adding a restaurant

**On your shared project** — open `platform-admin.html` → **Add a restaurant**.

**On a client's own Supabase project** — open `new-restaurant.html` instead.
Enter the details and it produces three files: one SQL script that builds
the entire system and the restaurant, a `table-order.html` already
configured with their keys, and a printable handover sheet for the
restaurant. Create your own login in their project first, under
Authentication → Users with Auto Confirm ticked; the script stops with a
clear message rather than leaving a restaurant nobody can administer.

The rest of this section describes the console.

- **Name** — as guests will see it
- **Short name** — auto-fills, e.g. `sunset-grill`. This goes inside every
  QR code. **Settle it now**; changing it later means reprinting every table
- **Tables** — each gets its own secret token
- **Ordering page address** — the same for all clients, pre-filled
- **Registered for GST** — usually yes

That creates the venue, five stations, all the tables and your ownership.
A checklist then shows what remains.

**Their staff logins.** Supabase → Authentication → Users → Add user,
**Auto Confirm** ticked. Then console → **Staff** → email and role.
*Manager* for the owner, *Staff* for chefs and floor. An email with no
account is refused rather than silently linking nobody.

**Their menu.** Console → **Menu manager** on their card — it opens already
switched to that restaurant. **Import a menu** takes a PDF, a Word file or
pasted text, shows an editable preview, and imports only what you tick.

**Their QR codes.** Tables & QR → check the address → **New code** on every
table → **Print all**.

**Test before handing over.** Scan a code, order a food item and a drink,
check both reach the right screens, settle it, take a Z reading.

Fifteen to twenty minutes, most of it checking the menu parsed properly.

---

## Roles

| Role | Can do |
|---|---|
| **Staff** | Kitchen and counter, settle tables, mark items sold out |
| **Manager** | Also prices, menu, tables, QR codes, Z readings |
| **Owner** | Same as manager |
| **Platform admin** | Everything, at every restaurant |

Give each person their own login — the order history records who moved
what, which matters when something is disputed.

---

## GST

**Recorded per dish, not derived from the total.** If every sale were
taxable you could divide by 11, but the moment anything is GST-free that
overstates the GST owed on a figure that goes to the ATO.

Mark GST-free items in the menu manager: Edit dish → **GST-free**. Leave
it unticked for anything eaten on the premises — dine-in food and drink is
taxable even where the same item would be GST-free in a shop. This is
general information, not tax advice; your accountant signs the return.

The status is **frozen at the moment of sale**, so reclassifying a dish
next month cannot rewrite a BAS you have already lodged. Verified: a $33
order containing a GST-free item yields $2.18 GST, not $3.00.

---

## A day of service

**Orders** arrive on `staff-kds.html`. Food to Kitchen, drinks to Bar,
expo sees the whole order — all under one order number. Status moves
Accept → Preparing → Ready → Served. Late tickets glow red.

**Only the guest's own note is shown in red.** Routine allergen data is
quiet grey. Flagging every beer as containing gluten in alarm colours is
how staff learn to stop seeing red, which is when a real allergy gets
missed.

**Payment** happens on `staff-counter.html`. Open tables show running
totals; tap one for the itemised bill. Take the card on your existing
terminal, then record it here. **No card details enter this system at any
point**, which keeps you outside PCI scope.

A table's bill opens on its first order and closes when paid. A second
round joins the same bill; new guests at that table start a fresh one.

**Closing the shift.** The summary *is* the X reading — look as often as
you like. **Z reading** closes it off: numbered, permanent, resets the
running total. Because a Z period runs from the last Z rather than
midnight, a lunch Z and a dinner Z both work on the same day.

Z is refused while tables are still open, and is manager-only. Closing a
shift with money on the floor is how takings quietly disappear.

---

## Bookkeeping

Export from the counter — the shift tab, the Z dialog, or any past
reading. You get a CSV with the summary, GST breakdown, every settled
table, and every dish sold.

Drop those into `bookkeeping.html` — one file or a month of them — for an
Excel workbook: Summary with a BAS reference block, Readings, Daily
income, Tables, and Product mix.

It runs entirely in the browser. Nothing is uploaded, and it works with no
internet connection.

Files exported before GST was added carry no tax breakdown. They are
flagged, counted in takings, and contribute nothing to GST — do not lodge
a BAS from a mixed set without checking.

---

## Day-to-day

**Sold out** — menu manager, on the dish or on a single modifier choice.
Takes effect on the guest's menu immediately.

**Counting down stock** — set *Portions left today*; it decreases as orders
arrive and marks itself sold out at zero.

**Closing ordering** — Settings → Stop taking orders. The menu stays
readable; new orders are refused with your closed message. **Pause** is the
same thing for a kitchen that is briefly slammed.

**Prices** apply from the next order. Orders already placed keep the price
they were placed at.

**Option groups are shared.** "Choice of side" attached to four dishes is
one group — edit it once and all four follow.

**Photos** — Edit dish → Add photo. Resized on your device before upload,
because a 4 MB photo would otherwise be a 4 MB download for every guest.

---

## If something goes wrong

**"Not connected yet"** — `table-order.html` has no keys, or a screen has
not been set up. Not a password problem.

**"Invalid path specified in request URL"** — the Project URL has extra
path. Use just `https://<your-ref>.supabase.co`.

**Sign-in works but the board is empty** — no `rd_staff` row for that venue.

**QR codes open nothing** — the ordering page address was not set, so they
encode a local file path. Fix it in Tables & QR and reprint.

**Menu stops scrolling partway** — you are running an old copy of
`table-order.html`. Replace the file, keeping the same filename.

**An order failed and the guest saw an error** — by design. No success
screen is ever shown unless the database confirmed the order, and the cart
is kept so they can retry. Nothing is silently lost.

**Diagnosing a stubborn ordering page** — add `&debug=1` to the table URL
for live scroll and layout figures. Guests never see it.

---

## What is verified, and what is not

**Verified by automated tests** against a real PostgreSQL database with
your security rules — 314 tests across ten suites:

Required choices block adding to cart; modifier pricing; sold-out dishes
and options; separate cart lines for different builds; double-tapping
Submit creating exactly one order; kitchen and bar routing under one order
number; guests unable to read another table's orders; the anon key having
zero table access; staff of one venue seeing nothing of another; failed
submissions never showing false success; QR codes decoding correctly; the
GST split; Z readings resetting the period; CSV and Excel exports opening
in real readers; menu import; venue isolation.

**Prices are calculated by the database, never the browser.** The page
shows a total for the guest's benefit; the server recalculates from its
own records before accepting anything.

**Not verified — worth your own check before relying on it:**

- **Real iOS Safari.** Everything was tested in Chromium. Close, not identical.
- **Real Supabase.** Tests ran against PostgreSQL with a Supabase-like harness.
- **The kitchen screen polls every six seconds** rather than using live
  websockets. Fast enough in practice; live sockets are a later addition.
- **Card payment is not integrated** — cards are taken on your existing
  terminal and recorded here.
- **Xero and MYOB exports are not built** — they need your chart of
  accounts and your bookkeeper's preferred import method.
- **Expenses are not tracked** — income only.
- **Scanned menus cannot be imported.** The text must be selectable; paste
  it instead.

---

## Reference

**Guest URL** — `https://your-site/table-order.html?v=<slug>&t=<token>`

**Table tokens**

```sql
select v.slug, t.label, t.token
  from rd_tables t join rd_venues v on v.id = t.venue_id
 order by v.slug, t.sort;
```

**Tonight's orders**

```sql
select v.slug, o.order_number, t.label as tbl, o.status,
       o.total_cents/100.0 as total, o.created_at
  from rd_orders o
  join rd_tables t on t.id = o.table_id
  join rd_venues v on v.id = o.venue_id
 where o.service_date = current_date
 order by v.slug, o.order_number;
```

**Takings not yet closed by a Z**

```sql
select v.slug, count(*) as payments, sum(p.amount_cents)/100.0 as total
  from rd_payments p join rd_venues v on v.id = p.venue_id
 where p.reading_id is null
 group by v.slug;
```

**Past Z readings**

```sql
select v.slug, r.number, r.period_end,
       (r.totals->>'total_cents')::int/100.0 as total
  from rd_readings r join rd_venues v on v.id = r.venue_id
 order by v.slug, r.number desc;
```

**Rotate every table token for one restaurant** (reprint afterwards)

```sql
update rd_tables set token = encode(gen_random_bytes(9),'hex')
 where venue_id = (select id from rd_venues where slug = 'sunset-grill');
```

**Who has access where**

```sql
select v.slug, u.email, s.role
  from rd_staff s
  join auth.users u on u.id = s.user_id
  join rd_venues v on v.id = s.venue_id
 order by v.slug, u.email;
```

---

## The tables

All prefixed `rd_`, so they cannot collide with a booking schema. All
protected by Row Level Security.

`rd_venues` · `rd_stations` · `rd_tables` · `rd_categories` · `rd_items` ·
`rd_modifier_groups` · `rd_modifier_options` · `rd_item_modifier_groups` ·
`rd_orders` · `rd_order_counters` · `rd_order_items` ·
`rd_order_item_modifiers` · `rd_order_status_events` · `rd_staff` ·
`rd_table_sessions` · `rd_payments` · `rd_readings` · `rd_platform_admins`

Guests reach exactly four functions and nothing else: `rd_table_check`,
`rd_menu`, `rd_place_order`, `rd_order_status`. The anon key has no direct
access to any table — verified, not assumed.
