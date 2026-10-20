# TBS Internal Controls — Phase 1 (staff only)

Scope: **Monthly Close checklist** and **TBS Review Queue** only. This branch is not deployed to production until external recoverable backup and staff login checks are completed.

- Both sidebar entries and views require staff role. Supabase tables also enforce RLS via `tbs_is_staff()`.
- Nine task checklist; `READY_FOR_REVIEW` indicates staff checked boxes, **not** verified accounting or final period lock.
- Priority-based manual queue, OPEN/RESOLVED; no automatic financial changes.
- **Not included**: Client Requests, document uploads, client portal expansion, TBS Client Health Score.
- Tests: `npm test`; deployment build runs the tests first via `npm run build`.

Publication gates: encrypted restorable backup in private Drive, staff sign-in smoke test, row scope and permissions verification, suitable commercial hosting, and release approval.
