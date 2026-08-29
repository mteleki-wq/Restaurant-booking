# Restaurant Deluxe — Order Intelligence

A standalone analytics application for the Restaurant Deluxe **Order-at-the-Table** system.

## What is included

- Overview KPIs and sales trend
- Sales, GST and payment-method analysis
- Menu/product-mix analytics
- Table revenue and session analysis
- Kitchen/station workload and order timing
- Payments and order reconciliation
- Deterministic “Ask Analytics” questions (no invented figures)
- Multi-sheet Excel export and CSV export
- Demo mode plus live Supabase sign-in

## Live data source

The app is preconfigured for the existing Supabase project URL and its **publishable** browser key. It signs staff in through Supabase Auth and then relies on the existing Row Level Security policies such as `rd_is_staff(venue_id)`.

Tables read by the application:

- `rd_venues`
- `rd_orders`
- `rd_order_items`
- `rd_order_item_modifiers`
- `rd_order_status_events`
- `rd_table_sessions`
- `rd_tables`
- `rd_payments`
- `rd_stations`

It **never queries `rd_venue_stripe`**.

### Important payment-intent security note

`rd_payment_intents` was found to have Row Level Security disabled, so this first build deliberately does **not** query that table from the browser. The Payments screen reconciles secured `rd_orders` with secured `rd_payments` instead.

A later safe database migration can enable RLS on `rd_payment_intents` and add an authenticated venue-scoped read policy before adding payment-intent status to the UI.

## Running locally

Because the app uses browser modules/CDN libraries and Supabase network requests, serve the folder from a small web server rather than double-clicking the HTML file.

Example:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Hosting

The folder is static and can be uploaded to any HTTPS static host. Supabase Auth and REST calls are made directly from the browser using the publishable key and authenticated staff access token.

## Ask Analytics safety model

The first version uses deterministic intent matching to approved analytics functions. It does not generate or execute arbitrary SQL. A future AI layer should sit server-side and map natural language only to the same approved analytics operations.
