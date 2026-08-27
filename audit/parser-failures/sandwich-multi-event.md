# Sandwich multi-event (production known failure)

- **original phrase:** My blood glucose is 17 and I feel nauseous. I took 10 units of short acting insulin ten minutes ago. I ate a cheese sandwich four hours ago.
- **actual interpretation (before this work):** one provisional event; nausea dropped or untyped; cheese sandwich collapsed; one capture time on every field
- **expected interpretation:** GLUCOSE_READING 17 now; SYMPTOM nauseous now; INSULIN_TAKEN 10 U short acting −10 min; MEAL cheese sandwich −4 h; no generated dose
- **root cause:** single ProvisionalEvent plus overlay schema without an ordered event collection or independent times
- **fix version:** semantic-events-v1 / diabetes-event-v2
- **regression test ID:** SEM-066, packages/natural-language/test/semantic-known-failures.test.ts
