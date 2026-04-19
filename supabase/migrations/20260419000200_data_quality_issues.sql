-- ============================================================
-- Data-quality audit: persistent record of invariants the system
-- should always satisfy. The nightly APScheduler job writes here;
-- managers view via /admin/data-quality.
--
-- Also seeds teacher_roster from the frontend TEACHERS array so
-- the `unrostered_teacher` probe can catch tutors who appear in
-- sessions.teacher_user_id but were never added to lib/types.ts
-- (silent UI-hiding bug class).
-- ============================================================

-- ── teacher_roster (mirrors lib/types.ts TEACHERS) ────────────
CREATE TABLE IF NOT EXISTS public.teacher_roster (
  uid         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.teacher_roster IS
  'Point-in-time snapshot of the frontend TEACHERS array (lib/types.ts). When hiring a new tutor, add a row here in the same PR that updates lib/types.ts.';

INSERT INTO public.teacher_roster (uid, name) VALUES
  ('784', 'Hasnain Badar'),
  ('776', 'Maryam Qureshi'),
  ('775', 'Aliza Shakeel'),
  ('774', 'Aqsa Riaz'),
  ('773', 'Rida Durrani'),
  ('772', 'Hira Amran'),
  ('771', 'Noreen Farman'),
  ('770', 'Nuha Hyath'),
  ('769', 'Muhammad Bin Khalid'),
  ('768', 'Muhammad Ebraheem'),
  ('764', 'Humaail Raja'),
  ('762', 'Asifa Tehseen'),
  ('761', 'Sumbal Arshad'),
  ('760', 'Faraz Latif'),
  ('756', 'Hadi Shahid'),
  ('750', 'Minahil Sohail'),
  ('748', 'Abdullah Abu Saeed'),
  ('747', 'Minahil Sohail'),
  ('746', 'Hiba Rumman'),
  ('745', 'Talha Arif'),
  ('743', 'Faiq Lodhi'),
  ('736', 'Unaysah Naveed'),
  ('735', 'Muhammed Kumail Ruhani'),
  ('730', 'Areeba Saqib'),
  ('729', 'Nauman Nasir'),
  ('728', 'Afreen Mansoor'),
  ('727', 'Unais Iqbal'),
  ('726', 'Yashal'),
  ('716', 'Sana Ali'),
  ('715', 'Maha Farooq'),
  ('708', 'Laiba Hameed'),
  ('702', 'Tester Teacher'),
  ('701', 'Ines'),
  ('696', 'Tooba Khan'),
  ('692', 'Mohsin Raza'),
  ('689', 'Aida Chaudhry'),
  ('684', 'Hunzilah Bilal'),
  ('680', 'Javed Mushtaq'),
  ('676', 'Beenish Azeem'),
  ('670', 'Hira Saeed'),
  ('666', 'Zeeshan Abbasi'),
  ('644', 'Fiza Imran'),
  ('640', 'Maryam Saeed'),
  ('639', 'Joseph Metry'),
  ('634', 'Hansa Amir'),
  ('630', 'Laiba Nadeem Khan'),
  ('628', 'Faizan Altaf'),
  ('626', 'Ayesha Javed'),
  ('622', 'Iman Killani'),
  ('619', 'Asad Tariq'),
  ('617', 'Musharraf Ramzy'),
  ('614', 'Lubna Kashif'),
  ('611', 'Sara Arshad'),
  ('609', 'Umm ul Baneen'),
  ('602', 'Wasiq Khan'),
  ('601', 'Fatima Khalid'),
  ('600', 'Zehra Saleem'),
  ('599', 'Rameesha Saleem'),
  ('598', 'Nageena Arif'),
  ('594', 'Hira Zafar'),
  ('592', 'Mariam Sturgees'),
  ('585', 'Muhammad Yamin'),
  ('583', 'Alishba Shahzad'),
  ('582', 'Tuitional Test'),
  ('581', 'Tayyaba Sabir'),
  ('576', 'Maryam Saleem'),
  ('575', 'Ayesha Waqas'),
  ('569', 'Arubah Ghaffar'),
  ('554', 'Ali Mirza'),
  ('552', 'Uzma Owais'),
  ('550', 'Aravinthan Bhascaran'),
  ('547', 'Maryam Imran'),
  ('543', 'Inayat Karim'),
  ('541', 'Mariam Abbas'),
  ('537', 'Naadiya Rizvi'),
  ('534', 'Aliza Jafri'),
  ('527', 'Ayman Noor'),
  ('522', 'Muhammad Taimoor'),
  ('519', 'Zainab Fatima'),
  ('509', 'Alishba binte Amir'),
  ('488', 'Dur e Shahwar Imran'),
  ('484', 'Fakhr e Alam'),
  ('483', 'wajeehagul'),
  ('481', 'Muhammad Osama'),
  ('479', 'Dur e Kashaf'),
  ('477', 'Ali Akbar'),
  ('465', 'Basma'),
  ('456', 'Bilal Khalid'),
  ('454', 'Fakeha Ahmed'),
  ('448', 'Ahrar Amin'),
  ('429', 'Neha HASAN'),
  ('421', 'Faiza Khalid'),
  ('415', 'Asia Ashraf'),
  ('408', 'Maliha Rafi Khan'),
  ('405', 'baigmirzasinan'),
  ('401', 'SapnaN'),
  ('397', 'SherineAazer'),
  ('396', 'Muhammad Ebraheem'),
  ('386', 'Muniba Khan'),
  ('385', 'Muhammad Hassan Khan'),
  ('383', 'FAISALMASOOD'),
  ('380', 'Allaa Macharka'),
  ('379', 'JunaidAli'),
  ('378', 'Ritesh Walecha'),
  ('377', 'Rabbia Mahboob'),
  ('376', 'Muhammad Haris Naeem Khokhar'),
  ('354', 'Adnan Khurshid'),
  ('312', 'Saad Karim'),
  ('302', 'Muhammad Sabir'),
  ('295', 'Shoaib'),
  ('294', 'Faizan Ilahi'),
  ('256', 'Dolan Rodrigues'),
  ('239', 'Lamia Amir'),
  ('232', 'Malaika Arif'),
  ('231', 'Ubaid Sheikh'),
  ('227', 'Abdul Nazeem'),
  ('223', 'Sabeen Fatima'),
  ('218', 'Azain Shaikh'),
  ('215', 'Moazzam Malik'),
  ('213', 'Muhammad Waqas'),
  ('200', 'John Fernandes'),
  ('190', 'Shaizah Nasir'),
  ('185', 'Salman'),
  ('175', 'Khwaja Yasin'),
  ('174', 'Zeeshan Ahmed'),
  ('172', 'Saima Noor'),
  ('154', 'Raheel Naseer'),
  ('153', 'Dr. Mahnoor Ashraf'),
  ('142', 'Sara Ali Omar'),
  ('141', 'Mahnoor Gul'),
  ('140', 'Saif ul Hasan'),
  ('119', 'Mohamed Essam'),
  ('118', 'Uzma Shabbir'),
  ('114', 'Ainiya Hafiz'),
  ('113', 'Syed Zain Ali Akbar'),
  ('112', 'Irum Asif'),
  ('111', 'Tayyaba Anwar'),
  ('109', 'Ayza Shahid'),
  ('108', 'Adeena Yaqoob'),
  ('107', 'Sophia Abid'),
  ('106', 'Hassam Umer'),
  ('105', 'Sajjad Hameed'),
  ('104', 'Eesha Qureshi'),
  ('103', 'Farheen Nasim'),
  ('99',  'Nimra Nishat'),
  ('98',  'Muhammad Umer Imran'),
  ('97',  'Afsheen Mohsin'),
  ('96',  'Meher Gul'),
  ('93',  'Sajida Karimi'),
  ('92',  'Subhan Shabbir Tinwala'),
  ('91',  'Sadaf Yousuf'),
  ('90',  'Rizwan Anwer'),
  ('89',  'Sara Jawaid'),
  ('70',  'Syed Muhammad Dilawaiz Shafi'),
  ('69',  'Rafay Mansoor'),
  ('68',  'Uroosha Sabir'),
  ('67',  'Abdur Rehman Imran'),
  ('66',  'Vivek Madan'),
  ('65',  'Sana Ahmed'),
  ('64',  'Saghar Muhammad'),
  ('63',  'Samina Kausar'),
  ('62',  'Shoaib Ghani'),
  ('61',  'Muhammed Ahmed'),
  ('60',  'Summaiya Saleem'),
  ('48',  'murtaza'),
  ('46',  'Afroze Zaidi'),
  ('31',  'ahmed'),
  ('18',  'Taha Shahid'),
  ('11',  'Ahmed Shaheer'),
  ('6',   'Mirza Sinan Baig'),
  ('4',   'Syed Ahmer Hussain')
ON CONFLICT (uid) DO NOTHING;

ALTER TABLE public.teacher_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read teacher_roster" ON public.teacher_roster
  FOR SELECT TO authenticated USING (true);

-- ── data_quality_issues (open issues ledger) ──────────────────
CREATE TABLE IF NOT EXISTS public.data_quality_issues (
  id            BIGSERIAL PRIMARY KEY,
  issue_type    TEXT NOT NULL CHECK (issue_type IN (
                  'null_teacher_linkage',
                  'orphan_enrollment',
                  'unrostered_teacher',
                  'stuck_pending_review',
                  'approved_not_surfaced')),
  session_id    BIGINT REFERENCES public.sessions(id) ON DELETE CASCADE,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Idempotency: rerunning the audit never creates a second open row
-- for the same (issue_type, session_id). Once resolved_at is set,
-- a future detection re-opens a fresh row.
CREATE UNIQUE INDEX IF NOT EXISTS data_quality_issues_open_uk
  ON public.data_quality_issues (issue_type, session_id)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_data_quality_issues_open_type
  ON public.data_quality_issues (issue_type)
  WHERE resolved_at IS NULL;

ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysts and managers read dq issues" ON public.data_quality_issues
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('analyst','manager'));

-- Analysts + managers can mark an issue resolved from the admin UI.
CREATE POLICY "analysts and managers resolve dq issues" ON public.data_quality_issues
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('analyst','manager'))
  WITH CHECK (current_user_role() IN ('analyst','manager'));
