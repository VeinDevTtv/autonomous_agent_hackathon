Smart Document Filler helps you turn piles of invoices, contracts, and receipts into clear, organized summaries and reports. Just upload your documents—our intelligent system reviews, compares, and highlights important details for you, making it easy to spot what matters and take action, all with minimal effort on your part.

## Deploying on Render

The app is set up for [Render](https://render.com) with a Web Service (Next.js) and a Background Worker (multi-agent pipeline). See **[DEPLOY.md](DEPLOY.md)** for prerequisites, environment variables, and step-by-step deployment. Apply Supabase migrations to your Supabase project before or after the first deploy; Render does not run migrations. 