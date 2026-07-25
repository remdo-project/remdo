# Development Change Workflow Design

## Scope

This document owns the current architecture of RemDo's agent-assisted,
spec-bearing development workflow. The adjacent spec owns lifecycle behavior;
the [`agent-skill-remdo-verify-change`](../agent-skill-remdo-verify-change/spec.md)
capability owns readiness-verification behavior and mechanics.

## Lifecycle ownership

`remdo-change-flow` is the sole end-to-end coordinator. It selects the phase,
composes the supporting skills, owns the approval baseline and user handoffs,
and retains control when a supporting skill completes.

Inside the diagram, shortened boxes omit only the `openspec-` prefix;
`verify` means `remdo-verify-change`.

Planning and approval flow:

```text
[openspec-explore]
         |
         v
[propose / continue / update] -> [sync-specs] -> [verify: spec]
              ^                                      |
              +----------- planning finding ---------+
                                                     | ready
                                                     v
                                            [approval baseline]
```

Implementation and finalization flow:

```text
[approval baseline] -> [apply-change] -> [verify: implementation]
                                                   |
                  +--------------------------------+-----------------------+
                  |                                |                       |
                  | implementation finding         | intent finding        | ready
                  v                                v                       v
        return to apply-change        [update planning artifacts]   [user handoff]
                                                   |                       |       |
                                                   v             user edit |       | commit
                                        planning and approval flow         |       v
                                                                           | [commit + recheck]
                                                                           |       |
                                                                           |       v
                                                                           | [archive --skip-specs]
                                                                           |
                                                                           +--> return to
                                                                                apply-change
```

The approval baseline is the reconciled main specs, applicable permanent
designs, and active tasks. Permanent designs remain the current architecture
owners after change-local designs become historical at archival.
