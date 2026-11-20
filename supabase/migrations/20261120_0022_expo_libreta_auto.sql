-- =====================================================================
-- YaguarQuiz UAP · 0022 · Las notas de las exposiciones pasan SOLAS a la libreta
--   Si la exposición está vinculada a una categoría (ej. «Exposiciones» del Tercer parcial), cada vez que
--   el docente califica, un compañero califica o se marca ausente/expuso, la nota final se actualiza en la
--   libreta (manual_scores). Ya no hace falta presionar «Enviar a la libreta» cada vez.
-- =====================================================================

create or replace function public._presentation_sync(p_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r public.presentations; n int := 0; g record;
begin
  select * into r from public.presentations where id = p_id;
  if r.id is null or r.grading_item_id is null then return 0; end if;
  for g in select * from public._presentation_grades(r.id) where final is not null loop
    insert into public.manual_scores (teacher_id, grading_item_id, student_id, score)
    values (r.teacher_id, r.grading_item_id, g.student_id, g.final)
    on conflict (grading_item_id, student_id) do update set score = excluded.score, updated_at = now()
      where public.manual_scores.score is distinct from excluded.score;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._presentation_sync(uuid) from public, anon, authenticated;

create or replace function public._presentation_sync_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._presentation_sync(coalesce(new.presentation_id, old.presentation_id));
  return null;
end $$;

drop trigger if exists presentation_presenters_sync on public.presentation_presenters;
create trigger presentation_presenters_sync after update of teacher_scores, state on public.presentation_presenters
  for each row execute function public._presentation_sync_trg();
drop trigger if exists presentation_reviews_sync on public.presentation_reviews;
create trigger presentation_reviews_sync after insert or update or delete on public.presentation_reviews
  for each row execute function public._presentation_sync_trg();

create or replace function public._presentations_link_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.grading_item_id is distinct from old.grading_item_id or new.settings is distinct from old.settings then
    perform public._presentation_sync(new.id);
  end if;
  return null;
end $$;
drop trigger if exists presentations_link_sync on public.presentations;
create trigger presentations_link_sync after update of grading_item_id, settings on public.presentations
  for each row execute function public._presentations_link_trg();

-- El docente vincula (o desvincula) la exposición a una categoría manual de su plan
create or replace function public.presentation_link_gradebook(p_id uuid, p_item uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.presentations;
begin
  r := public._own_presentation(p_id);
  if p_item is not null and not exists (select 1 from public.grading_items gi join public.grading_plans gp on gp.id = gi.plan_id
                  where gi.id = p_item and gp.subject_id = r.subject_id and gi.teacher_id = auth.uid() and gi.source = 'manual') then
    raise exception 'Elija una categoría manual del plan de calificación de esta asignatura (por ejemplo, Exposiciones)';
  end if;
  update public.presentations set grading_item_id = p_item where id = r.id;
  return jsonb_build_object('ok', true, 'synced', public._presentation_sync(r.id));
end $$;
revoke all on function public.presentation_link_gradebook(uuid, uuid) from public, anon;
grant execute on function public.presentation_link_gradebook(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
