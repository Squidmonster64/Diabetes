-- audit_events.calculation_id must correlate events to a calculation
-- attempt, but the audit trail is append-only and, per
-- BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md section 9.1, the
-- CALCULATION_STARTED event is written *before* any row exists in
-- `calculations` (persistence must fail closed ahead of showing any result,
-- and the calculations row for a refusal/success is only written after
-- gates/arithmetic run). A hard foreign key here rejects that first event
-- with a foreign-key violation, discovered during live production
-- smoke-testing. calculation_id remains a plain correlating UUID column;
-- referential integrity for it is not enforceable given the required write
-- order, so the FK is dropped rather than relaxed to deferrable (Supabase's
-- pooled/transaction-per-statement usage here does not benefit from
-- deferrable constraints).

alter table public.audit_events
  drop constraint if exists audit_events_calculation_id_fkey;
