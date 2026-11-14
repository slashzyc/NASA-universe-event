# Vercel frontend with the existing persistent LunaMargin service

This deployment reuses calculation release `c96336e14ea125b988b4f0038d6436d336792501c98cf189cda865ecad3dad88`. It does not generate a new release or move the database. Vercel serves the verified interface and large recordings as static files. The same-origin Node gateway connects only to the existing Cloudflare service; persistent tasks remain in its D1 database and R2 object store.

## Build and configuration

Use Node.js **24.x**, framework preset **Other**, and the repository root. `vercel.json` sets the build command to `node scripts/build-vercel.mjs` and output directory to `vercel-dist`. Do not run the ordinary `npm run build` before this deployment: that command prepares a new release, which would no longer identify the currently deployed service. The builder fails if the source manifest is not the expected release or any archived byte fails its SHA-256 check.

The builder needs `build-info.json` and the complete `evidence-assets` directory from Git. Application working files, reports, database files and local credentials are excluded by `.vercelignore`; they are not used to reconstruct the site. Vercel-assigned production and preview domains need no manually configured origin: the gateway accepts the exact platform-injected `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` and `VERCEL_BRANCH_URL` values. For an additional custom domain, set `LUNAMARGIN_PUBLIC_ORIGIN` to that complete HTTPS origin. Arbitrary incoming Host values do not extend the allowlist. Do not put database credentials in frontend environment variables.

```sh
node scripts/build-vercel.mjs
node --test tests/vercel-build.test.js
```

The build writes a size and integrity receipt to `vercel-dist/vercel-build-report.json`. Current canonical paths are hard links to verified snapshot copies when supported, with a file-copy fallback. Historical releases are not expanded into dozens of duplicate directories.

## Routes and version identity

| Request | Handling |
| --- | --- |
| `/`, `/index.html`, `/navigator.html` | Current exact static HTML. The browser keeps the original query, including language, selected point, dates, task and share identifiers. |
| `/api/*`, `/service-config.json` | Same-origin `api/lunamargin.js` gateway. Responses and errors come from the real persistent service. |
| `/releases/<64-hex-id>/api/*` and its `service-config.json` | The same gateway with a separately validated `release` capture. These rules precede static rewrites. |
| `/releases/c963…/:path` | Internal rewrite to the same current verified static file, with no per-release copy. |
| `/evidence-assets/*` and pinned equivalents | Immutable local snapshots, including every retained historical manifest, calculation source and dataset. |
| Other `/releases/<64-hex-id>/*` | Fixed-origin rewrite to that exact historical path on the original cloud host. It never substitutes the current interface or dataset. Historical availability still depends on the original host retaining that release. |

Recordings remain static under their original paths and hashed names. They never enter the Node gateway; Vercel's static delivery handles normal video range requests. No catch-all function route or single-page-app fallback converts an unknown file into a successful HTML response.

The gateway capture names are `route` and `release`. Duplicate or malformed captures must be rejected by the gateway. The gateway does not accept a client-selected upstream host. A current Vercel URL does not change the original version URLs and byte hashes stored inside previously saved evidence.

## What is verified here

Local tests check release reconstruction, every retained snapshot, refusal of corrupted or missing bytes, safe output replacement, static media, and route ordering. The build receipt reports actual file counts and bytes. These checks do not claim that Vercel authentication, a public domain, forwarding behavior, cookie handling or video range delivery has already been verified online. After deployment, test the full public workflow, a saved task reopened from another page, independent read-only access, API outage/recovery, and actual `Range` responses on a recording.

The configuration follows Vercel's [static project configuration](https://vercel.com/docs/project-configuration/vercel-json), [rewrites](https://vercel.com/docs/routing/rewrites), and [Node.js version settings](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Pin `engines.node` to `24.x`: a broad `>=24` range can select a later supported major release.
