-- Auditoría pre-chatbot (docs/AUDITORIA_RLS_2026-10.md, hallazgo 1).
-- anon y authenticated heredaron TRUNCATE, REFERENCES y TRIGGER por los
-- privilegios por defecto de Supabase. La API REST no los usa y TRUNCATE
-- ignora RLS. SELECT/INSERT/UPDATE/DELETE no se tocan.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Tablas futuras no heredan esos privilegios.
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
