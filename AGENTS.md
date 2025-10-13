# RemDo Agent Guidelines

## Safety & Process

- Do not change any code before explicitly asked for it.
  - If asked how something can be solved, answer the question and suggest a
    solution, but do not change any code.
  - If asked to propose code, provide the snippet and wait for explicit
    approval before making changes.
- Do not stage or commit any changes without explicit approval.
- The project is in dev phase, do not introduce temporary shims when refactoring
  or fixing bugs; aim for permanent solutions.

## Checks

- pnpm run lint # run after every code change before considering the work complete
- pnpm run test:unit # run often, and always before staging or committing code changes

## Tools

- Use the GitHub CLI (gh) to check repository and Actions status on GitHub.
- Lexical sources are available locally at `.data/lexical`. Refer to them whenever
  working on core editor functionalities. Their versions match the modules imported
  from `node_modules`.
