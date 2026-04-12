-- Seed the 12 demos from lib/data.ts SEED_DEMOS.
-- ts values preserve the NOW - N*DAY offsets from the in-memory seed.
-- workflow_stage is derived from status: Pending→new, Converted→converted, Not Converted→lost.
-- analyst_id / sales_agent_id stay NULL (pre-auth historical records).

INSERT INTO public.demos (
  id, date, teacher, tid, student, level, subject, review,
  student_raw, analyst_rating, status, suggestions,
  agent, comments, verbatim, acct_type, link, marketing,
  ts, workflow_stage
) VALUES
  (1,  '2026-04-10', 'Shoaib Ghani',     62,  'Ahmed Khan',     'IGCSE',    'Mathematics',
       'Strong methodology but camera issues.',
       8, 4, 'Pending',       'Keep camera on.',
       '',        '',                                  '',                             '',        '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL  '2 days')) * 1000)::BIGINT, 'new'),

  (2,  '2026-04-09', 'Nageena Arif',    598,  'Sara Ali',       'O Level',  'Chemistry',
       'Excellent engagement throughout.',
       9, 5, 'Pending',       'Add practice problems.',
       '',        '',                                  '',                             '',        '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL  '3 days')) * 1000)::BIGINT, 'new'),

  (3,  '2026-04-08', 'Rizwan Anwer',     90,  'Hanna Mahmood',  'A2 Level', 'Further Mathematics',
       'Good pace, limited whiteboard.',
       7, 3, 'Converted',     'Use whiteboard for proofs.',
       'Maryam',  'Parent impressed. Closed same day.', 'The teacher was really smart.', '',       '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL  '4 days')) * 1000)::BIGINT, 'converted'),

  (4,  '2026-04-07', 'Sophia Abid',     107,  'Omar Raza',      'IGCSE',    'Physics',
       'Rushed and one-directional.',
       5, 2, 'Not Converted', 'Build rapport first.',
       'Muhammad','Student found it too fast.',         'Too fast, did not understand.', 'Product','', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL  '5 days')) * 1000)::BIGINT, 'lost'),

  (5,  '2026-04-11', 'Inayat Karim',    543,  'Layla Sheikh',   'IB',       'Biology',
       'Very interactive with great examples.',
       9, 5, 'Pending',       'No improvements needed.',
       '',        '',                                  '',                             '',        '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL  '1 day'))  * 1000)::BIGINT, 'new'),

  (6,  '2026-04-08', 'Maryam Imran',    547,  'Zara Malik',     'IGCSE',    'English',
       'Prepared but inflexible.',
       6, 3, 'Pending',       'Assess level before preparing.',
       '',        '',                                  '',                             '',        '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL  '4 days')) * 1000)::BIGINT, 'new'),

  (7,  '2026-04-06', 'Hira Zafar',      594,  'Hassan Raza',    'A Level',  'Physics',
       'Good knowledge, ended early.',
       7, 4, 'Pending',       'Use full session time.',
       '',        '',                                  '',                             '',        '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL  '6 days')) * 1000)::BIGINT, 'new'),

  (8,  '2026-04-12', 'Rameesha Saleem', 599,  'Alina Farooq',   'A Level',  'Economics',
       'Excellent demo. Perfect structure.',
       10, 5, 'Pending',      'Use as training example.',
       '',        '',                                  '',                             '',        '', TRUE,
       (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,                        'new'),

  (9,  '2026-03-15', 'Shoaib Ghani',     62,  'Bilal Ahmed',    'IGCSE',    'Mathematics',
       'Solid algebra session.',
       8, 4, 'Converted',     'Add word problems.',
       'Hoor',    'Quick close.',                       'Very patient teacher.',        '',       '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL '28 days')) * 1000)::BIGINT, 'converted'),

  (10, '2026-03-10', 'Inayat Karim',    543,  'Fatima Noor',    'IB',       'Biology',
       'Content great when connected.',
       6, 4, 'Not Converted', 'Test connection.',
       'Maryam',  'Chose local tutor.',                 'Internet kept cutting out.',   'Product','', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL '33 days')) * 1000)::BIGINT, 'lost'),

  (11, '2026-03-20', 'Nageena Arif',    598,  'Amina Shah',     'IGCSE',    'Chemistry',
       'Great session.',
       9, 5, 'Converted',     'Continue.',
       'Muhammad','Enrolled 3 months.',                 'Loved the style.',             '',       '', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL '23 days')) * 1000)::BIGINT, 'converted'),

  (12, '2026-03-05', 'Sophia Abid',     107,  'Tariq Hassan',   'O Level',  'Physics',
       'Monotone delivery.',
       4, 2, 'Not Converted', 'Style overhaul needed.',
       'Hoor',    'Child was bored.',                   'It was boring.',               'Product','', FALSE,
       (EXTRACT(EPOCH FROM (NOW() - INTERVAL '38 days')) * 1000)::BIGINT, 'lost');

-- Advance the BIGSERIAL so the next insert starts at 13
SELECT setval('public.demos_id_seq', (SELECT MAX(id) FROM public.demos));

-- Seed the 9 POUR issues across 7 demos
INSERT INTO public.pour_issues (demo_id, category, description) VALUES
  (1,  'Video',       'Camera off 10 min'),
  (3,  'Resources',   'No visual aids'),
  (4,  'Interaction', 'One-directional'),
  (4,  'Time',        'Ended early'),
  (6,  'Interaction', 'Did not adapt'),
  (6,  'Resources',   'Too advanced'),
  (7,  'Time',        'Ended 15 min early'),
  (10, 'Technical',   'Zoom disconnected'),
  (12, 'Interaction', 'No questions');
