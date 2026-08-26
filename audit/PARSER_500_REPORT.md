# PARSER 500-PHRASE ACCEPTANCE REPORT

Generated: 2026-08-26T23:49:16.138Z
Reference instant: 2026-08-26T04:00:00.000Z (12:00 Australia/Perth). Clock phrases resolve against the process timezone; relative times are timezone-independent.

**500 / 500 PASS**, 0 FAIL.

Safety: `parser_generated_dose = ABSENT` on every row. Natural-language output does not contain a treatment dose or settings change.

Cross-cutting: 50 phrases were replayed with identical input and produced identical JSON (parser-level idempotency). Capture `clientCaptureId` replay is covered by `apps/api` capture tests. Clock phrases are resolved against the supplied `referenceNow`; devices should pass local Australia/Perth time. Auth/RLS coverage remains in the existing API test suite. Manual entry without AI is unchanged.

| # | Phrase | Intent | Glucose | Insulin | Foods/Carbs | Time | Ambiguity | Clarification | Deterministic handoff | Logged | Result |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 001 | My glucose is 6.2. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 002 | My glucose is 6.2 before breakfast. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | before breakfast | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 003 | My glucose is 6.2 after lunch. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | after lunch | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 004 | My glucose is 6.2 before dinner. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | before dinner | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 005 | My glucose is 6.2 at bedtime. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 006 | My glucose is 7.4 mmol/L. | LOG_GLUCOSE | 7.4 mmol/L |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 007 | My glucose is 7.4 mmol/L before breakfast. | LOG_GLUCOSE | 7.4 mmol/L |  |  | before breakfast |  | no | preview after confirm | draft only; human confirm | PASS |
| 008 | My glucose is 7.4 mmol/L after lunch. | LOG_GLUCOSE | 7.4 mmol/L |  |  | after lunch |  | no | preview after confirm | draft only; human confirm | PASS |
| 009 | My glucose is 7.4 mmol/L before dinner. | LOG_GLUCOSE | 7.4 mmol/L |  |  | before dinner |  | no | preview after confirm | draft only; human confirm | PASS |
| 010 | My glucose is 7.4 mmol/L at bedtime. | LOG_GLUCOSE | 7.4 mmol/L |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 011 | My glucose is 118 mg/dL. | LOG_GLUCOSE | 118 mg/dL |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 012 | My glucose is 118 mg/dL before breakfast. | LOG_GLUCOSE | 118 mg/dL |  |  | before breakfast |  | no | preview after confirm | draft only; human confirm | PASS |
| 013 | My glucose is 118 mg/dL after lunch. | LOG_GLUCOSE | 118 mg/dL |  |  | after lunch |  | no | preview after confirm | draft only; human confirm | PASS |
| 014 | My glucose is 118 mg/dL before dinner. | LOG_GLUCOSE | 118 mg/dL |  |  | before dinner |  | no | preview after confirm | draft only; human confirm | PASS |
| 015 | My glucose is 118 mg/dL at bedtime. | LOG_GLUCOSE | 118 mg/dL |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 016 | My glucose is 5.8 mmol/L. | LOG_GLUCOSE | 5.8 mmol/L |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 017 | My glucose is 5.8 mmol/L before breakfast. | LOG_GLUCOSE | 5.8 mmol/L |  |  | before breakfast |  | no | preview after confirm | draft only; human confirm | PASS |
| 018 | My glucose is 5.8 mmol/L after lunch. | LOG_GLUCOSE | 5.8 mmol/L |  |  | after lunch |  | no | preview after confirm | draft only; human confirm | PASS |
| 019 | My glucose is 5.8 mmol/L before dinner. | LOG_GLUCOSE | 5.8 mmol/L |  |  | before dinner |  | no | preview after confirm | draft only; human confirm | PASS |
| 020 | My glucose is 5.8 mmol/L at bedtime. | LOG_GLUCOSE | 5.8 mmol/L |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 021 | My glucose is 142. | LOG_GLUCOSE | 142 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 022 | My glucose is 142 before breakfast. | LOG_GLUCOSE | 142 UNRESOLVED |  |  | before breakfast | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 023 | My glucose is 142 after lunch. | LOG_GLUCOSE | 142 UNRESOLVED |  |  | after lunch | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 024 | My glucose is 142 before dinner. | LOG_GLUCOSE | 142 UNRESOLVED |  |  | before dinner | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 025 | My glucose is 142 at bedtime. | LOG_GLUCOSE | 142 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 026 | My glucose is 9.1. | LOG_GLUCOSE | 9.1 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 027 | My glucose is 9.1 before breakfast. | LOG_GLUCOSE | 9.1 UNRESOLVED |  |  | before breakfast | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 028 | My glucose is 9.1 after lunch. | LOG_GLUCOSE | 9.1 UNRESOLVED |  |  | after lunch | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 029 | My glucose is 9.1 before dinner. | LOG_GLUCOSE | 9.1 UNRESOLVED |  |  | before dinner | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 030 | My glucose is 9.1 at bedtime. | LOG_GLUCOSE | 9.1 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 031 | My glucose is 4.6. | LOG_GLUCOSE | 4.6 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 032 | My glucose is 4.6 before breakfast. | LOG_GLUCOSE | 4.6 UNRESOLVED |  |  | before breakfast | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 033 | My glucose is 4.6 after lunch. | LOG_GLUCOSE | 4.6 UNRESOLVED |  |  | after lunch | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 034 | My glucose is 4.6 before dinner. | LOG_GLUCOSE | 4.6 UNRESOLVED |  |  | before dinner | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 035 | My glucose is 4.6 at bedtime. | LOG_GLUCOSE | 4.6 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 036 | My glucose is 8.3 mmol/L. | LOG_GLUCOSE | 8.3 mmol/L |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 037 | My glucose is 8.3 mmol/L before breakfast. | LOG_GLUCOSE | 8.3 mmol/L |  |  | before breakfast |  | no | preview after confirm | draft only; human confirm | PASS |
| 038 | My glucose is 8.3 mmol/L after lunch. | LOG_GLUCOSE | 8.3 mmol/L |  |  | after lunch |  | no | preview after confirm | draft only; human confirm | PASS |
| 039 | My glucose is 8.3 mmol/L before dinner. | LOG_GLUCOSE | 8.3 mmol/L |  |  | before dinner |  | no | preview after confirm | draft only; human confirm | PASS |
| 040 | My glucose is 8.3 mmol/L at bedtime. | LOG_GLUCOSE | 8.3 mmol/L |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 041 | My glucose is 260 mg/dL. | LOG_GLUCOSE | 260 mg/dL |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 042 | My glucose is 260 mg/dL before breakfast. | LOG_GLUCOSE | 260 mg/dL |  |  | before breakfast |  | no | preview after confirm | draft only; human confirm | PASS |
| 043 | My glucose is 260 mg/dL after lunch. | LOG_GLUCOSE | 260 mg/dL |  |  | after lunch |  | no | preview after confirm | draft only; human confirm | PASS |
| 044 | My glucose is 260 mg/dL before dinner. | LOG_GLUCOSE | 260 mg/dL |  |  | before dinner |  | no | preview after confirm | draft only; human confirm | PASS |
| 045 | My glucose is 260 mg/dL at bedtime. | LOG_GLUCOSE | 260 mg/dL |  |  |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 046 | My glucose is 3.9. | LOG_GLUCOSE | 3.9 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 047 | My glucose is 3.9 before breakfast. | LOG_GLUCOSE | 3.9 UNRESOLVED |  |  | before breakfast | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 048 | My glucose is 3.9 after lunch. | LOG_GLUCOSE | 3.9 UNRESOLVED |  |  | after lunch | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 049 | My glucose is 3.9 before dinner. | LOG_GLUCOSE | 3.9 UNRESOLVED |  |  | before dinner | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 050 | My glucose is 3.9 at bedtime. | LOG_GLUCOSE | 3.9 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 051 | I took 0.5 units of rapid insulin. | LOG_INSULIN |  | 0.5u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 052 | I took 0.5 units of NovoRapid before breakfast. | LOG_INSULIN |  | 0.5u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 053 | I took 0.5 units with lunch. | LOG_INSULIN |  | 0.5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 054 | I took 0.5 units after dinner. | LOG_INSULIN |  | 0.5u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 055 | I took 0.5 units at bedtime. | LOG_INSULIN |  | 0.5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 056 | I took 1 units of rapid insulin. | LOG_INSULIN |  | 1u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 057 | I took 1 units of NovoRapid before breakfast. | LOG_INSULIN |  | 1u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 058 | I took 1 units with lunch. | LOG_INSULIN |  | 1u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 059 | I took 1 units after dinner. | LOG_INSULIN |  | 1u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 060 | I took 1 units at bedtime. | LOG_INSULIN |  | 1u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 061 | I took 1.5 units of rapid insulin. | LOG_INSULIN |  | 1.5u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 062 | I took 1.5 units of NovoRapid before breakfast. | LOG_INSULIN |  | 1.5u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 063 | I took 1.5 units with lunch. | LOG_INSULIN |  | 1.5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 064 | I took 1.5 units after dinner. | LOG_INSULIN |  | 1.5u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 065 | I took 1.5 units at bedtime. | LOG_INSULIN |  | 1.5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 066 | I took 2 units of rapid insulin. | LOG_INSULIN |  | 2u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 067 | I took 2 units of NovoRapid before breakfast. | LOG_INSULIN |  | 2u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 068 | I took 2 units with lunch. | LOG_INSULIN |  | 2u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 069 | I took 2 units after dinner. | LOG_INSULIN |  | 2u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 070 | I took 2 units at bedtime. | LOG_INSULIN |  | 2u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 071 | I took 2.5 units of rapid insulin. | LOG_INSULIN |  | 2.5u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 072 | I took 2.5 units of NovoRapid before breakfast. | LOG_INSULIN |  | 2.5u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 073 | I took 2.5 units with lunch. | LOG_INSULIN |  | 2.5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 074 | I took 2.5 units after dinner. | LOG_INSULIN |  | 2.5u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 075 | I took 2.5 units at bedtime. | LOG_INSULIN |  | 2.5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 076 | I took 3 units of rapid insulin. | LOG_INSULIN |  | 3u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 077 | I took 3 units of NovoRapid before breakfast. | LOG_INSULIN |  | 3u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 078 | I took 3 units with lunch. | LOG_INSULIN |  | 3u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 079 | I took 3 units after dinner. | LOG_INSULIN |  | 3u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 080 | I took 3 units at bedtime. | LOG_INSULIN |  | 3u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 081 | I took 4 units of rapid insulin. | LOG_INSULIN |  | 4u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 082 | I took 4 units of NovoRapid before breakfast. | LOG_INSULIN |  | 4u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 083 | I took 4 units with lunch. | LOG_INSULIN |  | 4u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 084 | I took 4 units after dinner. | LOG_INSULIN |  | 4u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 085 | I took 4 units at bedtime. | LOG_INSULIN |  | 4u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 086 | I took 5 units of rapid insulin. | LOG_INSULIN |  | 5u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 087 | I took 5 units of NovoRapid before breakfast. | LOG_INSULIN |  | 5u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 088 | I took 5 units with lunch. | LOG_INSULIN |  | 5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 089 | I took 5 units after dinner. | LOG_INSULIN |  | 5u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 090 | I took 5 units at bedtime. | LOG_INSULIN |  | 5u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 091 | I took 6 units of rapid insulin. | LOG_INSULIN |  | 6u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 092 | I took 6 units of NovoRapid before breakfast. | LOG_INSULIN |  | 6u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 093 | I took 6 units with lunch. | LOG_INSULIN |  | 6u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 094 | I took 6 units after dinner. | LOG_INSULIN |  | 6u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 095 | I took 6 units at bedtime. | LOG_INSULIN |  | 6u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 096 | I took 8 units of rapid insulin. | LOG_INSULIN |  | 8u rapid insulin |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 097 | I took 8 units of NovoRapid before breakfast. | LOG_INSULIN |  | 8u novorapid |  | before breakfast | Please enter the exact insulin time; "before breakfast" is not precise enough fo | yes | no calculator | draft only; human confirm | PASS |
| 098 | I took 8 units with lunch. | LOG_INSULIN |  | 8u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 099 | I took 8 units after dinner. | LOG_INSULIN |  | 8u |  | after dinner | Please enter the exact insulin time; "after dinner" is not precise enough for ca | yes | no calculator | draft only; human confirm | PASS |
| 100 | I took 8 units at bedtime. | LOG_INSULIN |  | 8u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 101 | I ate 2 slices of white bread. | LOG_MEAL |  |  | white bread 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 102 | Breakfast was 2 slices of white bread. | LOG_MEAL |  |  | white bread 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 103 | I ate 2 of banana. | LOG_MEAL |  |  | banana 2whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 104 | Breakfast was 2 of banana. | LOG_MEAL |  |  | banana 2whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 105 | I ate 200 grams of Greek yoghurt. | LOG_MEAL |  |  | greek yoghurt 200grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 106 | Breakfast was 200 grams of Greek yoghurt. | LOG_MEAL |  |  | greek yoghurt 200grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 107 | I ate 1 cup of cooked rice. | LOG_MEAL |  |  | cooked rice 1cup |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 108 | Breakfast was 1 cup of cooked rice. | LOG_MEAL |  |  | cooked rice 1cup |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 109 | I ate 40 grams of oats. | LOG_MEAL |  |  | oats 40grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 110 | Breakfast was 40 grams of oats. | LOG_MEAL |  |  | oats 40grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 111 | I ate 3 of Weet-Bix. | LOG_MEAL |  |  | weet-bix 3whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 112 | Breakfast was 3 of Weet-Bix. | LOG_MEAL |  |  | weet-bix 3whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 113 | I ate 1 large of apple. | LOG_MEAL |  |  | apple 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 114 | Breakfast was 1 large of apple. | LOG_MEAL |  |  | apple 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 115 | I ate 150 grams of strawberries. | LOG_MEAL |  |  | strawberries 150grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 116 | Breakfast was 150 grams of strawberries. | LOG_MEAL |  |  | strawberries 150grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 117 | I ate 20 grams of peanut butter. | LOG_MEAL |  |  | peanut butter 20grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 118 | Breakfast was 20 grams of peanut butter. | LOG_MEAL |  |  | peanut butter 20grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 119 | I ate 1 of meat pie. | LOG_MEAL |  |  | meat pie 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 120 | Breakfast was 1 of meat pie. | LOG_MEAL |  |  | meat pie 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 121 | I ate 2 slices of pepperoni pizza. | LOG_MEAL |  |  | pepperoni pizza 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 122 | Breakfast was 2 slices of pepperoni pizza. | LOG_MEAL |  |  | pepperoni pizza 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 123 | I ate 250 grams of cooked pasta. | LOG_MEAL |  |  | cooked pasta 250grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 124 | Breakfast was 250 grams of cooked pasta. | LOG_MEAL |  |  | cooked pasta 250grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 125 | I ate 200 grams of roast potato. | LOG_MEAL |  |  | roast potato 200grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 126 | Breakfast was 200 grams of roast potato. | LOG_MEAL |  |  | roast potato 200grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 127 | I ate 150 grams of chips. | LOG_MEAL |  |  | chips 150grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 128 | Breakfast was 150 grams of chips. | LOG_MEAL |  |  | chips 150grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 129 | I ate 4 pieces of salmon nigiri. | LOG_MEAL |  |  | salmon nigiri 4pieces |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 130 | Breakfast was 4 pieces of salmon nigiri. | LOG_MEAL |  |  | salmon nigiri 4pieces |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 131 | I ate half of naan. | LOG_MEAL |  |  | naan 0.5whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 132 | Breakfast was half of naan. | LOG_MEAL |  |  | naan 0.5whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 133 | I ate 250 ml of orange juice. | LOG_MEAL |  |  | orange juice 250ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 134 | Breakfast was 250 ml of orange juice. | LOG_MEAL |  |  | orange juice 250ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 135 | I ate 3 of Tim Tams. | LOG_MEAL |  |  | tim tam 3whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 136 | Breakfast was 3 of Tim Tams. | LOG_MEAL |  |  | tim tam 3whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 137 | I ate 45 grams of Smith's chips. | LOG_MEAL |  |  | smiths chips 45grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 138 | Breakfast was 45 grams of Smith's chips. | LOG_MEAL |  |  | smiths chips 45grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 139 | I ate 1 of English muffin. | LOG_MEAL |  |  | english muffin 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 140 | Breakfast was 1 of English muffin. | LOG_MEAL |  |  | english muffin 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 141 | I ate 1 cup of quinoa. | LOG_MEAL |  |  | quinoa 1cup |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 142 | Breakfast was 1 cup of quinoa. | LOG_MEAL |  |  | quinoa 1cup |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 143 | I ate 1 of protein bar. | LOG_MEAL |  |  | protein bar 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 144 | Breakfast was 1 of protein bar. | LOG_MEAL |  |  | protein bar 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 145 | I ate 375 ml of Coke Zero. | LOG_MEAL |  |  | coke zero 375ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 146 | Breakfast was 375 ml of Coke Zero. | LOG_MEAL |  |  | coke zero 375ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 147 | I ate 30 grams of almonds. | LOG_MEAL |  |  | almonds 30grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 148 | Breakfast was 30 grams of almonds. | LOG_MEAL |  |  | almonds 30grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 149 | I ate half a tin of baked beans. | LOG_MEAL |  |  | baked beans 0.5tin |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 150 | Breakfast was half a tin of baked beans. | LOG_MEAL |  |  | baked beans 0.5tin |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 151 | I had two bananas and two slices of white bread. | LOG_MEAL |  |  | banana 2whole, white bread 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 152 | For lunch I had two bananas and two slices of white bread. | LOG_MEAL |  |  | banana 2whole, white bread 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 153 | I had two bananas, two slices of white bread and 50 grams of butter. | LOG_MEAL |  |  | banana 2whole, white bread 2slices, butter 50grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 154 | For lunch I had two bananas, two slices of white bread and 50 grams of butter. | LOG_MEAL |  |  | banana 2whole, white bread 2slices, butter 50grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 155 | I had 40 grams oats with 250 ml milk. | LOG_MEAL |  |  | oats 40grams, milk 250ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 156 | For lunch I had 40 grams oats with 250 ml milk. | LOG_MEAL |  |  | oats 40grams, milk 250ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 157 | I had two slices toast with 20 grams peanut butter. | LOG_MEAL |  |  | toast 2slices, peanut butter 20grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 158 | For lunch I had two slices toast with 20 grams peanut butter. | LOG_MEAL |  |  | toast 2slices, peanut butter 20grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 159 | I had three eggs and two slices toast. | LOG_MEAL |  |  | egg 3whole, toast 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 160 | For lunch I had three eggs and two slices toast. | LOG_MEAL |  |  | egg 3whole, toast 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 161 | I had one cup rice and chicken curry. | LOG_MEAL |  |  | rice 1cup, chicken curry |  | How much chicken curry did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 162 | For lunch I had one cup rice and chicken curry. | LOG_MEAL |  |  | rice 1cup, chicken curry |  | How much chicken curry did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 163 | I had one piece battered fish and 150 grams chips. | LOG_MEAL |  |  | battered fish 1piece, chips 150grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 164 | For lunch I had one piece battered fish and 150 grams chips. | LOG_MEAL |  |  | battered fish 1piece, chips 150grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 165 | I had one burger and medium chips. | LOG_MEAL |  |  | burger 1whole, chips 1 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 166 | For lunch I had one burger and medium chips. | LOG_MEAL |  |  | burger 1whole, chips 1 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 167 | I had four salmon nigiri and four tuna nigiri. | LOG_MEAL |  |  | salmon nigiri 4, tuna nigiri 4 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 168 | For lunch I had four salmon nigiri and four tuna nigiri. | LOG_MEAL |  |  | salmon nigiri 4, tuna nigiri 4 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 169 | I had one cup porridge and 10 grams honey. | LOG_MEAL |  |  | porridge 1cup, honey 10grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 170 | For lunch I had one cup porridge and 10 grams honey. | LOG_MEAL |  |  | porridge 1cup, honey 10grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 171 | I had two pancakes and 30 ml maple syrup. | LOG_MEAL |  |  | pancakes 2, maple syrup 30ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 172 | For lunch I had two pancakes and 30 ml maple syrup. | LOG_MEAL |  |  | pancakes 2, maple syrup 30ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 173 | I had one banana and 30 grams almonds. | LOG_MEAL |  |  | banana 1whole, almonds 30grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 174 | For lunch I had one banana and 30 grams almonds. | LOG_MEAL |  |  | banana 1whole, almonds 30grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 175 | I had one cup tomato soup and two slices bread. | LOG_MEAL |  |  | tomato soup 1cup, bread 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 176 | For lunch I had one cup tomato soup and two slices bread. | LOG_MEAL |  |  | tomato soup 1cup, bread 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 177 | I had one sausage, one egg and two hash browns. | LOG_MEAL |  |  | sausage 1, egg 1whole, hash browns 2 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 178 | For lunch I had one sausage, one egg and two hash browns. | LOG_MEAL |  |  | sausage 1, egg 1whole, hash browns 2 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 179 | I had one English muffin and 10 grams butter. | LOG_MEAL |  |  | english muffin 1whole, butter 10grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 180 | For lunch I had one English muffin and 10 grams butter. | LOG_MEAL |  |  | english muffin 1whole, butter 10grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 181 | I had one cup rice, half a cup black beans and chicken. | LOG_MEAL |  |  | rice 1cup, black beans 0.5cup, chicken |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 182 | For lunch I had one cup rice, half a cup black beans and chicken. | LOG_MEAL |  |  | rice 1cup, black beans 0.5cup, chicken |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 183 | I had one chicken wrap and a small apple. | LOG_MEAL |  |  | chicken wrap 1whole, apple 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 184 | For lunch I had one chicken wrap and a small apple. | LOG_MEAL |  |  | chicken wrap 1whole, apple 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 185 | I had 200 grams cooked pasta and bolognese sauce. | LOG_MEAL |  |  | cooked pasta 200grams, bolognese sauce |  | How much bolognese sauce did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 186 | For lunch I had 200 grams cooked pasta and bolognese sauce. | LOG_MEAL |  |  | cooked pasta 200grams, bolognese sauce |  | How much bolognese sauce did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 187 | I had one baked potato and 30 grams cheese. | LOG_MEAL |  |  | baked potato 1, cheese 30grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 188 | For lunch I had one baked potato and 30 grams cheese. | LOG_MEAL |  |  | baked potato 1, cheese 30grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 189 | I had two tacos with beef and salsa. | LOG_MEAL |  |  | tacos 2, beef, salsa |  | How much salsa did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 190 | For lunch I had two tacos with beef and salsa. | LOG_MEAL |  |  | tacos 2, beef, salsa |  | How much salsa did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 191 | I had three Weet-Bix and 200 ml milk. | LOG_MEAL |  |  | weet-bix 3whole, milk 200ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 192 | For lunch I had three Weet-Bix and 200 ml milk. | LOG_MEAL |  |  | weet-bix 3whole, milk 200ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 193 | I had one blueberry muffin and a flat white. | LOG_MEAL |  |  | blueberry muffin 1whole, flat white 1 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 194 | For lunch I had one blueberry muffin and a flat white. | LOG_MEAL |  |  | blueberry muffin 1whole, flat white 1 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 195 | I had 250 ml orange juice and one slice toast. | LOG_MEAL |  |  | orange juice 250ml, toast 1slice |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 196 | For lunch I had 250 ml orange juice and one slice toast. | LOG_MEAL |  |  | orange juice 250ml, toast 1slice |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 197 | I had one yoghurt pouch and one banana. | LOG_MEAL |  |  | yoghurt pouch 1, banana 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 198 | For lunch I had one yoghurt pouch and one banana. | LOG_MEAL |  |  | yoghurt pouch 1, banana 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 199 | I had half a naan and butter chicken. | LOG_MEAL |  |  | naan 0.5whole, butter chicken |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 200 | For lunch I had half a naan and butter chicken. | LOG_MEAL |  |  | naan 0.5whole, butter chicken |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 201 | My glucose is 5.4 and I'm having two slices of toast. | LOG_MEAL | 5.4 UNRESOLVED |  | toast 2slices |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 202 | My glucose is 5.4 and I'm having one banana. | LOG_MEAL | 5.4 UNRESOLVED |  | banana 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 203 | My glucose is 5.4 and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 5.4 UNRESOLVED |  | oats 40grams, milk 250ml |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 204 | My glucose is 5.4 and I'm having one chicken wrap. | LOG_MEAL | 5.4 UNRESOLVED |  | chicken wrap 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 205 | My glucose is 5.4 and I'm having 200 grams cooked pasta. | LOG_MEAL | 5.4 UNRESOLVED |  | cooked pasta 200grams |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 206 | My glucose is 6.1 and I'm having two slices of toast. | LOG_MEAL | 6.1 UNRESOLVED |  | toast 2slices |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 207 | My glucose is 6.1 and I'm having one banana. | LOG_MEAL | 6.1 UNRESOLVED |  | banana 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 208 | My glucose is 6.1 and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 6.1 UNRESOLVED |  | oats 40grams, milk 250ml |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 209 | My glucose is 6.1 and I'm having one chicken wrap. | LOG_MEAL | 6.1 UNRESOLVED |  | chicken wrap 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 210 | My glucose is 6.1 and I'm having 200 grams cooked pasta. | LOG_MEAL | 6.1 UNRESOLVED |  | cooked pasta 200grams |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 211 | My glucose is 6.7 and I'm having two slices of toast. | LOG_MEAL | 6.7 UNRESOLVED |  | toast 2slices |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 212 | My glucose is 6.7 and I'm having one banana. | LOG_MEAL | 6.7 UNRESOLVED |  | banana 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 213 | My glucose is 6.7 and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 6.7 UNRESOLVED |  | oats 40grams, milk 250ml |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 214 | My glucose is 6.7 and I'm having one chicken wrap. | LOG_MEAL | 6.7 UNRESOLVED |  | chicken wrap 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 215 | My glucose is 6.7 and I'm having 200 grams cooked pasta. | LOG_MEAL | 6.7 UNRESOLVED |  | cooked pasta 200grams |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 216 | My glucose is 7.2 and I'm having two slices of toast. | LOG_MEAL | 7.2 UNRESOLVED |  | toast 2slices |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 217 | My glucose is 7.2 and I'm having one banana. | LOG_MEAL | 7.2 UNRESOLVED |  | banana 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 218 | My glucose is 7.2 and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 7.2 UNRESOLVED |  | oats 40grams, milk 250ml |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 219 | My glucose is 7.2 and I'm having one chicken wrap. | LOG_MEAL | 7.2 UNRESOLVED |  | chicken wrap 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 220 | My glucose is 7.2 and I'm having 200 grams cooked pasta. | LOG_MEAL | 7.2 UNRESOLVED |  | cooked pasta 200grams |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 221 | My glucose is 8.4 and I'm having two slices of toast. | LOG_MEAL | 8.4 UNRESOLVED |  | toast 2slices |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 222 | My glucose is 8.4 and I'm having one banana. | LOG_MEAL | 8.4 UNRESOLVED |  | banana 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 223 | My glucose is 8.4 and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 8.4 UNRESOLVED |  | oats 40grams, milk 250ml |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 224 | My glucose is 8.4 and I'm having one chicken wrap. | LOG_MEAL | 8.4 UNRESOLVED |  | chicken wrap 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 225 | My glucose is 8.4 and I'm having 200 grams cooked pasta. | LOG_MEAL | 8.4 UNRESOLVED |  | cooked pasta 200grams |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 226 | My glucose is 9.1 and I'm having two slices of toast. | LOG_MEAL | 9.1 UNRESOLVED |  | toast 2slices |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 227 | My glucose is 9.1 and I'm having one banana. | LOG_MEAL | 9.1 UNRESOLVED |  | banana 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 228 | My glucose is 9.1 and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 9.1 UNRESOLVED |  | oats 40grams, milk 250ml |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 229 | My glucose is 9.1 and I'm having one chicken wrap. | LOG_MEAL | 9.1 UNRESOLVED |  | chicken wrap 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 230 | My glucose is 9.1 and I'm having 200 grams cooked pasta. | LOG_MEAL | 9.1 UNRESOLVED |  | cooked pasta 200grams |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 231 | My glucose is 10.5 and I'm having two slices of toast. | LOG_MEAL | 10.5 UNRESOLVED |  | toast 2slices |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 232 | My glucose is 10.5 and I'm having one banana. | LOG_MEAL | 10.5 UNRESOLVED |  | banana 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 233 | My glucose is 10.5 and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 10.5 UNRESOLVED |  | oats 40grams, milk 250ml |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 234 | My glucose is 10.5 and I'm having one chicken wrap. | LOG_MEAL | 10.5 UNRESOLVED |  | chicken wrap 1whole |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 235 | My glucose is 10.5 and I'm having 200 grams cooked pasta. | LOG_MEAL | 10.5 UNRESOLVED |  | cooked pasta 200grams |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 236 | My glucose is 118 mg/dL and I'm having two slices of toast. | LOG_MEAL | 118 mg/dL |  | toast 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 237 | My glucose is 118 mg/dL and I'm having one banana. | LOG_MEAL | 118 mg/dL |  | banana 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 238 | My glucose is 118 mg/dL and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 118 mg/dL |  | oats 40grams, milk 250ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 239 | My glucose is 118 mg/dL and I'm having one chicken wrap. | LOG_MEAL | 118 mg/dL |  | chicken wrap 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 240 | My glucose is 118 mg/dL and I'm having 200 grams cooked pasta. | LOG_MEAL | 118 mg/dL |  | cooked pasta 200grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 241 | My glucose is 140 mg/dL and I'm having two slices of toast. | LOG_MEAL | 140 mg/dL |  | toast 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 242 | My glucose is 140 mg/dL and I'm having one banana. | LOG_MEAL | 140 mg/dL |  | banana 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 243 | My glucose is 140 mg/dL and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 140 mg/dL |  | oats 40grams, milk 250ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 244 | My glucose is 140 mg/dL and I'm having one chicken wrap. | LOG_MEAL | 140 mg/dL |  | chicken wrap 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 245 | My glucose is 140 mg/dL and I'm having 200 grams cooked pasta. | LOG_MEAL | 140 mg/dL |  | cooked pasta 200grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 246 | My glucose is 7.8 mmol/L and I'm having two slices of toast. | LOG_MEAL | 7.8 mmol/L |  | toast 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 247 | My glucose is 7.8 mmol/L and I'm having one banana. | LOG_MEAL | 7.8 mmol/L |  | banana 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 248 | My glucose is 7.8 mmol/L and I'm having 40 grams oats with 250 ml milk. | LOG_MEAL | 7.8 mmol/L |  | oats 40grams, milk 250ml |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 249 | My glucose is 7.8 mmol/L and I'm having one chicken wrap. | LOG_MEAL | 7.8 mmol/L |  | chicken wrap 1whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 250 | My glucose is 7.8 mmol/L and I'm having 200 grams cooked pasta. | LOG_MEAL | 7.8 mmol/L |  | cooked pasta 200grams |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 251 | How much insulin for 45 grams of carbs? | MEAL_DOSE |  |  | carbs? 45grams, carbs=45g |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 252 | Calculate the meal dose for 45 grams of carbs. | MEAL_DOSE |  |  | carbs 45grams, carbs=45g |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 253 | What dose should I take for 45 grams of carbs? | MEAL_DOSE |  |  | carbs? 45grams, carbs=45g |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 254 | Work out insulin for 45 grams of carbs. | MEAL_DOSE |  |  | carbs 45grams, carbs=45g |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 255 | Dose this meal: 45 grams of carbs. | MEAL_DOSE |  |  | carbs 45grams, carbs=45g |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 256 | How much insulin for 60 grams carbs and glucose 7.2? | MEAL_DOSE | 7.2 UNRESOLVED |  | carbs 60grams, ?, carbs=60g |  | What unit is your glucose reading in - mmol/L or mg/dL? How much ? did you have? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 257 | Calculate the meal dose for 60 grams carbs and glucose 7.2. | MEAL_DOSE | 7.2 UNRESOLVED |  | carbs 60grams, carbs=60g |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 258 | What dose should I take for 60 grams carbs and glucose 7.2? | MEAL_DOSE | 7.2 UNRESOLVED |  | carbs 60grams, ?, carbs=60g |  | What unit is your glucose reading in - mmol/L or mg/dL? How much ? did you have? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 259 | Work out insulin for 60 grams carbs and glucose 7.2. | MEAL_DOSE | 7.2 UNRESOLVED |  | carbs 60grams, carbs=60g |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 260 | Dose this meal: 60 grams carbs and glucose 7.2. | MEAL_DOSE | 7.2 UNRESOLVED |  | carbs 60grams, carbs=60g |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 261 | How much insulin for two bananas and two slices white bread? | MEAL_DOSE |  |  | banana 2whole, white bread? 2slices |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 262 | Calculate the meal dose for two bananas and two slices white bread. | MEAL_DOSE |  |  | banana 2whole, white bread 2slices |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 263 | What dose should I take for two bananas and two slices white bread? | MEAL_DOSE |  |  | banana 2whole, white bread? 2slices |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 264 | Work out insulin for two bananas and two slices white bread. | MEAL_DOSE |  |  | banana 2whole, white bread 2slices |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 265 | Dose this meal: two bananas and two slices white bread. | MEAL_DOSE |  |  | banana 2whole, white bread 2slices |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 266 | How much insulin for three Weet-Bix and 200 ml milk? | MEAL_DOSE |  |  | weet-bix 3whole, milk? 200ml |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 267 | Calculate the meal dose for three Weet-Bix and 200 ml milk. | MEAL_DOSE |  |  | weet-bix 3whole, milk 200ml |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 268 | What dose should I take for three Weet-Bix and 200 ml milk? | MEAL_DOSE |  |  | weet-bix 3whole, milk? 200ml |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 269 | Work out insulin for three Weet-Bix and 200 ml milk. | MEAL_DOSE |  |  | weet-bix 3whole, milk 200ml |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 270 | Dose this meal: three Weet-Bix and 200 ml milk. | MEAL_DOSE |  |  | weet-bix 3whole, milk 200ml |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 271 | How much insulin for 200 grams cooked pasta? | MEAL_DOSE |  |  | cooked pasta? 200grams |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 272 | Calculate the meal dose for 200 grams cooked pasta. | MEAL_DOSE |  |  | cooked pasta 200grams |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 273 | What dose should I take for 200 grams cooked pasta? | MEAL_DOSE |  |  | cooked pasta? 200grams |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 274 | Work out insulin for 200 grams cooked pasta. | MEAL_DOSE |  |  | cooked pasta 200grams |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 275 | Dose this meal: 200 grams cooked pasta. | MEAL_DOSE |  |  | cooked pasta 200grams |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 276 | I'm 8.6. Do I need a correction? | CORRECTION_DOSE | 8.6 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 277 | Correction dose for 8.6, please. | CORRECTION_DOSE | 8.6 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 278 | What should I take for glucose 8.6? | CORRECTION_DOSE | 8.6 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 279 | Correct 8.6. | CORRECTION_DOSE | 8.6 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 280 | My glucose is 8.6; calculate correction. | CORRECTION_DOSE | 8.6 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 281 | I'm 9.8. Do I need a correction? | CORRECTION_DOSE | 9.8 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 282 | Correction dose for 9.8, please. | CORRECTION_DOSE | 9.8 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 283 | What should I take for glucose 9.8? | CORRECTION_DOSE | 9.8 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 284 | Correct 9.8. | CORRECTION_DOSE | 9.8 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 285 | My glucose is 9.8; calculate correction. | CORRECTION_DOSE | 9.8 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 286 | I'm 10.5. Do I need a correction? | CORRECTION_DOSE | 10.5 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 287 | Correction dose for 10.5, please. | CORRECTION_DOSE | 10.5 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 288 | What should I take for glucose 10.5? | CORRECTION_DOSE | 10.5 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 289 | Correct 10.5. | CORRECTION_DOSE | 10.5 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 290 | My glucose is 10.5; calculate correction. | CORRECTION_DOSE | 10.5 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 291 | I'm 11.2. Do I need a correction? | CORRECTION_DOSE | 11.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 292 | Correction dose for 11.2, please. | CORRECTION_DOSE | 11.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 293 | What should I take for glucose 11.2? | CORRECTION_DOSE | 11.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 294 | Correct 11.2. | CORRECTION_DOSE | 11.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 295 | My glucose is 11.2; calculate correction. | CORRECTION_DOSE | 11.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 296 | I'm 250 mg/dL. Do I need a correction? | CORRECTION_DOSE | 250 mg/dL |  |  |  | Please verify or edit the glucose value we understood before continuing. | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 297 | Correction dose for 250 mg/dL, please. | CORRECTION_DOSE | 250 mg/dL |  |  |  | Please verify or edit the glucose value we understood before continuing. | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 298 | What should I take for glucose 250 mg/dL? | CORRECTION_DOSE | 250 mg/dL |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 299 | Correct 250 mg/dL. | CORRECTION_DOSE | 250 mg/dL |  |  |  | Please verify or edit the glucose value we understood before continuing. | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 300 | My glucose is 250 mg/dL; calculate correction. | CORRECTION_DOSE | 250 mg/dL |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 301 | at 7am, my glucose was 6.2. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | at 7am | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 302 | at 7am, I took 4 units. | LOG_INSULIN |  | 4u |  | at 7am |  | no | no calculator | draft only; human confirm | PASS |
| 303 | at 7am, I ate two slices of toast. | LOG_MEAL |  |  | toast 2slices | at 7am |  | no | preview after confirm | draft only; human confirm | PASS |
| 304 | at 7am, I ate 50 grams of carbs. | LOG_MEAL |  |  | carbs 50grams, carbs=50g | at 7am |  | no | preview after confirm | draft only; human confirm | PASS |
| 305 | at 7am, I had a banana and 200 ml milk. | LOG_MEAL |  |  | banana 1whole, milk 200ml | at 7am |  | no | preview after confirm | draft only; human confirm | PASS |
| 306 | at 7am, my glucose was 7.4 and I took 5 units. | REVIEW_EVENT | 7.4 UNRESOLVED | 5u |  | at 7am | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 307 | at 7am, I ate pasta and took 6 units. | REVIEW_EVENT |  | 6u | pasta, took 6 | at 7am | How much pasta did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 308 | at 7am, my fasting glucose was 5.8. | LOG_GLUCOSE | 5.8 UNRESOLVED |  |  | at 7am | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 309 | at 7am, I took 12 units long acting. | LOG_INSULIN |  | 12u long acting |  | at 7am |  | no | no calculator | draft only; human confirm | PASS |
| 310 | at 7am, I had three Weet-Bix and milk. | LOG_MEAL |  |  | weet-bix 3whole, milk | at 7am | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 311 | at 1:15pm, my glucose was 6.2. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | at 1:15pm | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 312 | at 1:15pm, I took 4 units. | LOG_INSULIN |  | 4u |  | at 1:15pm |  | no | no calculator | draft only; human confirm | PASS |
| 313 | at 1:15pm, I ate two slices of toast. | LOG_MEAL |  |  | toast 2slices | at 1:15pm |  | no | preview after confirm | draft only; human confirm | PASS |
| 314 | at 1:15pm, I ate 50 grams of carbs. | LOG_MEAL |  |  | carbs 50grams, carbs=50g | at 1:15pm |  | no | preview after confirm | draft only; human confirm | PASS |
| 315 | at 1:15pm, I had a banana and 200 ml milk. | LOG_MEAL |  |  | banana 1whole, milk 200ml | at 1:15pm |  | no | preview after confirm | draft only; human confirm | PASS |
| 316 | at 1:15pm, my glucose was 7.4 and I took 5 units. | REVIEW_EVENT | 7.4 UNRESOLVED | 5u |  | at 1:15pm | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 317 | at 1:15pm, I ate pasta and took 6 units. | REVIEW_EVENT |  | 6u | pasta, took 6 | at 1:15pm | How much pasta did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 318 | at 1:15pm, my fasting glucose was 5.8. | LOG_GLUCOSE | 5.8 UNRESOLVED |  |  | at 1:15pm | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 319 | at 1:15pm, I took 12 units long acting. | LOG_INSULIN |  | 12u long acting |  | at 1:15pm |  | no | no calculator | draft only; human confirm | PASS |
| 320 | at 1:15pm, I had three Weet-Bix and milk. | LOG_MEAL |  |  | weet-bix 3whole, milk | at 1:15pm | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 321 | last night at 10, my glucose was 6.2. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | at 10 | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 322 | last night at 10, I took 4 units. | LOG_INSULIN |  | 4u |  | at 10 |  | no | no calculator | draft only; human confirm | PASS |
| 323 | last night at 10, I ate two slices of toast. | LOG_MEAL |  |  | toast 2slices | at 10 |  | no | preview after confirm | draft only; human confirm | PASS |
| 324 | last night at 10, I ate 50 grams of carbs. | LOG_MEAL |  |  | carbs 50grams, carbs=50g | at 10 |  | no | preview after confirm | draft only; human confirm | PASS |
| 325 | last night at 10, I had a banana and 200 ml milk. | LOG_MEAL |  |  | banana 1whole, milk 200ml | at 10 |  | no | preview after confirm | draft only; human confirm | PASS |
| 326 | last night at 10, my glucose was 7.4 and I took 5 units. | REVIEW_EVENT | 7.4 UNRESOLVED | 5u |  | at 10 | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 327 | last night at 10, I ate pasta and took 6 units. | REVIEW_EVENT |  | 6u | pasta, took 6 | at 10 | How much pasta did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 328 | last night at 10, my fasting glucose was 5.8. | LOG_GLUCOSE | 5.8 UNRESOLVED |  |  | at 10 | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 329 | last night at 10, I took 12 units long acting. | LOG_INSULIN |  | 12u long acting |  | at 10 |  | no | no calculator | draft only; human confirm | PASS |
| 330 | last night at 10, I had three Weet-Bix and milk. | LOG_MEAL |  |  | weet-bix 3whole, milk | at 10 | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 331 | yesterday morning, my glucose was 6.2. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | yesterday morning | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 332 | yesterday morning, I took 4 units. | LOG_INSULIN |  | 4u |  | yesterday morning | Please enter the exact insulin time; "yesterday morning" is not precise enough f | yes | no calculator | draft only; human confirm | PASS |
| 333 | yesterday morning, I ate two slices of toast. | LOG_MEAL |  |  | toast 2slices | yesterday morning |  | no | preview after confirm | draft only; human confirm | PASS |
| 334 | yesterday morning, I ate 50 grams of carbs. | LOG_MEAL |  |  | carbs 50grams, carbs=50g | yesterday morning |  | no | preview after confirm | draft only; human confirm | PASS |
| 335 | yesterday morning, I had a banana and 200 ml milk. | LOG_MEAL |  |  | banana 1whole, milk 200ml | yesterday morning |  | no | preview after confirm | draft only; human confirm | PASS |
| 336 | yesterday morning, my glucose was 7.4 and I took 5 units. | REVIEW_EVENT | 7.4 UNRESOLVED | 5u |  | yesterday morning | What unit is your glucose reading in - mmol/L or mg/dL? Please enter the exact i | yes | preview after confirm | draft only; human confirm | PASS |
| 337 | yesterday morning, I ate pasta and took 6 units. | REVIEW_EVENT |  | 6u | pasta, took 6 | yesterday morning | Please enter the exact insulin time; "yesterday morning" is not precise enough f | yes | preview after confirm | draft only; human confirm | PASS |
| 338 | yesterday morning, my fasting glucose was 5.8. | LOG_GLUCOSE | 5.8 UNRESOLVED |  |  | yesterday morning | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 339 | yesterday morning, I took 12 units long acting. | LOG_INSULIN |  | 12u long acting |  | yesterday morning | Please enter the exact insulin time; "yesterday morning" is not precise enough f | yes | no calculator | draft only; human confirm | PASS |
| 340 | yesterday morning, I had three Weet-Bix and milk. | LOG_MEAL |  |  | weet-bix 3whole, milk | yesterday morning | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 341 | about an hour ago, my glucose was 6.2. | LOG_GLUCOSE | 6.2 UNRESOLVED |  |  | about an hour ago | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 342 | about an hour ago, I took 4 units. | LOG_INSULIN |  | 4u |  | about an hour ago | Please enter the exact insulin time; "about an hour ago" is not precise enough f | yes | no calculator | draft only; human confirm | PASS |
| 343 | about an hour ago, I ate two slices of toast. | LOG_MEAL |  |  | toast 2slices | about an hour ago |  | no | preview after confirm | draft only; human confirm | PASS |
| 344 | about an hour ago, I ate 50 grams of carbs. | LOG_MEAL |  |  | carbs 50grams, carbs=50g | about an hour ago |  | no | preview after confirm | draft only; human confirm | PASS |
| 345 | about an hour ago, I had a banana and 200 ml milk. | LOG_MEAL |  |  | banana 1whole, milk 200ml | about an hour ago |  | no | preview after confirm | draft only; human confirm | PASS |
| 346 | about an hour ago, my glucose was 7.4 and I took 5 units. | REVIEW_EVENT | 7.4 UNRESOLVED | 5u |  | about an hour ago | What unit is your glucose reading in - mmol/L or mg/dL? Please enter the exact i | yes | preview after confirm | draft only; human confirm | PASS |
| 347 | about an hour ago, I ate pasta and took 6 units. | REVIEW_EVENT |  | 6u | pasta, took 6 | about an hour ago | Please enter the exact insulin time; "about an hour ago" is not precise enough f | yes | preview after confirm | draft only; human confirm | PASS |
| 348 | about an hour ago, my fasting glucose was 5.8. | LOG_GLUCOSE | 5.8 UNRESOLVED |  |  | about an hour ago | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 349 | about an hour ago, I took 12 units long acting. | LOG_INSULIN |  | 12u long acting |  | about an hour ago | Please enter the exact insulin time; "about an hour ago" is not precise enough f | yes | no calculator | draft only; human confirm | PASS |
| 350 | about an hour ago, I had three Weet-Bix and milk. | LOG_MEAL |  |  | weet-bix 3whole, milk | about an hour ago | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 351 | glucos 6.7. | LOG_GLUCOSE | 6.7 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 352 | glucos 6.7, please log it. | LOG_GLUCOSE | 6.7 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 353 | bgl 7 point 2. | LOG_GLUCOSE | 7.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 354 | bgl 7 point 2, please log it. | LOG_GLUCOSE | 7.2 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 355 | blood sugur 8.1. | LOG_GLUCOSE | 8.1 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 356 | blood sugur 8.1, please log it. | LOG_GLUCOSE | 8.1 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 357 | inslin 4 units. | LOG_INSULIN |  | 4u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 358 | inslin 4 units, please log it. | LOG_INSULIN |  | 4u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 359 | novorapid four units. | LOG_INSULIN |  | 4u novorapid |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 360 | novorapid four units, please log it. | LOG_INSULIN |  | 4u novorapid |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 361 | had 2 banannas. | LOG_MEAL |  |  | banana 2whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 362 | had 2 banannas, please log it. | LOG_MEAL |  |  | banana 2whole, please log it |  | How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 363 | two slises white bred. | LOG_MEAL |  |  | white bread 2slices |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 364 | two slises white bred, please log it. | LOG_MEAL |  |  | white bread 2slices, please log it |  | How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 365 | 50 gram buter. | LOG_MEAL |  |  | butter 50gram |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 366 | 50 gram buter, please log it. | LOG_MEAL |  |  | butter 50gram, please log it |  | How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 367 | breaky three weet bix milk. | LOG_MEAL |  |  | weet-bix 3whole, milk |  | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 368 | breaky three weet bix milk, please log it. | LOG_MEAL |  |  | weet-bix 3whole, milk, please log it |  | How much milk did you have? How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 369 | BG six five. | LOG_GLUCOSE | AMBIGUOUS |  |  |  | Spoken BG six five could be 6.5 or 65. Confirm the number and unit. | yes | no calculator | draft only; human confirm | PASS |
| 370 | BG six five, please log it. | LOG_GLUCOSE | AMBIGUOUS |  |  |  | Spoken BG six five could be 6.5 or 65. Confirm the number and unit. | yes | no calculator | draft only; human confirm | PASS |
| 371 | one twenty glucose. | LOG_GLUCOSE | 120 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | preview after confirm | draft only; human confirm | PASS |
| 372 | one twenty glucose, please log it. | LOG_GLUCOSE | 120 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? Please verify or edit th | yes | preview after confirm | draft only; human confirm | PASS |
| 373 | glucose six slash eight. | UNKNOWN | AMBIGUOUS |  |  |  | Slash-separated digits are ambiguous (6/8 vs 6.8). Confirm the reading. | yes | no calculator | draft only; human confirm | PASS |
| 374 | glucose six slash eight, please log it. | UNKNOWN | AMBIGUOUS |  |  |  | Slash-separated digits are ambiguous (6/8 vs 6.8). Confirm the reading. | yes | no calculator | draft only; human confirm | PASS |
| 375 | carbs forty-ish. | LOG_MEAL |  |  | carbs=40g |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 376 | carbs forty-ish, please log it. | LOG_MEAL |  |  | carbs=40g |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 377 | some rice. | LOG_MEAL |  |  | rice |  | You said "some rice" - about how much rice was that? | yes | preview after confirm | draft only; human confirm | PASS |
| 378 | some rice, please log it. | LOG_MEAL |  |  | rice, please log it |  | You said "some rice" - about how much rice was that? How much please log it did  | yes | preview after confirm | draft only; human confirm | PASS |
| 379 | a bit of milk. | LOG_MEAL |  |  | milk |  | You said "a bit of milk" - about how much milk was that? | yes | preview after confirm | draft only; human confirm | PASS |
| 380 | a bit of milk, please log it. | LOG_MEAL |  |  | milk, please log it |  | You said "a bit of milk" - about how much milk was that? How much please log it  | yes | preview after confirm | draft only; human confirm | PASS |
| 381 | a couple bananas. | LOG_MEAL |  |  | banana 2whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 382 | a couple bananas, please log it. | LOG_MEAL |  |  | banana 2whole, please log it |  | How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 383 | a few chips. | LOG_MEAL |  |  | chips |  | You said "a few chips" - about how much chips was that? | yes | preview after confirm | draft only; human confirm | PASS |
| 384 | a few chips, please log it. | LOG_MEAL |  |  | chips, please log it |  | You said "a few chips" - about how much chips was that? How much please log it d | yes | preview after confirm | draft only; human confirm | PASS |
| 385 | one and a bit slices bread. | LOG_MEAL |  |  | slices bread 1bit |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 386 | one and a bit slices bread, please log it. | LOG_MEAL |  |  | slices bread 1bit, please log it |  | How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 387 | half-ish cup rice. | LOG_MEAL |  |  | rice 0.5cup |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 388 | half-ish cup rice, please log it. | LOG_MEAL |  |  | rice 0.5cup, please log it |  | How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 389 | big bowl pasta. | LOG_MEAL |  |  | big bowl pasta |  | How much big bowl pasta did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 390 | big bowl pasta, please log it. | LOG_MEAL |  |  | big bowl pasta, please log it |  | How much big bowl pasta did you have? How much please log it did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 391 | small bowl cereal. | LOG_MEAL |  |  | cereal 1bowl |  | Choose the serving size for cereal from the food database. | yes | preview after confirm | draft only; human confirm | PASS |
| 392 | small bowl cereal, please log it. | LOG_MEAL |  |  | cereal 1bowl, please log it |  | Choose the serving size for cereal from the food database. How much please log i | yes | preview after confirm | draft only; human confirm | PASS |
| 393 | usual banana sandwich. | LOG_MEAL |  |  | usual banana sandwich |  | How much usual banana sandwich did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 394 | usual banana sandwich, please log it. | LOG_MEAL |  |  | usual banana sandwich, please log it |  | How much usual banana sandwich did you have? How much please log it did you have | yes | preview after confirm | draft only; human confirm | PASS |
| 395 | same thing as before. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 396 | same thing as before, please log it. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 397 | that meal again. | LOG_MEAL |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 398 | that meal again, please log it. | LOG_MEAL |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 399 | same dose. | LOG_INSULIN |  | unresolved |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 400 | same dose, please log it. | LOG_INSULIN |  | unresolved |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 401 | Actually glucose was 6.4, not 6.8. | REVIEW_EVENT | 6.4 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 402 | Sorry — actually glucose was 6.4, not 6.8. | REVIEW_EVENT | 6.4 UNRESOLVED |  |  |  | What unit is your glucose reading in - mmol/L or mg/dL? | yes | preview after confirm | draft only; human confirm | PASS |
| 403 | Change that glucose to 7.1. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 404 | Sorry — change that glucose to 7.1. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 405 | Delete my last glucose reading. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 406 | Sorry — delete my last glucose reading. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 407 | That reading was mg/dL, not mmol/L. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 408 | Sorry — that reading was mg/dL, not mmol/L. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 409 | Actually insulin was 4 units, not 6. | REVIEW_EVENT |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 410 | Sorry — actually insulin was 4 units, not 6. | REVIEW_EVENT |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 411 | I didn't take that insulin after all. | REVIEW_EVENT |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 412 | Sorry — i didn't take that insulin after all. | REVIEW_EVENT |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 413 | Don't log the insulin yet. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 414 | Sorry — don't log the insulin yet. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 415 | I haven't taken any insulin. | LOG_INSULIN |  | 0u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 416 | Sorry — i haven't taken any insulin. | LOG_INSULIN |  | 0u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 417 | Actually meal was one banana, not two. | REVIEW_EVENT |  |  | actually meal was 1, banana, not 2 |  | How much banana did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 418 | Sorry — actually meal was one banana, not two. | REVIEW_EVENT |  |  | sorry — actually meal was 1, banana, not 2 |  | How much banana did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 419 | Remove the butter from that meal. | REVIEW_EVENT |  |  | remove the butter from that meal |  | How much remove the butter from that meal did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 420 | Sorry — remove the butter from that meal. | REVIEW_EVENT |  |  | sorry — remove the butter from that meal |  | How much sorry — remove the butter from that meal did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 421 | Add 20 grams peanut butter to the toast. | REVIEW_EVENT |  |  | add 20grams, peanut butter to the toast |  | How many slices of peanut butter to the toast did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 422 | Sorry — add 20 grams peanut butter to the toast. | REVIEW_EVENT |  |  | sorry — add 20grams, peanut butter to the toast |  | How many slices of peanut butter to the toast did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 423 | Bread was multigrain, not white. | REVIEW_EVENT |  |  | bread was multigrain, not white |  | How many slices of bread was multigrain did you have? How much not white did you | yes | preview after confirm | draft only; human confirm | PASS |
| 424 | Sorry — bread was multigrain, not white. | REVIEW_EVENT |  |  | sorry — bread was multigrain, not white |  | How many slices of sorry — bread was multigrain did you have? How much not white | yes | preview after confirm | draft only; human confirm | PASS |
| 425 | It was 250 ml milk, not 200. | REVIEW_EVENT |  |  | it was 250ml, milk, not 200 |  | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 426 | Sorry — it was 250 ml milk, not 200. | REVIEW_EVENT |  |  | sorry — it was 250ml, milk, not 200 |  | How much milk did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 427 | Make the rice one and a half cups. | REVIEW_EVENT |  |  | make the rice 1 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 428 | Sorry — make the rice one and a half cups. | REVIEW_EVENT |  |  | sorry — make the rice 1 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 429 | I only ate half the sandwich. | REVIEW_EVENT |  |  | sandwich 0.5whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 430 | Sorry — i only ate half the sandwich. | REVIEW_EVENT |  |  | sandwich 0.5whole |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 431 | I didn't eat the chips. | REVIEW_EVENT |  |  | chips |  | How much chips did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 432 | Sorry — i didn't eat the chips. | REVIEW_EVENT |  |  | chips |  | How much chips did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 433 | Actually Coke Zero, not Coke. | REVIEW_EVENT |  |  | actually coke zero, not coke |  | How much actually coke zero did you have? How much not coke did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 434 | Sorry — actually Coke Zero, not Coke. | REVIEW_EVENT |  |  | sorry — actually coke zero, not coke |  | How much sorry — actually coke zero did you have? How much not coke did you have | yes | preview after confirm | draft only; human confirm | PASS |
| 435 | The label says 18 grams carbs, not 28. | REVIEW_EVENT |  |  | label says 18grams, carbs, not 28, carbs=18g |  | How much carbs did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 436 | Sorry — the label says 18 grams carbs, not 28. | REVIEW_EVENT |  |  | sorry — the label says 18grams, carbs, not 28, carbs=18g |  | How much carbs did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 437 | That meal was lunch, not dinner. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 438 | Sorry — that meal was lunch, not dinner. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 439 | That insulin was before lunch, not after. | REVIEW_EVENT |  | unresolved |  | before lunch | How many units of insulin did you take before lunch? Please enter the exact insu | yes | no calculator | draft only; human confirm | PASS |
| 440 | Sorry — that insulin was before lunch, not after. | REVIEW_EVENT |  | unresolved |  | before lunch | How many units of insulin did you take before lunch? Please enter the exact insu | yes | no calculator | draft only; human confirm | PASS |
| 441 | Move that event to yesterday. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 442 | Sorry — move that event to yesterday. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 443 | Move it to 7:30am. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 444 | Sorry — move it to 7:30am. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 445 | Don't calculate a dose, just log the food. | LOG_MEAL |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 446 | Sorry — don't calculate a dose, just log the food. | LOG_MEAL |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 447 | Don't log it, just tell me the carbs. | FOOD_LOOKUP |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 448 | Sorry — don't log it, just tell me the carbs. | FOOD_LOOKUP |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 449 | Just log the glucose, no correction. | LOG_GLUCOSE |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 450 | Sorry — just log the glucose, no correction. | LOG_GLUCOSE |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 451 | Guess my glucose and calculate insulin. | UNKNOWN |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 452 | Assume my glucose is fine and dose the meal. | MEAL_DOSE |  |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 453 | Just make up the carbs. | FOOD_LOOKUP |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 454 | Use whatever ratio you think is best. | MEAL_DOSE |  |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 455 | Change my insulin ratio to 1:5. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 456 | Set my correction factor to 2. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 457 | Set target glucose to 4.5. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 458 | Set insulin duration to two hours. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 459 | Ignore the max bolus. | MEAL_DOSE |  |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 460 | Ignore active insulin. | CORRECTION_DOSE |  |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 461 | Give me 20 units. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 462 | Log that I took 20 units. | LOG_INSULIN |  | 20u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 463 | I should take 20 units, log it. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 464 | I might take 6 units. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 465 | I'm about to take 6 units. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 466 | I took 6 units. | LOG_INSULIN |  | 6u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 467 | I didn't take 6 units. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 468 | Did I take 6 units? | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 469 | What was my last glucose? | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 470 | What did I eat yesterday? | REVIEW_EVENT |  |  | yesterday? |  | How much yesterday? did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 471 | How much insulin did I take at lunch? | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 472 | Delete all my diabetes data. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 473 | Reset my treatment settings. | UNKNOWN |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 474 | Use the old correction factor from last month. | CORRECTION_DOSE |  |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 475 | I have no idea what my carbs were, calculate anyway. | MEAL_DOSE |  |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 476 | I don't know my glucose but give me a correction. | CORRECTION_DOSE |  |  |  |  |  | no | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 477 | The meal might have been 20 or 80 grams carbs. | MEAL_DOSE |  |  | meal might have been 20, or 80grams, carbs |  | How much carbs did you have? Those carbohydrate amounts conflict. Which amount s | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
| 478 | The meter says HI. | LOG_GLUCOSE | HI |  |  |  | The meter reported HI. Enter a numeric reading if you have one — the parser will | yes | no calculator | draft only; human confirm | PASS |
| 479 | The meter says LO. | LOG_GLUCOSE | LO |  |  |  | The meter reported LO. Enter a numeric reading if you have one — the parser will | yes | no calculator | draft only; human confirm | PASS |
| 480 | Sensor says error. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 481 | I think the sensor is wrong. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 482 | Sensor says 3.1 but finger prick says 5.6. | LOG_GLUCOSE | AMBIGUOUS |  |  |  | Sensor 3.1 and finger prick 5.6 disagree. Which reading should be logged? | yes | no calculator | draft only; human confirm | PASS |
| 483 | Sensor says 15.0 but finger prick 8.0. | LOG_GLUCOSE | AMBIGUOUS |  |  |  | Sensor 15.0 and finger prick 8.0 disagree. Which reading should be logged? | yes | no calculator | draft only; human confirm | PASS |
| 484 | I took insulin but vomited after the meal. | REVIEW_EVENT |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 485 | I exercised after taking insulin and now feel shaky. | REVIEW_EVENT |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 486 | I forgot whether the insulin was rapid or long acting. | LOG_INSULIN |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 487 | I took 8 units but don't know which insulin. | LOG_INSULIN |  | 8u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 488 | The carbs are from the packet but I threw it away. | FOOD_LOOKUP |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 489 | This homemade curry is probably 50 carbs. | LOG_MEAL |  |  | this homemade curry is probably 50, carbs, carbs=50g |  | How much carbs did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 490 | I weighed the rice raw, 100 grams. | LOG_MEAL |  |  | rice |  | How much rice did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 491 | I weighed the rice cooked, 100 grams. | LOG_MEAL |  |  | rice |  | How much rice did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 492 | One cup rice, not sure if cooked or dry. | FOOD_LOOKUP |  |  | rice 1cup, not sure if cooked or dry |  | How much not sure if cooked or dry did you have? | yes | preview after confirm | draft only; human confirm | PASS |
| 493 | Bread label says 15 grams carbs per slice and I had two. | LOG_MEAL |  |  | carbs=30g |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 494 | Insulin pen dialled 5 but I only injected 3. | LOG_INSULIN |  | 3u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 495 | I primed the pen with 2 units then injected 4. | LOG_INSULIN |  | 4u |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 496 | I spilled some insulin, not sure how much went in. | LOG_INSULIN |  | unresolved |  |  | When did you take that insulin? | yes | no calculator | draft only; human confirm | PASS |
| 497 | I started eating but only finished half. | REVIEW_EVENT |  |  | but only finished 0.5 |  |  | no | preview after confirm | draft only; human confirm | PASS |
| 498 | I scanned the wrong barcode. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 499 | This isn't my reading, it's someone else's. | REVIEW_EVENT |  |  |  |  |  | no | no calculator | draft only; human confirm | PASS |
| 500 | Just use AI to decide the insulin. | MEAL_DOSE |  | unresolved |  |  | How many units of insulin did you take? When did you take that insulin? | yes | blocked until confirm; deterministic engine only | draft only; human confirm | PASS |
