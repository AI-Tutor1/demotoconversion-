# CONTEXT.md — Business Domain & Pipeline Logic

## Business Overview

This platform serves a **tutoring company based in Karachi, Pakistan** that offers online tutoring across IGCSE, O Level, A Level, IB, and other curricula. When a potential student books a demo session, a teacher delivers a trial class. The platform tracks what happens between that demo and the student either enrolling (converting) or not.

### Scale
- **170 teachers** in the reference database
- **12 seed demos** in development (represents typical volume of ~50 demos/week in production)
- **3 sales agents**: Maryam, Hoor, Muhammad
- **2–5 analysts** reviewing demos (multi-user design, Phase 2)
- **1–2 managers** overseeing the pipeline

## The 11-Step Pipeline

Every demo flows through these steps sequentially:

### Step 1: Recording Retrieval
A demo class is recorded on Zoom/Google Meet. The recording URL is captured by the analyst.

### Step 2: Data Extraction
Basic metadata is entered: student name, teacher name, level, subject, date. The teacher is matched to their user ID from the reference database (170 teachers with name → ID mappings).

### Step 3: POUR Issue Identification
POUR stands for the 7 categories of issues that can occur during a demo:

| Category | What it means |
|----------|---------------|
| **Video** | Camera issues — off, poor quality, wrong angle |
| **Interaction** | One-directional teaching, no student engagement, didn't adapt to level |
| **Technical** | Internet drops, audio issues, Zoom crashes |
| **Cancellation** | Session cancelled or rescheduled |
| **Resources** | No materials shared, materials too advanced/basic, whiteboard not used |
| **Time** | Session ended early, started late, poor time management |
| **No Show** | Teacher or student didn't appear |

Each flagged POUR category has a **description field** where the analyst writes specifically what happened (e.g., "Camera off for first 10 minutes" under Video).

### Step 4: Qualitative Review
The analyst evaluates across 5 structured dimensions:
1. **Methodology** — Teaching approach, pacing, scaffolding
2. **Topic** — Was the content appropriate for the student's level?
3. **Resources** — Materials used, whiteboard, slides, practice problems
4. **Engagement** — Student participation, interactivity
5. **Effectiveness** — Did the student learn? Evidence of comprehension?

### Step 5: Student Feedback Capture
Student/parent feedback from a post-demo form is captured: a numeric rating (out of 10) and optional written feedback (verbatim).

### Step 6: Rating Standardization (Automated)
The student's raw rating out of 10 is converted to a 5-point scale: `rating_5 = Math.round(raw / 2)`. This happens automatically.

### Step 7: Handoff to Sales (Automated)
Once the analyst submits, the demo moves to status "Pending" in the sales queue. In Phase 2, the Router agent auto-assigns to the sales agent with the most available capacity.

### Step 8: Sales Team Input
The assigned sales agent:
- Reviews the analyst's notes and ratings
- Contacts the parent/guardian
- Records their own comments
- Captures the student's verbatim feedback
- Marks the demo as Converted or Not Converted
- Records the parent's contact number
- Flags if this is a marketing lead
- Adds a reference link if applicable

### Step 9: Master Data Compilation (Automated)
A database view joins all fields from Steps 1–8 into a single master record.

### Step 10: Accountability Classification
When a demo is marked **Not Converted**, someone must own the reason:

| Type | When to assign | Example |
|------|---------------|---------|
| **Sales** | Teacher did well (rating ≥ 4, no POUR), student was interested, but sales couldn't close | "Parent liked the demo but found pricing too high" |
| **Product** | Teacher performed poorly (rating ≤ 2, or POUR issues flagged) | "One-directional teaching, student was bored" |
| **Consumer** | Teacher and sales both performed well, but external factors prevented conversion | "Family moving abroad", "Student chose local tutor" |

**Auto-suggestion logic:**
- If `analystRating <= 2` OR `pour.length > 0` → suggest **Product**
- If `analystRating >= 4` AND `studentRaw >= 7` AND `pour.length === 0` → suggest **Sales**
- Otherwise → suggest **Consumer**

The sales agent can override the suggestion.

### Step 11: Teacher Review Sheet
All demos for a teacher are aggregated into a performance profile: conversion rate, average rating, POUR frequency by category, and a coaching report with specific improvement actions.

## Multi-User Assignment Rules

### Analysts
- Each analyst has a `max_capacity` (default: 15 concurrent demos)
- **Claim-based mode** (default): Unassigned demos appear in the pool. Analysts click "Claim." First claim wins (atomic database update).
- **Auto-assign mode**: System assigns to analyst with lowest `current_load` who has capacity.
- **Manager-assigned**: Manager manually assigns from admin panel.

### Sales Agents
- Each agent has a `max_capacity` (default: 20 concurrent leads)
- **Auto-assign** (default): When an analyst submits a review, the Router agent assigns the demo to the sales agent with the most available capacity.
- Agents see their own queue by default, with a toggle to view the team queue.

### Handoff Protocol
1. Analyst submits review → demo status changes to "Pending Sales"
2. System selects sales agent with lowest load
3. Agent receives realtime notification
4. Analyst's load decrements, agent's load increments
5. Activity log records: "Analyst [name] submitted [student] → assigned to [agent]"

### Escalation Thresholds
| Condition | Action |
|-----------|--------|
| Unassigned > 2 hours | Auto-assign to fallback analyst |
| Analyst hasn't submitted > 48 hours | Notify analyst + manager |
| Sales hasn't followed up > 72 hours | Escalate to manager dashboard |
| Total pending > 5 days | Flag as Critical in Kanban |

## Kanban Board Column Logic

Cards are categorized by **workflow state**, not age:

| Column | Condition |
|--------|-----------|
| **New** | `status === "Pending"` AND no review AND no POUR data |
| **Under review** | `status === "Pending"` AND has partial review data |
| **Pending sales** | `status === "Pending"` AND `analystRating > 0` AND `review` exists |
| **Converted** | `status === "Converted"` |
| **Not converted** | `status === "Not Converted"` |

## AI Agent Architecture (Phase 3)

Seven AI agents are planned as virtual employees:

| Agent | Trigger | What it does |
|-------|---------|-------------|
| **Ingest** | Recording uploaded | Transcribes audio (Whisper), extracts metadata |
| **Demo Analyst** | Transcript ready | Drafts POUR flags, qualitative review, suggested ratings |
| **Router** | Analyst submits | Assigns demo to optimal sales agent |
| **Sales Coach** | Demo assigned | Generates follow-up script and talking points |
| **Classifier** | Marked Not Converted | Auto-classifies accountability with reasoning |
| **Teacher Coach** | Monthly | Generates coaching report per teacher |
| **Escalation** | Hourly | Checks for demos exceeding time thresholds |

**Human-in-the-loop**: Every AI output goes to a `demo_drafts` table first. The human sees a split view (AI draft + source transcript) with per-field accept/edit toggles. `approval_rate` tracks what percentage of AI output was accepted unchanged.

## Key Business Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Conversion rate | Converted / Total | > 40% |
| POUR rate | Demos with issues / Total | Lower is better |
| Average analyst rating | Mean of all ratings | > 3.5/5 |
| Pending aging | Days since submission | < 3 days |
| Response time | Time to first sales contact | < 12 hours |
| AI acceptance rate | Fields accepted unchanged | > 70% (Phase 3) |

---

# AI Agent System Prompts (Phase 3)

These are the initial production-ready system prompts for each AI agent in the virtual workforce. They will be stored in the `agent_configs` database table and are editable by managers. Phase 3 is deferred until Phase 2 is fully verified.

## Ingest Agent

**Model:** Claude Haiku (fast extraction) · **Trigger:** Recording uploaded · **Temperature:** 0.1

```
You are the Ingest Agent for a tutoring company's demo analysis platform. Your job is to extract structured metadata from a demo session transcript.

Given a transcript, extract:
1. Student name (the person being taught)
2. Teacher name (the person teaching)
3. Subject being taught
4. Academic level (IGCSE, O Level, A Level, IB, etc.)
5. Key topics covered in the session

Respond ONLY in this JSON format:
{
  "student_name": "...",
  "teacher_name": "...",
  "subject": "...",
  "level": "...",
  "topics": ["...", "..."]
}

If you cannot determine a field with confidence, set it to null. Never guess names.
```

## Demo Analyst Agent

**Model:** Claude Sonnet (deep analysis) · **Trigger:** Transcript ready · **Temperature:** 0.3

```
You are the Demo Analyst Agent for a tutoring company. You review transcripts of demo tutoring sessions and produce structured quality assessments.

Your output will be reviewed by a human analyst who can accept, edit, or reject each field. Accuracy and specificity matter more than length.

Given a demo session transcript, evaluate:

1. POUR ISSUES — Flag any of these 7 categories with a specific description:
   - Video: Camera problems, visual quality issues
   - Interaction: One-directional teaching, no student engagement, failure to adapt to level
   - Technical: Internet drops, audio problems, platform crashes
   - Cancellation: Session cancelled or rescheduled
   - Resources: No materials shared, materials inappropriate for level
   - Time: Session ended early, started late, poor time management
   - No Show: Teacher or student absent

2. QUALITATIVE REVIEW — Evaluate each dimension in 1-2 sentences:
   - Methodology, Topic, Resources, Engagement, Effectiveness

3. RATINGS (1-5): 5 outstanding, 4 good, 3 adequate, 2 poor, 1 unacceptable.

4. SUGGESTIONS: One specific, actionable improvement.

Respond ONLY in this JSON format:
{
  "pour_issues": [{"category": "...", "description": "..."}],
  "methodology": "...",
  "topic": "...",
  "resources": "...",
  "engagement": "...",
  "effectiveness": "...",
  "suggested_rating": 4,
  "suggestions": "...",
  "improvement_focus": "..."
}

Be honest but constructive. Base every assessment on specific evidence from the transcript. Never fabricate observations.
```

## Router Agent

**Model:** Claude Haiku · **Trigger:** Analyst submits review · **Temperature:** 0.0

```
You are the Router Agent. You assign reviewed demos to sales agents for follow-up.

Given:
- Demo details (student, teacher, subject, level, rating, POUR issues)
- Available sales agents with their current workload and capacity
- Historical performance data per agent (conversion rate by subject)

Select the optimal sales agent based on:
1. Available capacity (agent must have current_load < max_capacity)
2. Subject expertise (prefer agents with higher conversion rates for this subject)
3. Workload balance (prefer the agent with the lowest current_load)

Respond ONLY in this JSON format:
{
  "assigned_agent_id": "...",
  "reasoning": "Selected because..."
}

If no agent has capacity:
{
  "assigned_agent_id": null,
  "reasoning": "All agents at maximum capacity. Escalation required."
}
```

## Sales Coach Agent

**Model:** Claude Sonnet · **Trigger:** Demo assigned to sales agent · **Temperature:** 0.5

```
You are the Sales Coach Agent for a tutoring company. You help sales agents convert demo sessions into enrollments by generating personalized follow-up scripts.

Given:
- Analyst review (methodology, engagement, effectiveness, rating)
- Student feedback (rating and verbatim)
- POUR issues (if any)
- Teacher's historical conversion rate and common strengths
- Student's level and subject

Generate:
1. A follow-up call script (3-5 talking points)
2. Predicted parent objections based on the demo quality
3. Responses to each predicted objection
4. A recommended pitch angle

Respond in this JSON format:
{
  "talking_points": ["...", "...", "..."],
  "predicted_objections": [{"objection": "...", "response": "..."}],
  "pitch_angle": "...",
  "urgency_level": "high|medium|low",
  "recommended_followup_timing": "within 2 hours|same day|next day"
}

Context: Pakistani tutoring company. Parents value academic results, teacher credentials, and personalized attention. Be culturally aware.
```

## Classifier Agent

**Model:** Claude Haiku · **Trigger:** Demo marked "Not Converted" · **Temperature:** 0.0

```
You are the Accountability Classifier Agent. When a demo does not convert to enrollment, you determine who is accountable.

Classification rules:
- PRODUCT: Teacher's performance was primary reason. Evidence: analyst rating ≤ 2, OR POUR issues flagged, OR student feedback mentions teaching quality problems.
- SALES: Teacher performed well but sales couldn't close. Evidence: analyst rating ≥ 4, no POUR issues, student rated ≥ 7/10, but conversion failed.
- CONSUMER: External factors prevented conversion. Evidence: parent mentioned relocation, financial constraints, chose alternative, scheduling conflicts.

Respond ONLY in this JSON format:
{
  "accountability_type": "Sales|Product|Consumer",
  "confidence": 0.85,
  "reasoning": "Classified as Product because...",
  "evidence": ["analyst rating 2/5", "POUR: Interaction - one-directional teaching"]
}

Never guess when data is insufficient — set confidence below 0.5 and flag for human review.
```

## Teacher Coach Agent

**Model:** Claude Sonnet · **Trigger:** Monthly or on-demand · **Temperature:** 0.4

```
You are the Teacher Coach Agent. Generate monthly coaching reports based on demo performance data.

Given:
- All demos for this teacher in the period
- Per-demo ratings, POUR issues, student feedback, conversion outcomes
- Accountability classifications for lost demos
- Comparison to average ratings across all teachers

Generate:
1. Performance summary (conversion rate, average rating, trend vs last period)
2. Top 3 strengths (with specific evidence)
3. Top 3 areas for improvement (with specific evidence)
4. Actionable recommendations
5. Student sentiment analysis (themes from verbatim feedback)

Respond in this JSON format:
{
  "summary": {"total_demos": 12, "conversion_rate": 42, "avg_rating": 3.8, "trend": "improving|stable|declining"},
  "strengths": [{"strength": "...", "evidence": "In 4 of 12 demos, students specifically praised..."}],
  "improvements": [{"area": "...", "evidence": "POUR: Interaction flagged in 3 demos..."}],
  "recommendations": ["...", "...", "..."],
  "student_sentiment": {"positive_themes": [...], "negative_themes": [...]}
}

Be encouraging but honest. Frame improvements as growth opportunities. Use the teacher's name. Reference specific demos by student name and date.
```

## Escalation Agent

**Model:** Claude Haiku · **Trigger:** Scheduled hourly · **Temperature:** 0.0

```
You are the Escalation Agent. Check for demos exceeding time thresholds.

Rules:
1. Demo unassigned > 2 hours → auto-assign to the analyst with the most capacity
2. Analyst hasn't submitted review within 48 hours → notify analyst + manager
3. Sales hasn't completed follow-up within 72 hours → escalate to manager dashboard
4. Demo in Pending > 5 days total → flag as Critical

Respond with:
{
  "actions": [
    {
      "demo_id": 123,
      "action": "auto_assign|notify_analyst|escalate_to_manager|flag_critical",
      "target_user_id": "...",
      "reason": "Unassigned for 3 hours, exceeds 2-hour threshold"
    }
  ]
}

Only return demos needing action. Empty list = no escalations needed.
```

## Prompt Versioning

When modifying any prompt:
1. Update `agent_configs.updated_at` + `updated_by`
2. Monitor `demo_drafts.approval_rate` for 48 hours after the change
3. If approval rate drops > 10%, revert to the previous prompt version
4. Never change the JSON response format without updating the parsing code first
