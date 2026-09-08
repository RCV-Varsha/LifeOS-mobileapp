# Identity and ownership foundation

## Scope and status

Current authentication is development/local prototype infrastructure, not production authentication.

This slice establishes an internal user and authorization boundary. It does not provide credentials, login, sessions, JWT validation, OAuth, password management, account recovery, MFA, or production identity assurance.

## Identity model

`public.users` contains only:

- `id`: internal UUID-shaped identifier stored as text so the existing ownership columns can migrate without destructive type changes;
- `status`: `ACTIVE` or `DISABLED`;
- `created_at` and `updated_at`.

No personal profile, inferred traits, secrets, contacts, or behavioral data is stored.

## Development authentication and current user

The backend selects one identity from the server-side `DEV_USER_ID` environment variable. If omitted, it uses the deterministic migrated development user `00000000-0000-4000-8000-000000000001`. The authentication middleware looks that ID up in `users` for every protected request and attaches the active record as `request.user`.

An unknown identity receives `401`. A `DISABLED` identity receives `403` and cannot read, create, or modify protected LifeOS data. `/health` is intentionally public. `GET /me` is protected and returns only:

```json
{
  "user": {
    "id": "00000000-0000-4000-8000-000000000001",
    "status": "ACTIVE"
  }
}
```

Clients cannot select an identity. Protected writes reject `ownerId`, `owner_id`, `userId`, or `user_id`, including nested occurrences. To test a second development user, create an `ACTIVE` row and restart a separate backend process with its server-side `DEV_USER_ID`. Never expose that selection as a client header or body field.

The mobile app calls `/me` once at bootstrap through its centralized session service. Its domain services send no owner identifier and no fake login UI is provided.

## Ownership and authorization

The authenticated request resolves first. Routes pass `request.user.id` into ownership-aware SQL or repositories. Missing and foreign resources both return the same not-found behavior where appropriate. AI generation receives only goal, task, metrics, or proposal context selected through those ownership-scoped queries; AI code never chooses a user or authorizes access.

Direct ownership is stored on goals, goal plans, tasks, daily contexts, daily plans, daily plan items, plan proposals, plan changes, daily reviews, outcomes, and milestones. Repositories and route SQL scope reads and writes by owner. Shared in-process AI generation keys include the owner so concurrent users cannot share results.

Database foreign keys enforce user existence and the following same-owner paths:

- goal plan → goal;
- task → goal plan;
- task → milestone (with the existing trigger also enforcing the same goal);
- daily context → priority task;
- daily plan item → daily plan and task;
- daily plan change → daily plan and proposal;
- outcome → goal;
- milestone → outcome and goal.

These constraints are defense in depth. Application authorization remains mandatory.

## Migration 007

Migration `007_create_identity_and_ownership.sql` creates the development user, replaces every former `local` owner value with its deterministic ID, adds ownership to daily reviews and daily-plan items, removes old ownership defaults, and installs user/composite foreign keys.

The migration is transactional in PostgreSQL. Apply it as one transaction; a failure can be rolled back before commit. The repository uses forward-only migrations, so no destructive down migration is supplied. Restoring the pre-identity schema after deployment requires a database backup because later multi-user rows cannot be represented safely by the former single-owner model.

On the development database used for this slice, before/after counts were identical: 4 goals, 3 goal plans, 40 tasks, and 1 daily review; all adaptive and outcome tables contained 0 rows. All migrated rows belong to the deterministic development user.

## Verification and future replacement

`npm test` runs identity and regression tests. `npm run test:integration` uses the configured PostgreSQL database, creates two isolated user slices inside a transaction, verifies owner-scoped visibility and cross-owner constraint failures, and rolls everything back.

A production authenticator can later replace `developmentAuthentication` with provider-backed JWT or session verification while preserving `request.user`, route contracts, repository signatures, ownership constraints, `/me`, and mobile session bootstrap.

User deletion is deliberately deferred. Before it is introduced, deletion must propagate through domain data, memory, derived AI context, cached proposals, integration data, and every other derived artifact.

Every future user-specific subsystem must have an explicit ownership and authorization model before implementation. This includes preferences, corrections, memory, integrations, AI context, and proactive actions.
