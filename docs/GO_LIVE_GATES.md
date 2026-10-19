# TBS Accounting Engine — release gates (Preview only)

Do not merge this branch into main or enable live client usage without explicit owner approval.

## Security blockers
- [ ] Investigate and resolve Chrome Safe Browsing "Dangerous" warning on Preview domain. Do not enter sensitive client data while warning persists.
- [ ] Test client A cannot read client B's requests, messages, metadata, or Storage objects, using two real authenticated client sessions. Do not use service_role or SQL Editor as a substitute.
- [ ] Verify Supabase RLS on all financial tables used by the application (transactions, reconciliations, accounts, invoices, etc.) with client-role test accounts.
- [ ] Verify client/staff privileges, private bucket and signed URL behavior; test expiration, invalid request IDs and cross-client direct URLs.

## Financial correctness
- [ ] Compare monthly transaction count and uncategorized count with Reports for a client/month with real records.
- [ ] Verify reconciliation PASS semantics, period boundaries, source accounts and accounts lacking any reconciliation.
- [ ] Review Health Score scoring policy and missing-data thresholds with business owner; never treat checklist confirmations as verified bank facts.
- [ ] Validate 0-transaction periods, large datasets, no checklist, mixed request statuses and incomplete reconciliations.
- [ ] Test Ready for review cannot falsely finalize an incomplete checklist; verify period locking/approval design.

## Release operations
- [ ] CI build/lint/test checks green; verify Vercel Preview Ready and functional smoke tests.
- [ ] Review schema migrations and rollback plan, backup and recovery, access logging, environment variables and secrets.
- [ ] Confirm privacy disclosures and staff procedures for financial data and document handling.
- [ ] Obtain explicit production approval; only then merge to main and validate production.

Status: NOT READY FOR LIVE USE. This document is a checklist, not a security certification.
