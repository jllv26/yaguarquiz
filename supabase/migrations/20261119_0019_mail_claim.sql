-- =====================================================================
-- YaguarQuiz UAP · 0019 · Conectar los correos sin copiar el token a mano
--   El docente (o el administrador) abre una «ventana de conexión» de 30 minutos para SU correo de Google.
--   Dentro de esa ventana, el script de Google de ESE correo pide el token una sola vez (mail_claim):
--   lo guarda en sus propiedades, activa los correos y la ventana se cierra. Nadie copia ni pega secretos.
-- =====================================================================

alter table public.teacher_settings add column if not exists mail_claim_email text;
alter table public.teacher_settings add column if not exists mail_claim_until timestamptz;

-- El docente abre la ventana desde YaguarQuiz (Configuración → Correos)
create or replace function public.mail_claim_open(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Solo un docente aprobado'; end if;
  if coalesce(p_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  insert into public.teacher_settings (teacher_id, mail_claim_email, mail_claim_until)
  values (auth.uid(), lower(btrim(p_email)), now() + interval '30 minutes')
  on conflict (teacher_id) do update set mail_claim_email = excluded.mail_claim_email, mail_claim_until = excluded.mail_claim_until, updated_at = now();
  return jsonb_build_object('ok', true, 'until', now() + interval '30 minutes');
end $$;

-- Lo llama el script de Google (anónimo) con el correo de la cuenta que lo ejecuta
create or replace function public.mail_claim(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ts public.teacher_settings; v_tok text;
begin
  select * into ts from public.teacher_settings
   where mail_claim_until > now() and mail_claim_email = lower(btrim(coalesce(p_email, '')))
   order by mail_claim_until desc limit 1;
  if ts.teacher_id is null then return jsonb_build_object('ok', false, 'error', 'no_window'); end if;
  v_tok := coalesce(nullif(ts.sheets_token, ''), replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
  update public.teacher_settings
     set sheets_token = v_tok, mail_enabled = true, mail_claim_until = null, updated_at = now()
   where teacher_id = ts.teacher_id;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $$;

revoke all on function public.mail_claim_open(text) from public, anon;
grant execute on function public.mail_claim_open(text) to authenticated;
revoke all on function public.mail_claim(text) from public;
grant execute on function public.mail_claim(text) to anon, authenticated;

notify pgrst, 'reload schema';
