# Shopify and GA4 reconciliation

Compare Shopify order exports with GA4 purchase exports by transaction ID. The ledger separates missing records, repeated IDs, currency mismatches and value differences. CSV files stay in your browser.

## Run locally

Use Node.js 22.23 or later and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm dev
```

Open the local URL printed by Vite. Load the synthetic sample or choose two CSV exports, check the column mapping and compare. `pnpm preview` serves the production build.

## Stack and limits

TypeScript and Vite, with no backend or external account requirement. The reconciliation modules and browser controller come from the Task website. See [SOURCE.md](SOURCE.md) for the exact snapshot and unchanged modules. [Hosted version](https://taskfordaniel.com/tools/shopify-ga4-reconciliation/).

Match the export period, revenue basis, property time zone and reporting currency. The tool does not convert currency, establish why an order is missing, or prove duplicate tagging from a repeated export row. Limits: 10 MB and 50,000 rows per file. Included CSVs are synthetic.

Licensed under Apache-2.0. See [LICENSE](LICENSE).
