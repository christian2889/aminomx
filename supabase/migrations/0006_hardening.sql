-- ============================================================================
-- Aminos MX — endurecimiento (según advisors de Supabase)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- handle_new_user solo lo invoca el trigger de auth
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- El checkout requiere sesión
revoke execute on function public.create_order(jsonb, text, text, text, jsonb, text, text) from anon;
