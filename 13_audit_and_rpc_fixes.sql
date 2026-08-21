-- ============================================================================
-- RAJPUT MEDICAL STORE — MIGRATION 13
-- Fixes: log_audit_event() assumed every audited table has an `id` column.
-- store_settings' primary key is `store_id`, not `id` — direct field access
-- (new.id) fails to compile/errors at runtime with "record 'new' has no
-- field 'id'". Fix: use to_jsonb(...)->>'id', which returns NULL instead of
-- erroring when the key doesn't exist, and fall back to store_id so the
-- audit row still has a meaningful record_id for single-row-per-store tables.
-- ============================================================================

create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_record_id uuid;
begin
  v_store_id := coalesce(new.store_id, old.store_id);

  v_record_id := coalesce(
    (to_jsonb(new)->>'id')::uuid,
    (to_jsonb(old)->>'id')::uuid,
    v_store_id  -- fallback for tables with no `id` column (e.g. store_settings)
  );

  insert into audit_logs (store_id, user_id, table_name, record_id, action, old_data, new_data)
  values (
    v_store_id,
    auth.uid(),
    tg_table_name,
    v_record_id,
    lower(tg_op)::audit_action,
    case when tg_op in ('update','delete') then to_jsonb(old) else null end,
    case when tg_op in ('update','insert') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

-- ============================================================================
-- Defensive check for create_store_and_owner(): if this is ever called
-- without an authenticated session (e.g. accidentally run from the SQL
-- Editor, which has no JWT/auth context), auth.uid() is NULL and the
-- function would otherwise fail with an opaque not-null-violation on
-- user_roles.user_id. Fail loudly and clearly instead.
--
-- Note: this does NOT "fix" auth.uid() being null in the SQL Editor — that
-- is expected, correct behavior (the SQL Editor has no user session). This
-- function must only ever be called via supabase.rpc(...) from an
-- authenticated client request. Do not attempt to work around that.
-- ============================================================================

create or replace function create_store_and_owner(p_store_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_store_and_owner requires an authenticated session (auth.uid() is null) — call this via the app, not the SQL Editor';
  end if;

  if exists (select 1 from user_roles where user_id = auth.uid()) then
    raise exception 'This account is already linked to a store.';
  end if;

  insert into stores (name)
  values (coalesce(nullif(trim(p_store_name), ''), 'Rajput Medical Store'))
  returning id into v_store_id;

  insert into user_roles (store_id, user_id, role)
  values (v_store_id, auth.uid(), 'owner');

  insert into store_settings (store_id)
  values (v_store_id);

  return v_store_id;
end;
$$;

-- ============================================================================
-- END OF MIGRATION 13
-- ============================================================================
