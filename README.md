# RAG Chatbot for Technical Manuals

Next.js application for indexing industrial technical manuals into a Supabase-backed knowledge base and answering user questions with grounded citations.

The current implementation is optimized for:
- PDF/manual upload and document registration
- manual or parser-assisted ingestion into chunked knowledge records
- hybrid retrieval with `pgvector` + PostgreSQL full-text search
- streaming chat responses with citations, confidence indicator, and attached diagrams
- admin dashboard for document status and recent ingestion activity

## 1. Technical Overview

### Core stack
- Next.js 16 App Router
- React 19
- Vercel AI SDK
- OpenRouter for chat generation
- OpenRouter-first embeddings with OpenAI-compatible fallback
- OpenRouter reranking with `cohere/rerank-v3.5`
- Supabase PostgreSQL + `pgvector`
- Supabase Storage for uploaded manuals and extracted images

### Main capabilities
- Register PDF manuals into a `documents` table
- Ingest parser output into `chunks` and `images`
- Enrich chunks with document metadata and parent-child section context
- Run grounded chat retrieval against `hybrid_search(...)`
- Show citations and related diagrams in the chat UI
- Track document states from upload to active/error

### Current ingestion model
This repo does **not** perform native PDF parsing inside Next.js yet.

The expected production flow is:
1. Upload PDF to `/api/documents`
2. Parse the PDF with an external service such as LlamaParse or a Docling worker
3. Send parsed elements/chunks to `/api/ingest/process`
4. Query the indexed content through `/api/chat` or `/api/search`

There is also a lightweight text-ingestion path for testing without a PDF parser.

## 2. Project Structure

```text
src/
  app/
    api/
      chat/               Streaming grounded chat
      documents/          Upload + list documents
      ingest/             Direct ingestion endpoints
      ingest/process/     Canonical ingestion trigger
      ingest/status/      Document processing status
      search/             Direct retrieval endpoint
    admin/                Admin dashboard
  components/
    admin/                Upload form, document list, logs, status cards
    chat/                 Chat UI, citations, diagram viewer
  lib/
    ai/                   LLM and embedding helpers
    ingestion/            Classifier, chunker, enricher, pipeline
    search/               Hybrid search, fallback, context builder
    supabase/             Browser/server/admin clients
  types/
    chat.ts
    database.ts
    ingestion.ts

supabase/
  migrations/
    001_full_schema.sql
```

## 3. Environment Variables

Copy `.env.example` to `.env` and fill the values:

```env
# LLM Providers
OPENROUTER_API_KEY=sk-or-v1-xxxx
OPENAI_API_KEY=sk-xxxx
GOOGLE_GENERATIVE_AI_API_KEY=AIzaxxxx

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx

# Admin auth
ADMIN_BASIC_AUTH_USERNAME=admin
ADMIN_BASIC_AUTH_PASSWORD=change-this-password

# External parser options
LLAMAPARSE_API_KEY=llx-xxxx
# DOCLING_WORKER_URL=https://your-worker.railway.app

# App config
SIMILARITY_THRESHOLD=0.6
MAX_CHUNKS_PER_QUERY=10
LLM_TEMPERATURE=0.1
LLM_MODEL=google/gemini-2.5-flash
EMBEDDING_PROVIDER=auto
EMBEDDING_MODEL=baai/bge-m3
EMBEDDING_VECTOR_DIMENSIONS=1024
RERANK_ENABLED=true
RERANK_MODEL=cohere/rerank-v3.5
RERANK_CANDIDATE_MULTIPLIER=4
```

Notes:
- `OPENROUTER_API_KEY` is used for chat generation.
- Embeddings prefer OpenRouter first, then fall back to direct OpenAI, then local deterministic vectors if no remote provider is usable.
- Retrieval now uses a two-stage ranker: Supabase hybrid search collects candidates, then OpenRouter reranks them with `cohere/rerank-v3.5`.
- `EMBEDDING_PROVIDER=auto` keeps that provider order. You can force `openrouter`, `openai`, or `local` if needed.
- `EMBEDDING_VECTOR_DIMENSIONS` should match the pgvector column size. The default schema now uses `1024` for `bge-m3`.
- `SUPABASE_SERVICE_ROLE_KEY` is required for upload, ingestion, and admin-side operations.
- `ADMIN_BASIC_AUTH_USERNAME` and `ADMIN_BASIC_AUTH_PASSWORD` are required to access `/admin`, `/api/documents`, `/api/ingest/*`, and `/api/chat/sessions/*`.
- `LLAMAPARSE_API_KEY` and `DOCLING_WORKER_URL` are optional until you connect an external parser.
- After changing `EMBEDDING_MODEL`, re-ingest documents so stored chunk vectors and query vectors come from the same model family.

## 4. Database Setup

### Supabase requirements
- PostgreSQL project with `vector` and `pg_trgm` extensions enabled
- Storage bucket named `manuals`
- public read access for stored images if you want chat-attached diagrams to render directly

### Apply the schema

If you use the Supabase CLI:

```bash
supabase db push
```

Or run the SQL manually from:

```text
supabase/migrations/001_full_schema.sql
```

The schema creates:
- `documents`
- `chunks`
- `images`
- `chat_sessions`
- `chat_messages`
- `hybrid_search(...)`
- vector and FTS indexes

### Storage bucket
Create a bucket named `manuals`.

Suggested behavior:
- store uploaded PDFs under `uploads/...`
- store extracted diagrams or derived image assets under a subpath in the same bucket

## 5. Install and Run

Install dependencies:

```bash
npm install
```

Run local development:

```bash
npm run dev
```

Open:
- chat UI: `http://localhost:3000`
- admin UI: `http://localhost:3000/admin`

Production verification:

```bash
./node_modules/.bin/tsc --noEmit --pretty false
npm run build
```

## 6. Ingestion Workflow

### Option A: Full parser-assisted ingestion

#### Step 1: upload the PDF

`POST /api/documents` as `multipart/form-data`

Fields:
- `file`: PDF file
- `title`: optional
- `doc_number`: optional
- `equipment_model`: optional

Example:

```bash
curl -X POST http://localhost:3000/api/documents \
  -F "file=@./manual.pdf" \
  -F "title=QCX PTD120 Manual" \
  -F "doc_number=365910-EN_03" \
  -F "equipment_model=QCX PTD120"
```

Response includes `document.id`.

#### Step 2: send parser output to the ingestion endpoint

`POST /api/ingest/process`

Example body:

```json
{
  "documentId": "your-document-uuid",
  "elements": [
    {
      "content": "The 2-position diverter is intended for ...",
      "content_type": "NARRATIVE_TEXT",
      "section_path": "Technical description > Basic use and scheme",
      "page_numbers": [14],
      "metadata": {
        "source": "llamaparse"
      }
    },
    {
      "content": "| Parameter | Value |\n| --- | --- |\n| Supply voltage | 24 VDC |",
      "content_type": "SPEC_TABLE",
      "section_path": "Electrical installation",
      "page_numbers": [22],
      "metadata": {}
    },
    {
      "content": "BECKHOFF PLC SUPPLY wiring diagram",
      "content_type": "WIRING_DIAGRAM",
      "section_path": "Electrical installation",
      "page_numbers": [23],
      "metadata": {},
      "image_data": {
        "file_path": "diagrams/doc-123/page-23.png",
        "image_type": "wiring_diagram",
        "vlm_description": "Wiring diagram showing Beckhoff PLC supply and 24 VDC power connections.",
        "page_number": 23
      }
    }
  ]
}
```

What the pipeline does:
- classifies content when needed
- chunks narrative text
- preserves tables and safety blocks as atomic units
- creates parent-child section context
- enriches chunks with document metadata
- generates multilingual-friendly embeddings from content + metadata
- stores chunks into Supabase
- stores image records into `images`

### Option B: lightweight text ingestion for testing

`PUT /api/ingest`

Example:

```json
{
  "documentId": "your-document-uuid",
  "text": "Section 3.1\n\nSupply voltage is 24 VDC.\n\nProtection class is IP55.",
  "sectionPath": "Technical description > Equipment data",
  "pageNumbers": [12],
  "contentType": "NARRATIVE_TEXT"
}
```

Use this for smoke tests before connecting a real parser.

### Check ingestion status

`GET /api/ingest/status?documentId=your-document-uuid`

### Rebuild embeddings for existing chunks

After changing embedding dimensions or model family, regenerate stored chunk vectors:

`POST /api/ingest/reembed`

Example:

```json
{
  "documentId": "optional-document-uuid",
  "batchSize": 20
}
```

## 7. Search and Chat

### Direct retrieval

`POST /api/search`

Example:

```json
{
  "query": "What is the PLC supply voltage?",
  "matchCount": 5
}
```

Response returns:
- hybrid search hits
- fallback analysis

### Streaming chat

`POST /api/chat`

The UI uses the Vercel AI SDK transport, but server-side behavior is:
- generate query embedding
- call `hybrid_search(...)`
- load parent chunk content and document metadata
- attach matching images from `images`
- stream grounded answer from the configured OpenRouter model

Important behavior:
- if the best result score is below `SIMILARITY_THRESHOLD`, the UI marks the response as fallback/low confidence
- citations are attached from retrieved chunk metadata
- chat history provides conversation continuity but should not override database-grounded facts

## 8. Admin UI

### `/admin`
Displays:
- document list
- processing summary cards
- recent ingestion activity

Access is protected by HTTP Basic Auth via `ADMIN_BASIC_AUTH_USERNAME` and `ADMIN_BASIC_AUTH_PASSWORD`.

### `/admin/upload`
Allows:
- PDF upload
- document registration into Supabase

Current behavior:
- upload only registers the file and metadata
- ingestion still needs to be triggered separately with parsed content

## 9. Data Model Summary

### `documents`
Tracks uploaded manuals and ingestion state.

Relevant statuses:
- `UPLOADED`
- `PROCESSING`
- `ACTIVE`
- `ERROR`
- `INACTIVE`

### `chunks`
Stores the knowledge base content:
- narrative text
- tables
- safety blocks
- image/diagram textual descriptions

### `images`
Stores image references associated with indexed chunks:
- `file_path`
- `image_type`
- `vlm_description`
- optional `callouts`

## 10. Current Limitations

- Native PDF parsing is not implemented in-app yet.
- Anti-hallucination verification is implemented via retrieval thresholding and prompting, but not yet backed by automated evaluation suites.
- There is no dedicated ingestion queue or worker orchestration inside this repo.
- Chat session persistence exists in schema, but full session history storage is not yet wired end-to-end in the UI.
- `src/app/api/ingest/upload` still exists as a legacy upload route; prefer `/api/documents` for new integrations.

## 11. Recommended Next Steps

1. Connect a real parser adapter for LlamaParse or Docling output.
2. Add automated smoke tests using a sample manual and known expected answers.
3. Persist chat sessions and cited chunk IDs to `chat_sessions` / `chat_messages`.
4. Add ingestion job logs and error detail storage beyond document status snapshots.
5. Add access control if the app will be used outside an internal environment.

## 12. Useful Local Checks

Type-check:

```bash
./node_modules/.bin/tsc --noEmit --pretty false
```

Production build:

```bash
npm run build
```

If `next build` fails with `spawn EPERM` inside a restricted shell, rerun the build outside the sandbox or from a normal local terminal session.

Database migration note:
- Existing projects should apply [002_bge_m3_native_dimensions.sql](/e:/ProyekAi/RAG_Vercel/supabase/migrations/002_bge_m3_native_dimensions.sql) and then call `/api/ingest/reembed` to regenerate stored vectors with `bge-m3`.
