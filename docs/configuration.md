# Configuration — environment variables (.env)

> **For dummies:** This service has no config UI — everything is set through environment
> variables in a `.env` file (locally) or injected by the deploy pipeline (staging/prod).
> This page lists every variable, says which ones actually do something, and gives you a
> copy‑paste starting point.

- [How config is loaded](#how-config-is-loaded)
- [The variables that matter](#the-variables-that-matter)
- [Variables present but not consumed](#variables-present-but-not-consumed)
- [Copy-paste starting points](#copy-paste-starting-points)
- [Typesense: self-hosted vs Cloud](#typesense-self-hosted-vs-cloud)
- [The COUNTRY_LANGUAGE_MAP explained](#the-country_language_map-explained)
- [Secrets & safety](#secrets--safety)

---

## How config is loaded

`ConfigModule.forRoot({ isGlobal: true, load: [configuration] })` reads
[`src/config/configuration.ts`](../src/config/configuration.ts) at startup and exposes a
typed config object app‑wide. A few values are read straight from `process.env` instead
(`NODE_ENV`, `COUNTRY_LANGUAGE_MAP`, `DATABASE_URL` in the Prisma service).

```mermaid
flowchart LR
  ENV[".env / injected env"] --> CFG["configuration.ts"]
  CFG --> C1["port"]
  CFG --> C2["database.url"]
  CFG --> C3["searchEngine"]
  CFG --> C4["typesense.*"]
  ENV -->|"direct process.env"| D1["NODE_ENV → GraphQL playground / error formatting"]
  ENV -->|"direct process.env"| D2["COUNTRY_LANGUAGE_MAP → locale.config.ts"]
  ENV -->|"direct process.env"| D3["DATABASE_URL → PrismaService"]
  C4 --> ENG["TypesenseSearchEngine client"]
  C3 --> SVC["SearchService engine routing"]
```

---

## The variables that matter

These are read by the code. Defaults are what the code falls back to if the variable is
unset.

| Variable | Read by | Default | What it does |
|----------|---------|---------|--------------|
| `DATABASE_URL` | `PrismaService`, `configuration.ts` | — (required) | PostgreSQL connection string for the shared cluster. No default — the service can't run without it. |
| `PORT` | `main.ts`, `configuration.ts` | `4005` (code) / `4006` (deploys) | HTTP port the service listens on. The Docker image `EXPOSE`s `4006`. |
| `NODE_ENV` | `app.module.ts` | — | When **not** `production`: enables GraphQL Playground. When `production`: disables Playground and strips exception details from GraphQL errors. |
| `SEARCH_ENGINE` | `configuration.ts`, `SearchService` | `typesense` | Which backend serves `search`: `typesense` (default) or `postgres` (legacy full‑text fallback for rollback). |
| `TYPESENSE_HOST` | `configuration.ts` → engine | `localhost` | Typesense host or container name. |
| `TYPESENSE_PORT` | `configuration.ts` → engine | `8108` | Typesense port. |
| `TYPESENSE_PROTOCOL` | `configuration.ts` → engine | `http` | `http` or `https` (use `https` for Cloud). |
| `TYPESENSE_API_KEY` | `configuration.ts` → engine | `dev-typesense-key` | API key. **Must match** the key the Typesense server runs with. |
| `TYPESENSE_TIMEOUT` | `configuration.ts` → engine | `5` | Client connection timeout, in seconds. |
| `COUNTRY_LANGUAGE_MAP` | `locale.config.ts` | _(empty)_ | Maps a `Country.id` → default content language **at index time**. Format `"<id>:<lang>,…"`, e.g. `1:es,2:en,5:fr`. Empty ⇒ everything indexes as `es`. |

### Notes on specific ones

- **`SEARCH_ENGINE`** — flip to `postgres` to roll back to full‑text search *without
  redeploying code*. Restart required. See
  [search-flow.md → routing](search-flow.md#engine-vs-postgres-routing).
- **`TYPESENSE_API_KEY`** — this same key appears in **two** places that must agree: the
  app's env (client) **and** the Typesense server's startup (`--api-key`, provided via
  `.env.typesense.*`). If they differ, every search fails auth.
- **`COUNTRY_LANGUAGE_MAP`** — only affects **indexing** (what `language` a document gets),
  never retrieval. Changing it requires a **reindex** to take effect. See
  [below](#the-country_language_map-explained).

---

## Variables present but not consumed

These appear in the committed `.env` files but are **not read by this service's code**
today. Listed so you don't assume they're wired up:

| Variable | Status |
|----------|--------|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Not consumed here. This subgraph trusts identity headers set by the gateway (`x-seller-id`, `x-admin-id`) and does not verify JWTs itself. Reserved / inherited from the service template. |
| `ENVIRONMENT` | Not read by the code (which keys off `NODE_ENV`). Informational only. |
| `ALLOWED_ORIGINS` | Not consumed. `main.ts` calls `app.enableCors()` with no arguments, so CORS is currently **open to all origins**. If you need to restrict origins, wire this into `enableCors({ origin: ... })`. |

> If you make any of these functional later, update this table and the referenced code so
> the docs stay the contract.

---

## Copy-paste starting points

### Local development

```env
# Database (point at your local/staging Postgres)
DATABASE_URL="postgresql://user:password@localhost:5432/ekoru-dev?schema=public"
PORT=4006
NODE_ENV="development"

# Search engine
SEARCH_ENGINE="typesense"

# Typesense (matches docker-compose.yml)
TYPESENSE_HOST="localhost"
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL="http"
TYPESENSE_API_KEY="dev-typesense-key"
TYPESENSE_TIMEOUT=5

# Country id → content language at index time (use your real Country ids)
COUNTRY_LANGUAGE_MAP="1:es,2:en,3:en,4:es,5:fr"
```

### Staging / production (shape only — real secrets come from the deploy pipeline)

```env
DATABASE_URL="postgresql://<user>:<password>@<db-host>:5432/<db-name>?schema=public"
PORT=4006
NODE_ENV="production"

SEARCH_ENGINE="typesense"
TYPESENSE_HOST="ekoru-typesense"          # the Typesense container name on the shared network
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL="http"
TYPESENSE_API_KEY="<same 32-byte key the Typesense server runs with>"
TYPESENSE_TIMEOUT=5

COUNTRY_LANGUAGE_MAP="1:es,2:en,3:en,4:es,5:fr"
```

The Typesense **server's** key is set separately (e.g. `.env.typesense.prod`, read by the
standalone Typesense compose stack). The two keys must be identical.

---

## Typesense: self-hosted vs Cloud

Because the engine is fully config‑driven, moving to Typesense Cloud is an env change — no
code change:

| Setting | Self‑hosted (Docker) | Typesense Cloud |
|---------|----------------------|-----------------|
| `TYPESENSE_HOST` | `localhost` / container name | `<cluster-id>.a1.typesense.net` |
| `TYPESENSE_PORT` | `8108` | `443` |
| `TYPESENSE_PROTOCOL` | `http` | `https` |
| `TYPESENSE_API_KEY` | the `--api-key` you started the container with | the cluster's API key |

Local Typesense is defined in [`docker-compose.yml`](../docker-compose.yml):

```yaml
services:
  typesense:
    image: typesense/typesense:27.1
    ports: ["8108:8108"]
    command: >
      --data-dir /data
      --api-key=${TYPESENSE_API_KEY:-dev-typesense-key}
      --enable-cors
    volumes: [typesense-data:/data]
```

In staging/prod, Typesense runs as a **standalone, long‑lived stack** (kept out of the app
compose file) so redeploying the app never restarts the search engine. App ↔ Typesense
talk over the shared Docker network by container name, with no host port exposed.

---

## The COUNTRY_LANGUAGE_MAP explained

This is the one non‑obvious variable. It answers: *"for a seller in country N, what
language are their items, if the seller didn't state one explicitly?"*

```
COUNTRY_LANGUAGE_MAP="1:es,2:en,3:en,4:es,5:fr"
                       │    │    │    │    │
                    CL→es CA→en US→en AR→es FR→fr
```

- Format: comma‑separated `<countryId>:<lang>` pairs. `<lang>` must be one of `es`, `en`,
  `fr` (others are ignored).
- It's the **fallback**. A seller's explicit `contentLanguage` wins over it; if neither is
  set, the language is `es`. (Full priority order in
  [database.md → language derivation](database.md#language--country-derivation).)
- Country ids are **environment‑specific** (they're rows in the `Country` table), which is
  exactly why this is configuration and not hardcoded.
- **Bilingual markets fall out naturally:** map Canada to `en`, and francophone sellers
  there (whose `contentLanguage` is `fr`) still index as `fr` — so Canada ends up bilingual
  in the one `catalog` collection.

> Changing this map only affects **future** indexing. Run a full reindex to re‑stamp
> existing documents.

---

## Secrets & safety

- **Never commit real secrets in documentation or examples.** The values above are
  placeholders. Real `DATABASE_URL` passwords, JWT secrets and the production
  `TYPESENSE_API_KEY` live only in the deploy pipeline's secret store and the untracked
  `.env` files.
- The committed `.env` files in this repo contain environment‑specific values; treat the
  production key material in them as sensitive and rotate anything that leaks.
- The durable source for a deploy is the pipeline's secret copy of `.env.<env>`, not a
  developer's local file.

---

**Next:** [How to extend the service →](extending.md)
