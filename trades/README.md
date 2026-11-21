# Trade Deluxe

Online booking for plumbers, electricians and other mobile trades. Bookings allow for the drive between jobs.

| Path | What it is |
|---|---|
| `/trades/` | Sales page. Add `?edit=1` to edit and publish it. Enquiries go to the Venue CRM under **Trade**. |
| `/trades/app/?b=<business>#book` | A business's live booking page. |
| `/trades/app/?b=<business>#staff` | Run sheet, quotes and setup. Staff sign in with the same logins as Service Deluxe. |
| `/trades/app/#start` | Set up a new business. Needs the setup code. |
| `/trades/demo/` | Demo version that saves only in the browser. Same file as `app/`. |
| `/trades/site/` | Demo trade website. The editable master is `site/source/site-editable.html`. Point its booking page to `/trades/app/?b=<business>` to show live jobs. |
| `/trades/supabase/trades-setup.sql` | Database tables and functions (`trd_*`), already applied to the live project. |
| `/trades/supabase/trd-email/` | Edge Function that sends confirmation, cancellation, quote and lead emails through Resend. |

`app/index.html` and `demo/index.html` are the same file: the page runs live when the address is `/trades/app/` or has `?b=`. Edit `demo/index.html`, then copy it over `app/index.html`.

Not built yet: card payments through Stripe Connect, day-before reminder emails, and an AI chat assistant for Trade Deluxe.
