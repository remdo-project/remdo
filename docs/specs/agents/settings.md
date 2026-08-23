# Agent settings

Skills read one resolved YAML document. Committed defaults are
`.agents/settings.yaml`. If `~/.remdo/agent.yaml` exists, it is merged on
top: mappings combine key by key, and any other value replaces the
committed value. **Deterministic.**
