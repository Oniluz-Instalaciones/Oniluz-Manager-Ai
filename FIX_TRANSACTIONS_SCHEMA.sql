-- ==========================================
-- SCRIPT PARA SOLUCIONAR ERROR DE AUTO-ASOCIAR
-- ==========================================
-- Copia y pega este código en el SQL Editor de tu panel de Supabase y dale a "Run"

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS related_document_id UUID;

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS user_name TEXT;

-- Opcional: Si quieres que la base de datos sepa que esta columna está enlazada a la tabla documents,
-- puedes ejecutar también esta línea (solo si la tabla documents ya existe y su id es UUID):
-- ALTER TABLE public.transactions ADD CONSTRAINT fk_related_document FOREIGN KEY (related_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
