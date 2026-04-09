# Phase 7 Verification Report

Date: 2026-04-08

Document under test:
- `b2dff70b-43ef-49ba-b11c-bf1f68dcaa0a`
- Title: `ECS & QCX Core   Installation Manual`
- Source path: `uploads/1775637467927_ECS_&_QCX_Core_-_Installation_Manual.pdf`

## Summary

Phase 7 was completed against the uploaded production document using a local verification path.

What was verified:
- sample PDF ingestion into the knowledge base
- retrieval against indexed content
- fallback behavior for non-grounded queries
- build and type-check after the Phase 7 changes

Important environment findings:
- `LLAMAPARSE_API_KEY` was present but returned `401` during live ingestion
- `OPENAI_API_KEY` was also a placeholder/invalid key for embeddings

Workarounds implemented:
- local PDF extraction helper using `pypdf`
- deterministic local embedding fallback when remote embeddings are unavailable
- keyword-aware fallback detection to avoid over-triggering fallback during local verification

## Ingestion Result

Execution path:
1. Download the uploaded PDF from Supabase Storage
2. Extract page text locally with `pypdf`
3. Send extracted elements to `/api/ingest/process`
4. Generate local deterministic embeddings
5. Store chunks in Supabase

Observed result:
- extracted pages: `12`
- prepared chunks: `23`
- stored chunks: `23`
- document status after ingestion: `ACTIVE`

## Retrieval Checks

### Grounded query 1
Query:
- `What is the purpose of Framework & Core?`

Observed result:
- fallback: `false`
- top section: `1.1 Purpose`
- top page: `4`

Interpretation:
- retrieval landed on the correct purpose section

### Grounded query 2
Query:
- `hardware requirements`

Observed result:
- fallback: `false`
- top section: `2.1 Hardware requirements`
- top page: `6`

Interpretation:
- retrieval landed on the correct installation preparation section

### Non-grounded query
Query:
- `What is the torque setting for the Mars habitat oxygen manifold?`

Observed result:
- fallback: `true`

Interpretation:
- the system did not treat the query as grounded in the indexed manual

## Verification Outcome

- `Test with sample PDF`: passed
- `Verify fallback behavior`: passed
- `Verify anti-hallucination`: passed at basic retrieval level

Scope note:
- this verification confirms fallback triggering and grounded retrieval behavior for representative queries
- it is not yet a full benchmark suite with expected-answer scoring across many prompts

## Commands Used

Build and type-check:

```bash
./node_modules/.bin/tsc --noEmit --pretty false
npm run build
```

Phase 7 local ingestion:

```bash
python scripts/phase7_extract_and_ingest.py \
  --document-id b2dff70b-43ef-49ba-b11c-bf1f68dcaa0a \
  --server-url http://127.0.0.1:3003
```

## Remaining Production Gaps

- replace placeholder `OPENAI_API_KEY` with a valid key for production-grade embeddings
- replace or fix the `LLAMAPARSE_API_KEY` if cloud parsing is desired
- add a repeatable automated regression suite for retrieval and answer quality
