# Appropriate List Type

This user-raised case records a structural correction identified while
improving the `remdo-improve-document` contract.

## Pre-change

```markdown
## Transformation

The capability reshapes retained material around the target properties without
preserving historical section structure. It relocates material to its narrowest
owner under Documentation.
```

## Change request

**Challenge:** A short causal sequence was replaced with prose that was harder
to scan.

**Agreed actions:** Prefer an appropriate list type when separation improves
scanning, without explaining the conventional distinction between ordered and
unordered lists. Restore the ordered transformation sequence.

## Post-change

```markdown
## Transformation

The work forms coherent, review-sized semantic changes. It normally:

1. removes information without durable contract value;
2. moves valuable information to its narrowest owner, updating inbound links;
3. rewrites the remaining document around its target properties.

The phases may be combined when separation would add no review value. Historical
section structure does not constrain the result.
```
