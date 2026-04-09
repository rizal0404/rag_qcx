# RAG Chatbot - Task Tracker

## Phase 1: Project Setup
- [x] Initialize Next.js project with App Router
- [x] Install dependencies (AI SDK, Supabase, etc.)
- [x] Configure environment variables template

## Phase 2: Database Schema
- [x] Setup Supabase pgvector extension
- [x] Create documents table
- [x] Create chunks table with vector column
- [x] Create images table
- [x] Create chat_sessions & chat_messages tables
- [x] Create hybrid_search function
- [x] Create indexes

## Phase 3: Core Libraries
- [x] Supabase client setup (browser + server + admin)
- [x] LLM provider configuration (OpenRouter)
- [x] Embedding generation utility
- [x] System prompts with anti-hallucination rules

## Phase 4: Knowledge Base Pipeline (Admin)
- [x] PDF upload API route
- [x] Ingestion pipeline orchestrator
- [x] Content classifier
- [x] Chunker (hierarchical)
- [x] Table processor
- [x] Image/diagram processor (VLM captioning)
- [x] Metadata enricher
- [x] Embedding + storage

## Phase 5: Chatbot (User-facing)
- [x] Chat API route with streaming
- [x] Hybrid search (vector + FTS)
- [x] Context builder
- [x] Fallback handler
- [x] Chat UI components
- [x] Citation rendering
- [x] Table renderer
- [x] Image/diagram viewer

## Phase 6: Admin Dashboard
- [x] Upload form UI
- [x] Document management list
- [x] Processing status tracker
- [x] Ingestion logs

## Phase 7: Polish & Verify
- [x] Test with sample PDF
- [x] Verify anti-hallucination
- [x] Verify fallback behavior
- [x] UI polish & responsive design
