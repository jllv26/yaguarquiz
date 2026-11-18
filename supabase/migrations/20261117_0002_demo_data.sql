-- =====================================================================
-- YaguarQuiz UAP — Datos de ejemplo
-- Función que el docente ejecuta desde su panel ("Cargar datos de ejemplo").
-- Crea datos marcados como DEMO para probar el sistema; se pueden borrar
-- con delete_demo_data(). No toca datos reales.
-- =====================================================================

create or replace function public.seed_demo_data()
returns json language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  st_id uuid; y_id uuid; p_id uuid; s_id uuid; t_id uuid; q_id uuid; qq uuid; plan uuid;
  i int;
  names text[][] := array[
    ['Pérez Gómez', 'Ana Lucía'], ['Mamani Quispe', 'Carlos'], ['Rojas Vaca', 'María José'],
    ['Suárez Méndez', 'Luis Fernando'], ['Cuéllar Áñez', 'Daniela'], ['Justiniano Roca', 'Jorge'],
    ['Vargas Melgar', 'Sofía'], ['Choque Flores', 'Miguel Ángel'], ['Antelo Durán', 'Valeria'],
    ['Pinto Saucedo', 'Diego'], ['Ortiz Paz', 'Camila'], ['Arteaga Becerra', 'Rodrigo']];
begin
  if not public.is_teacher() then
    raise exception 'Solo un docente aprobado puede cargar datos de ejemplo';
  end if;
  if exists (select 1 from public.subjects where teacher_id = uid and code = 'DEMO 023') then
    return json_build_object('ok', true, 'message', 'Los datos de ejemplo ya estaban cargados');
  end if;

  insert into public.academic_years (year) values (2026)
    on conflict (teacher_id, year) do update set year = excluded.year returning id into y_id;
  select id into p_id from public.periods where academic_year_id = y_id and name = 'II/2026 (DEMO)';
  if p_id is null then
    insert into public.periods (academic_year_id, name, starts_on, ends_on)
      values (y_id, 'II/2026 (DEMO)', '2026-08-01', '2026-12-15') returning id into p_id;
  end if;
  insert into public.subjects (period_id, code, name, career, semester, parallel, theme_color)
    values (p_id, 'DEMO 023', 'Tecnologías de la Información y Comunicación (DEMO)',
            'Turismo Sostenible', '5to semestre', 'A', '#1B7339')
    returning id into s_id;

  -- Estudiantes ficticios
  for i in 1 .. array_length(names, 1) loop
    insert into public.students (university_code, ci, last_names, first_names, career)
    values ('DEMO-' || lpad(i::text, 3, '0'), (9000000 + i)::text, names[i][1], names[i][2], 'Turismo Sostenible')
    on conflict (teacher_id, university_code) do update set last_names = excluded.last_names
    returning id into st_id;
    insert into public.enrollments (subject_id, student_id) values (s_id, st_id)
    on conflict do nothing;
  end loop;

  -- Plan de calificación (tabla del docente: 30 + 30 + 40 = 100)
  insert into public.grading_plans (subject_id) values (s_id) returning id into plan;
  insert into public.grading_items (plan_id, term, category, weight, source, sort_order)
  select plan, t.term, c.category, c.weight, c.source, c.ord
  from generate_series(1, 3) as t(term)
  cross join (values
    ('Asistencia y compromiso', 5, 'manual', 1),
    ('Ejercicios en clase', 3, 'yaguarquiz', 2),
    ('Investigaciones para casa', 5, 'yaguarquiz', 3),
    ('Prácticas para casa', 5, 'yaguarquiz', 4),
    ('Exposiciones', 5, 'manual', 5),
    ('Examen y pruebas escritas', 7, 'yaguarquiz', 6)
  ) as c(category, weight, source, ord);
  insert into public.grading_items (plan_id, term, category, weight, source, sort_order)
    values (plan, 3, 'Proyecto final', 10, 'manual', 7);

  -- Tema y evaluación de ejemplo
  insert into public.topics (subject_id, name, unit, description, sort_order)
    values (s_id, 'Herramientas ofimáticas e internet', 'Unidad 1', 'Tema de ejemplo', 1)
    returning id into t_id;
  insert into public.quizzes (subject_id, topic_id, title, description, status)
    values (s_id, t_id, 'Repaso Unidad 1 (DEMO)', 'Evaluación de ejemplo con los tipos de pregunta del MVP', 'published')
    returning id into q_id;

  -- 1. Opción única
  insert into public.questions (quiz_id, sort_order, type, prompt, time_limit_sec, explanation, tags)
    values (q_id, 1, 'single', '¿Cuál es la capital del departamento de Pando?', 20,
            'Cobija es la capital de Pando desde su creación como departamento en 1938.', '{pando,geografia}')
    returning id into qq;
  insert into public.question_options (question_id, text, is_correct, sort_order) values
    (qq, 'Cobija', true, 1), (qq, 'Riberalta', false, 2), (qq, 'Trinidad', false, 3), (qq, 'Puerto Rico', false, 4);

  -- 2. Varias correctas
  insert into public.questions (quiz_id, sort_order, type, prompt, time_limit_sec, explanation, tags)
    values (q_id, 2, 'multiple', '¿Cuáles de estos programas son hojas de cálculo?', 30,
            'Excel y Google Sheets son hojas de cálculo; Word y PowerPoint no.', '{ofimatica}')
    returning id into qq;
  insert into public.question_options (question_id, text, is_correct, sort_order) values
    (qq, 'Microsoft Excel', true, 1), (qq, 'Microsoft Word', false, 2),
    (qq, 'Google Sheets', true, 3), (qq, 'PowerPoint', false, 4);

  -- 3. Verdadero / Falso
  insert into public.questions (quiz_id, sort_order, type, prompt, time_limit_sec, explanation, tags)
    values (q_id, 3, 'true_false', 'Una contraseña segura debe tener al menos 12 caracteres.', 10,
            'Las recomendaciones actuales piden contraseñas largas, de 12 caracteres o más.', '{seguridad}')
    returning id into qq;
  insert into public.question_options (question_id, text, is_correct, sort_order) values
    (qq, 'Verdadero', true, 1), (qq, 'Falso', false, 2);

  -- 4. Respuesta corta
  insert into public.questions (quiz_id, sort_order, type, prompt, time_limit_sec, explanation, accepted_answers, tags)
    values (q_id, 4, 'short_text', '¿Qué fruto amazónico es el principal producto de exportación de Pando?', 30,
            'La castaña (nuez de Brasil o almendra amazónica).', '{castaña,castana,almendra,nuez de brasil}', '{pando}');

  -- 5. Ordenar
  insert into public.questions (quiz_id, sort_order, type, prompt, time_limit_sec, explanation, tags)
    values (q_id, 5, 'ordering', 'Ordena los pasos para enviar un correo con archivo adjunto', 45,
            'Primero se redacta, luego se adjunta, se revisa y se envía.', '{correo}')
    returning id into qq;
  insert into public.question_options (question_id, text, is_correct, sort_order, correct_position) values
    (qq, 'Hacer clic en "Enviar"', true, 1, 4), (qq, 'Escribir destinatario y asunto', true, 2, 1),
    (qq, 'Revisar el mensaje', true, 3, 3), (qq, 'Adjuntar el archivo', true, 4, 2);

  -- 6. Opción única con puntos dobles
  insert into public.questions (quiz_id, sort_order, type, prompt, time_limit_sec, base_points, explanation, tags)
    values (q_id, 6, 'single', 'En Excel, ¿qué función suma un rango de celdas?', 20, 2000,
            '=SUMA(A1:A10) suma todos los valores del rango.', '{excel}')
    returning id into qq;
  insert into public.question_options (question_id, text, is_correct, sort_order) values
    (qq, '=SUMA()', true, 1), (qq, '=CONTAR()', false, 2), (qq, '=PROMEDIO()', false, 3), (qq, '=SI()', false, 4);

  return json_build_object('ok', true, 'message', 'Datos de ejemplo cargados', 'subject_id', s_id, 'quiz_id', q_id);
end $$;

create or replace function public.delete_demo_data()
returns json language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if not public.is_teacher() then
    raise exception 'Solo un docente aprobado puede borrar datos de ejemplo';
  end if;
  delete from public.students where teacher_id = auth.uid() and university_code like 'DEMO-%';
  delete from public.periods where teacher_id = auth.uid() and name like '%(DEMO)%';
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'message', 'Datos de ejemplo eliminados');
end $$;

revoke all on function public.seed_demo_data() from public, anon;
revoke all on function public.delete_demo_data() from public, anon;
grant execute on function public.seed_demo_data() to authenticated;
grant execute on function public.delete_demo_data() to authenticated;
