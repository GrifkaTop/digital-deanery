-- Synthetic results for the two demonstration profiles. Existing results are never overwritten.
INSERT INTO sports_norm_results (semester_id, student_id, code, title, unit, direction, result, status, position)
SELECT sm.id, s.id, v.code, v.title, v.unit, v.direction,
       CASE s.student_number WHEN 'DEMO-1' THEN v.result_a ELSE v.result_b END,
       CASE s.student_number WHEN 'DEMO-1' THEN v.status_a ELSE v.status_b END, v.position
FROM students s
JOIN semesters sm ON sm.is_current
CROSS JOIN (VALUES
  ('sprint', 'Бег на 100 м', 'с', 'lower', 14.8::numeric, 'passed', 15.6::numeric, 'passed', 0),
  ('jump', 'Прыжок в длину с места', 'см', 'higher', 185::numeric, 'failed', 190::numeric, 'passed', 1),
  ('pushups', 'Отжимания', 'повт.', 'higher', NULL::numeric, 'unattempted', 14::numeric, 'passed', 2),
  ('bend', 'Наклон вперёд', 'см', 'higher', 8::numeric, 'passed', NULL::numeric, 'unattempted', 3)
) AS v(code, title, unit, direction, result_a, status_a, result_b, status_b, position)
WHERE s.student_number IN ('DEMO-1', 'DEMO-2')
ON CONFLICT DO NOTHING;
