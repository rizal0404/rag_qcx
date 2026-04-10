-- ============================================================
-- Migration 004: Tighten RLS Policies
-- Restrict SELECT on chat data; scope documents to ACTIVE only.
-- ============================================================

-- 1. DROP overly permissive SELECT policies on chat tables
DROP POLICY IF EXISTS "Public read sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Public read messages" ON chat_messages;

-- 2. Chat sessions: only owner or service role can read
-- user_id IS NULL covers legacy anonymous sessions during transition
CREATE POLICY "read_own_sessions" ON chat_sessions
  FOR SELECT USING (
    user_id IS NULL
    OR user_id = coalesce(auth.uid()::text, '')
    OR current_setting('role', true) = 'service_role'
  );

-- 3. Chat messages: scoped to sessions the caller can read
CREATE POLICY "read_own_messages" ON chat_messages
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM chat_sessions
      WHERE user_id IS NULL
         OR user_id = coalesce(auth.uid()::text, '')
         OR current_setting('role', true) = 'service_role'
    )
  );

-- 4. Add missing DELETE policies for admin operations
CREATE POLICY "service_delete_sessions" ON chat_sessions
  FOR DELETE USING (current_setting('role', true) = 'service_role');

CREATE POLICY "service_delete_messages" ON chat_messages
  FOR DELETE USING (current_setting('role', true) = 'service_role');

CREATE POLICY "service_update_sessions" ON chat_sessions
  FOR UPDATE USING (current_setting('role', true) = 'service_role');

-- 5. Documents: restrict public reads to ACTIVE only
DROP POLICY IF EXISTS "Public read documents" ON documents;
CREATE POLICY "read_active_documents" ON documents
  FOR SELECT USING (
    status = 'ACTIVE'
    OR current_setting('role', true) = 'service_role'
  );

-- 6. Add UPDATE policy for documents (missing)
CREATE POLICY "service_update_documents" ON documents
  FOR UPDATE USING (current_setting('role', true) = 'service_role');

-- 7. Add DELETE policy for documents
CREATE POLICY "service_delete_documents" ON documents
  FOR DELETE USING (current_setting('role', true) = 'service_role');
