# Vercel hosting with Azure data

Use the repository root as the project Root Directory and the Other framework preset. The committed `vercel.json` runs `npm ci` and `npm run build`, serves `client/dist`, and sends `/api/*` and `/health` to the Express wrapper at `api/index.js`. Node 24 is pinned in the root package manifest. Keep `VITE_API_BASE` unset: production requests should use the same site's API.

## Historical preview while Azure is pending

Set these server environment variables on the deployment:

```text
HARMONIZED_LOCAL_FILE=test-data/harmonized/delivery_2014_morocco.zip
HARMONIZED_SOURCE_NAME=Historical harmonized sample - Morocco 2014
```

Leave `HARMONIZED_SOURCE` unset. The small historical ZIP and shared country definitions are explicitly included in the function bundle. Both Explore and Analyze identify the historical preview; Monitor must not present 2014 predictions as current fires. The file is read-only and can be loaded again after a cold start. This preview requires no Azure credentials.

The multi-million-row local raw archive is excluded. Its SQLite index is Git-ignored and its original test ZIPs are not deployed. Raw archive browsing will therefore be unavailable online. This is separate from the historical sample's working map, calendar, filtered analytics, PDF and CSV exports.

## Switch the same deployment to Azure

When the stable published object is available, remove `HARMONIZED_LOCAL_FILE` and set:

```text
HARMONIZED_SOURCE=https://ACCOUNT.blob.core.windows.net/CONTAINER/published/latest.zip?SAS_PARAMETERS
HARMONIZED_FORMAT=zip
HARMONIZED_SOURCE_NAME=Team harmonized burning activity
```

Configure the actual read-only SAS URL as a sensitive server environment variable, not a `VITE_*` build variable or Git file. Redeploy after changing environment variables. This path uses the existing HTTPS connector; Microsoft Entra managed identity authentication is a separate addition and is not implemented by this configuration. SAS access expires and needs renewal. Airflow should publish a complete replacement ZIP to the agreed object after its run finishes.

Vercel hosts the web/API; Azure remains the source of durable data and Airflow remains the ingestion pipeline. The accepted feed cache lives in memory per instance, so a cold start still needs the bundled sample or a reachable valid cloud object. No cross-instance durable cache is promised.

## Verify a deployment

Check `/`, `/analytics/`, `/monitor/`, `/about/`, `/health`, and `/api/v1/fires`. In sample mode the fires endpoint should return 117 predicted cells and `metadata.preview=true`. Check the calendar, shared UTC date/region filters, and a downloaded search CSV. API failures must return a visible error rather than silently replacing a configured cloud source with demo data.

The function duration is configured to 60 seconds. The client observation request timeout remains 12 seconds and feed download timeout 15 seconds, so production publication size/latency must be measured; the function setting does not extend browser timeouts. Large snapshots and large exports can exceed Vercel response limits even if their upstream ZIP fits our ingestion limits. For substantial multi-year histories, use a paginated data API or a persistent query backend instead of increasing snapshot size indefinitely. The local SQLite archive cannot be turned into durable hosted storage by uploading it with the website.

References: [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json), [Vercel function limits](https://vercel.com/docs/functions/limitations), [Azure storage authorization](https://learn.microsoft.com/en-us/azure/storage/common/authorize-data-access).
