# Plan: Add Task Triage System to /today

## Context

PR #4 on ai-chief-of-staff proposes a task triage system for `/today`. After review, we're partially adopting it — keeping the good parts, dropping Google Tasks hard dependency, and integrating Meeting Prep into the briefing table instead of a separate step.

**Adopted features:**
1. Pending Response tracking (from todo.md)
2. Stale/Critical classification (external >7d = no [Wait])
3. Follow-up draft generation (triage → Step 4)
4. Meeting Prep as `Prep needed?` column in Schedule table
5. Zero undecided principle

**Not adopted:**
- Briefing simplification (current detailed format works fine)
- Focus Question (too heavy for daily use)
- Google Tasks as hard requirement (conditional instead)

## File to modify

`output/ai-chief-of-staff/commands/today.md` (current main branch, already templatized)

## Changes

### 1. Overview — add triage mention
Line 23: Add "triage pending responses and tasks" to description. Add "Zero undecided items" goal.

### 2. Task 3 — expand Calendar + Todo
Expand current Task 3 (lines 78-86) to include:
- **3a**: Calendar events (unchanged)
- **3b**: Google Tasks (conditional) — try `YOUR_TASK_LIST_COMMAND`, if available fetch overdue + today + tomorrow. If not available, skip gracefully.
- **3c**: Pending Response analysis — parse todo.md's Pending Response table, calculate days elapsed, classify as critical (>7d) / stale (>3d) / fresh (≤3d). External vs internal based on `YOUR_WORK_DOMAIN`.

### 3. Step 2 briefing — add Prep column + Triage Queue summary
- Schedule table: add `Prep needed?` column. Routine meetings = `—`, non-routine = `⚠️`. If ⚠️, ask user "What do you need to prepare?" inline. Add as task if they answer.
- After Todo section, add `Triage Queue` summary showing counts (stale/critical pending N, overdue tasks N, today's tasks N). This is a preview — details in Step 3.

### 4. New Step 3: Task Triage (insert between current Step 2 and Step 3)
Renumber: current Step 3 → Step 4, current Step 4 → Step 5.

**Step 3: Task Triage**
- 3.0: Build merged triage list (Google Tasks overdue+today if available, Pending Response stale+critical, meeting prep tasks)
- 3.1: Stale Pending Response (>3d) — external critical >7d: [Follow up] / [Resolved] only. Others: [Follow up] / [Wait → deadline] / [Resolved].
- 3.2: Overdue tasks (Google Tasks if available, else todo.md overdue items) — [Do today] / [Reschedule] / [Done]
- 3.3: Today's tasks — [OK] / [Reschedule] / [Done]
- 3.4: Triage complete — "N/N items decided. 0 undecided. M follow-up drafts for Step 4."

### 5. Step 4 (was Step 3): Process action_required + follow-ups
- Add follow-up drafts from triage as a second queue
- Add "Follow-up replies" subsection under 4.4 Generate reply drafts

### 6. Step 5 (was Step 4): Post-send processing
- Add Pending Response updates: follow-up sent → update Date Sent, [Resolved] → remove row, [Wait] → set Wait until date

### 7. New placeholder
- `YOUR_WORK_DOMAIN` — for external/internal email classification
- `YOUR_TASK_LIST_COMMAND` — for Google Tasks or equivalent (optional)

## Verification
- Read the final today.md to confirm structure flows: Step 1 (fetch) → Step 2 (briefing + prep) → Step 3 (triage) → Step 4 (replies + follow-ups) → Step 5 (post-send)
- Confirm Google Tasks sections are conditional (graceful skip if not configured)
- Confirm no personal info leaks
- Commit to ai-chief-of-staff repo and push
- Close PR #4 with comment explaining partial adoption
