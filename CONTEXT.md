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
