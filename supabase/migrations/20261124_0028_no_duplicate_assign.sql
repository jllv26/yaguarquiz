-- 0028 · Una actividad (o examen) solo puede estar asignada una vez a la vez en cada asignatura.
-- Evita copias repetidas (por ejemplo, al presionar «Lanzar» dos veces): cada copia contaría aparte en la libreta.
create or replace function public._sessions_no_duplicate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_title text;
begin
  if new.mode in ('homework', 'exam') and exists (
       select 1 from public.sessions s
        where s.quiz_id = new.quiz_id and s.subject_id = new.subject_id
          and s.mode in ('homework', 'exam') and s.status <> 'finished'
          and (s.scheduled_end is null or s.scheduled_end > now())
          and s.id is distinct from new.id) then
    select title into v_title from public.quizzes where id = new.quiz_id;
    raise exception '«%» ya está asignada en esta asignatura. Para cambiar fechas o intentos, ábrala en Sesiones; para asignarla de nuevo, primero ciérrela o elimínela.', v_title
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_no_duplicate on public.sessions;
create trigger sessions_no_duplicate before insert on public.sessions
  for each row execute function public._sessions_no_duplicate();
