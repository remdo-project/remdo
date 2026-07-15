## 1. Establish the durable workflow boundary

- [x] 1.1 Update `docs/documentation.md` so main OpenSpec specs own accepted
  durable requirements across product, development, and operational behavior,
  while supporting docs retain their explanatory and runbook roles.
- [x] 1.2 Generalize `openspec/config.yaml` context and artifact rules from
  product-only requirements to maintained RemDo behavior without weakening the
  existing minimality and derivability constraints.

## 2. Add the RemDo workflow conductor

- [x] 2.1 Add a shared `remdo-change-flow` skill and agent adapter that define
  the generic conductor boundary and implement atomic `--skip-specs`
  finalization by delegating OpenSpec mechanics.
- [x] 2.2 Replace the detailed archive-only procedure in `AGENTS.md` with the
  minimal routing and permission contract needed to invoke the conductor
  safely, leaving generated OpenSpec skills and commands unchanged.
- [x] 2.3 Confirm the conductor states the archive preconditions, scoped Git
  mutations, strict-validation gate, automatic commit authorization, and
  uncommitted failure outcome required by the delta spec.

## 3. Incorporate and verify the capability

- [x] 3.1 Sync the `development-change-workflow` delta into a new main spec and
  confirm it is the single durable owner of the accepted workflow requirements.
- [x] 3.2 Run strict OpenSpec validation and the repository's required final
  checks, fixing failures caused by the change.
