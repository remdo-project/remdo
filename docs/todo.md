# TODO

Introduce a `#config` alias that re-exports a central `config` object (option 1 from the proposed approaches). The module should encapsulate `import.meta.env` usage and expose fields like `env`, `dev`, and future shared flags so features can read configuration without touching environment globals directly. This change should replace the current `dev` flag sourced from the editor config, and allow us to remove the existing `#env` alias by routing all environment access through the new module.
