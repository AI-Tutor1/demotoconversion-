/**
 * Client-side CSV parser + column mappers for the Product Review workflow.
 * No external dependencies — handles quoted fields with commas inside.
 */

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/** Normalize a CSV header: lowercase, strip spaces/underscores/colons. */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_:]+/g, "");
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}

/** Treat "N/A" (a common LMS export sentinel) as empty. */
function cleanNA(v: string): string {
  const t = (v ?? "").trim();
  return t === "" || t.toUpperCase() === "N/A" ? "" : t;
}

/**
 * Clean a numeric field that maps to Postgres NUMERIC(10,2) (max 99999999.99).
 * Returns "" for non-numeric or over-precision values so the RPC coalesces to NULL
 * instead of raising "numeric field overflow" and aborting the whole batch.
 */
function cleanNumeric(v: string, maxAbs = 99_999_999.99): string {
  const t = cleanNA(v);
  if (!t) return "";
  const n = Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > maxAbs) return "";
  return t;
}

/**
 * Normalize an LMS ID exported from Excel as a float: "22506.0" → "22506".
 * The DB stores these as bare integer strings; without this, session_id /
 * enrollment_id (FK) carry a trailing ".0" and the FK to enrollments fails.
 */
function cleanId(v: string): string {
  const t = cleanNA(v);
  if (!t) return "";
  // Match integer-valued floats only (e.g. "649.0", "22506.00"); leave
  // anything non-integer-looking (e.g. "ABC-1") untouched.
  const m = t.match(/^(\d+)\.0+$/);
  return m ? m[1] : t;
}

/**
 * Normalize an LMS boolean export to "" | "true" | "false" for a Postgres
 * NULLIF(...)::boolean cast. The LMS mixes conventions:
 *   - "Yes" / "No" / "true" / "false" / "1" / "0"   → standard booleans
 *   - "Unknown" / "N/A" / ""                         → attendance unclear → NULL
 *   - A student's name (e.g. "Ayesha")               → that student attended → true
 * Anything that isn't a recognized negative or an "unknown" sentinel is treated
 * as attended (true). Empty / Unknown are coalesced to "" so the cast becomes NULL.
 */
function cleanBoolean(v: string): string {
  const t = cleanNA(v);
  if (!t) return "";
  const s = t.toLowerCase();
  if (s === "unknown") return "";
  if (["yes", "y", "true", "t", "1"].includes(s)) return "true";
  if (["no", "n", "false", "f", "0"].includes(s)) return "false";
  // Non-empty, non-standard value (typically a student's name written by the
  // LMS when that student attended a multi-student session) → count as attended.
  return "true";
}

/**
 * Parse the LMS "Enrollment Name" field (only present in the log CSV).
 * Format: "{student}/{teacher} - | {curriculum} | {board} | {grade} | {subject}"
 */
function parseEnrollmentName(name: string): {
  curriculum: string;
  board: string;
  grade: string;
  subject: string;
} {
  const clean = cleanNA(name);
  if (!clean) return { curriculum: "", board: "", grade: "", subject: "" };
  const parts = clean.split("|").map((p) => p.trim());
  return {
    curriculum: parts[1] ?? "",
    board: parts[2] ?? "",
    grade: parts[3] ?? "",
    subject: parts[4] ?? "",
  };
}

/**
 * Normalize status + permanence across both LMS export vocabularies.
 * log CSV:    RESUMED / PAUSED_TEMPORARY / PAUSED_PERMANENT
 * master CSV: Active / Temporary / Permanent
 * Also honors an explicit "Is Permanent = Yes" from the log CSV.
 */
function mapStatusAndPermanence(
  rawStatus: string,
  row: Record<string, string>
): { status: string; permanent: boolean } {
  const n = cleanNA(rawStatus).toUpperCase();
  const explicitYes =
    cleanNA(row["ispermanent"] ?? row["is_permanent"] ?? "").toLowerCase() === "yes";

  if (n === "RESUMED" || n === "ACTIVE") {
    return { status: "Active", permanent: false };
  }
  if (n === "PAUSED_PERMANENT" || n === "PERMANENT") {
    return { status: "Paused", permanent: true };
  }
  if (n === "PAUSED_TEMPORARY" || n === "TEMPORARY" || n === "PAUSED" || n === "BREAK") {
    return { status: "Paused", permanent: explicitYes };
  }
  return { status: cleanNA(rawStatus), permanent: explicitYes };
}

/** Parse "M/D/YYYY" → "YYYY-MM-DD". Also accepts ISO dates unchanged. */
function parseDate(s: string): string {
  const clean = cleanNA(s);
  if (!clean) return "";
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return clean;
  const us = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!us) return "";
  const [, mm, dd, yyyy] = us;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** Parse "4/16/2026, 11:22:58 AM" → ISO timestamp. Empty on parse failure. */
function parseTimestamp(s: string): string {
  const clean = cleanNA(s);
  if (!clean) return "";
  const d = new Date(clean);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Map a parsed CSV row → enrollment payload for the upsert RPC.
 * Handles both the LMS log CSV and the master-list CSV: explicit columns win,
 * and anything missing is filled in from the Enrollment Name pipe string if present.
 */
export function mapEnrollmentRow(
  row: Record<string, string>
): Record<string, string> {
  const parsed = parseEnrollmentName(row["enrollmentname"] ?? row["enrollment_name"] ?? "");
  const { status, permanent } = mapStatusAndPermanence(
    row["enrollmentstatus"] ?? row["enrollment_status"] ?? row["status"] ?? "",
    row
  );

  return {
    enrollment_id: cleanId(row["enrollmentid"] ?? row["enrollment_id"] ?? ""),
    teacher_id: cleanId(row["teacherid"] ?? row["teacher_id"] ?? ""),
    student_id: cleanId(row["studentid"] ?? row["student_id"] ?? ""),
    teacher_name: cleanNA(row["teachername"] ?? row["teacher_name"] ?? row["teacher"] ?? ""),
    student_name: cleanNA(
      row["studentname"] ?? row["student_name"] ?? row["students"] ?? row["student"] ?? ""
    ),
    subject: cleanNA(row["subject"] ?? "") || parsed.subject,
    grade: cleanNA(row["grade"] ?? "") || parsed.grade,
    board: cleanNA(row["board"] ?? "") || parsed.board,
    curriculum: cleanNA(row["curriculum"] ?? "") || parsed.curriculum,
    session_hourly_rate: cleanNumeric(row["sessionhourlyrate"] ?? row["session_hourly_rate"] ?? ""),
    tutor_hourly_rate: cleanNumeric(row["tutorhourlyrate"] ?? row["tutor_hourly_rate"] ?? ""),
    enrollment_status: status,
    consumer_type: cleanNA(row["consumertype"] ?? row["consumer_type"] ?? ""),
    is_permanent: permanent ? "true" : "false",
    pause_starts: parseDate(row["pausestarts"] ?? row["pause_starts"] ?? ""),
    pause_ends: parseDate(row["pauseends"] ?? row["pause_ends"] ?? ""),
    action_by: cleanNA(row["actionby"] ?? row["action_by"] ?? ""),
    additional_notes: cleanNA(row["additionalnotes"] ?? row["additional_notes"] ?? ""),
    log_id: cleanNA(row["logid"] ?? row["log_id"] ?? ""),
    log_created_at: parseTimestamp(row["createdat"] ?? row["created_at"] ?? ""),
  };
}

/** Map a parsed CSV row → session payload for the upsert RPC. */
export function mapSessionRow(
  row: Record<string, string>
): Record<string, string> {
  return {
    // LMS IDs come from Excel as floats ("22506.0"); cleanId normalizes to "22506"
    // so the FK to enrollments (stored as bare integer strings) matches.
    session_id: cleanId(row["sessionid"] ?? row["session_id"] ?? ""),
    enrollment_id: cleanId(row["enrollmentid"] ?? row["enrollment_id"] ?? ""),
    // "N/A" is the LMS sentinel for "not yet scheduled". parseTimestamp
    // normalizes any recognized datetime to ISO; anything unparseable → ""
    // so the RPC's NULLIF(..., '')::timestamptz resolves to NULL.
    scheduled_time: parseTimestamp(row["scheduledtimeforsession"] ?? row["scheduled_time"] ?? row["scheduledtime"] ?? ""),
    tutor_name: row["tutorname"] ?? row["tutor_name"] ?? "",
    expected_student_1: row["expectedstudent1"] ?? row["expected_student_1"] ?? "",
    expected_student_2: row["expectedstudent2"] ?? row["expected_student_2"] ?? "",
    subject: row["subject"] ?? "",
    board: row["board"] ?? "",
    grade: row["grade"] ?? "",
    curriculum: row["curriculum"] ?? "",
    enrollment_name: row["enrollmentname"] ?? row["enrollment_name"] ?? "",
    // Numeric fields: the LMS emits sentinel strings like "No Class Time" on
    // No Show / Teacher Absent / Student Absent rows. cleanNumeric coalesces
    // those to "" so the RPC's NULLIF(...)::numeric resolves to NULL instead
    // of throwing "invalid input syntax for type numeric" and aborting the batch.
    tutor_class_time: cleanNumeric(row["tutorclasstime"] ?? row["tutor_class_time"] ?? ""),
    tutor_scaled_class_time: cleanNumeric(row["tutorscaledclasstime"] ?? row["tutor_scaled_class_time"] ?? ""),
    class_scheduled_duration: cleanNumeric(row["classscheduledduration"] ?? row["class_scheduled_duration"] ?? ""),
    student_1_class_time: cleanNumeric(row["student1classtime"] ?? row["student_1_class_time"] ?? ""),
    student_2_class_time: cleanNumeric(row["student2classtime"] ?? row["student_2_class_time"] ?? ""),
    session_date: parseDate(row["date"] ?? row["sessiondate"] ?? row["session_date"] ?? ""),
    class_status: row["classstatus"] ?? row["class_status"] ?? "",
    notes: row["notes"] ?? "",
    // LMS writes "Unknown" when attendance is unclear and a student's name
    // when that student attended. cleanBoolean maps both to proper booleans / NULL.
    attended_student_1: cleanBoolean(row["attendedstudent1"] ?? row["attended_student_1"] ?? ""),
    attended_student_2: cleanBoolean(row["attendedstudent2"] ?? row["attended_student_2"] ?? ""),
    teacher_transaction_1: row["teachertransaction1"] ?? row["teacher_transaction_1"] ?? "",
    student_transaction_1: row["studenttransaction1"] ?? row["student_transaction_1"] ?? "",
    student_transaction_2: row["studenttransaction2"] ?? row["student_transaction_2"] ?? "",
    // "Meet Recording" (normalizes to "meetrecording") is the LMS's current column
    // name for the Google Drive URL. Older exports used "recording_link" directly.
    recording_link: row["meetrecording"] ?? row["recordinglink"] ?? row["recording_link"] ?? "",
  };
}
