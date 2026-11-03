# Running the connected application

The backend requires the PostgreSQL values in `backend/.env.example`. Copy this to `backend/.env` and supply real values locally. The client never receives provider keys or database credentials.

## Database

For a fresh database, run `npm run migrate` from `backend`. Migrations are transactional, checksummed, and serialized by an advisory lock.

For the old manually migrated installation only, `node --env-file=.env src/migrate.ts --baseline-existing` verifies the expected historical tables and adopts migrations 001–010. It does not rerun those migrations. Do not use this flag on a partially migrated database. Back up important data before adopting a legacy installation.

## Development

1. Run `npm start` from `backend`.
2. Run `npm run web` from `app`, with `EXPO_PUBLIC_API_URL` set to the backend origin.
3. Register an account in the app. Authentication uses real sessions by default. The old development identity requires explicit `AUTH_MODE=development` and is forbidden with `NODE_ENV=production`.
4. Android USB development follows `android-usb-development.md`. Rebuild the APK after adding secure storage; an older installed binary will not contain the new native module.

To serve the web export from the backend, run `npm run build:web -- --clear` in `app`, set `SERVE_WEB=1`, and start the backend. Production web builds fall back to their serving origin when no explicit API URL is configured. Clear the Metro export cache when changing a compiled public environment value.

## Synthetic demonstration

Create a separate demo account. Set `SEED_USER_ID` to its user ID and run `npm run seed` from `backend`. This writes two goals, objectives, projects, milestones, eight tasks, dependencies, six knowledge items, recorded decisions, explicit memories and a calendar commitment. A second seed on the same account is rejected. The seed does not create fabricated model responses or hardcoded UI insights.

## AI

The existing Groq key/model drive structured assistant responses. Knowledge search defaults to PostgreSQL keyword retrieval and explicit graph expansion. A configured OpenAI-compatible embeddings endpoint is required for semantic search: `EMBEDDING_API_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`. Index an item explicitly with `POST /knowledge/:id/index` after configuring it. Edits invalidate old chunks.

Embedding vectors are persisted in PostgreSQL arrays and ranked by exact cosine similarity over the owner-scoped candidate set. This is a real exact-search implementation, but it needs a database vector index and load validation before claiming large-corpus performance. No artificial vectors are generated when the provider is absent.

## Container deployment

`Dockerfile` builds the Expo web export and runs the Node API as a non-root user. `compose.yaml` starts PostgreSQL and applies migrations before the API starts. Supply environment values externally, then run `docker compose up --build`.

The container definition has not been built in this session. Compose binds only to loopback. Configure an HTTPS reverse proxy and the matching `WEB_ORIGINS` before exposing the service. No remote production deployment was performed. Set backups, restore tests, monitoring and provider usage controls before using this with important personal data.

## Windows Android build

This host required the Windows certificate store and a shorter Java temporary path. In PowerShell, create `app/build/java-tmp`, set `JAVA_TOOL_OPTIONS` to:

```text
-Djava.io.tmpdir=C:\MyProjects\LifeOS\app\build\java-tmp -Djdk.net.unixdomain.tmpdir=C:\MyProjects\LifeOS\app\build\java-tmp -Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE
```

Then run `./gradlew.bat :app:assembleDebug --no-daemon` from `app/android`. These settings do not disable certificate validation. The debug APK requires Metro; it is not a signed production release.
