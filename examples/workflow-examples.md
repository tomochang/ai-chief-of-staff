# Workflow Examples — How the Files Work Together

Real scenarios showing how `SOUL.md`, `relationships.md`, `preferences.md`, and `todo.md` combine to make your AI actually useful.

---

## Workflow 1: Incoming Email → Reply Draft

**Scenario:** You receive an email from Kenji Tanaka (Sumitomo Banking) asking to reschedule the 2/25 dev meeting to 2/27.

### Without context files:

```
You: "Draft a reply to this email agreeing to reschedule"

AI: "Dear Mr. Tanaka,
     Thank you for your email. I would be happy to reschedule
     our meeting to February 27th. Please let me know if there
     is anything else I can help with.
     Best regards, [Your Name]"
```

Generic. Wrong tone. Missing critical details.

### With context files:

```
AI reads:
  → relationships.md: Tanaka = formal Japanese (敬語), CC secretary Yamada Akiko
  → preferences.md: Check calendar for 2/27 conflicts, add 1hr travel buffer (Otemachi)
  → todo.md: Update the 2/25 entry, check if 3/5 three-way meeting is affected
  → SOUL.md: Sign with family name only

AI: "田中様

     いつもお世話になっております。
     2/27への変更、承知いたしました。
     14:00〜15:00、大手町タワー2614会議室で
     お変わりなければ、そちらで確定させていただきます。

     YOUR_SIGNATURE"

  + CC: a.yamada@sumitomo-bc.co.jp
  + Calendar: Moved event to 2/27, travel buffer added
  + todo.md: Updated meeting date
  + Flagged: "3/5 three-way meeting may need adjustment — confirm with Sarah Chen"
```

**Files used:** relationships.md (tone, CC, room number) → preferences.md (travel buffer, calendar rules) → todo.md (schedule update) → SOUL.md (signature)

---

## Workflow 2: Scheduling Request → Multi-Party Coordination

**Scenario:** You say "Set up a dinner with Tanaka-san and someone from Nomura next month. Nakamura from Nomura is joining too."

### Without context files:

```
AI: "When would you like to schedule the dinner?
     Where would you like to go?
     How many people?
     Should I send the invitations?"
```

Four questions before anything happens.

### With context files:

```
AI reads:
  → relationships.md: Tanaka → CC secretary Yamada, formal Japanese
  → relationships.md: Nakamura (Nomura) → check for assistant info
  → preferences.md: Business dinner budget ¥10k-20k/person, Otemachi/Marunouchi/Ginza,
                     private room for 4+, Japanese or French
  → todo.md: Already has 3/16 dinner with Tanaka + Nakamura marked
  → preferences.md: Propose best option, don't ask "what do you want"

AI: "The 3/16 dinner is already confirmed with Tanaka and Nakamura (+ assistants, ~4-5 people).
     I need to book the restaurant. Here's my recommendation:

     🏆 Sushi Kanesaka (Ginza) — private room available, ¥18,000 course,
        5 min walk from Ginza station. Excellent for banking clients.

     Want me to make the reservation and email Yamada-san (Tanaka's secretary)
     with the details?"
```

**Files used:** relationships.md (people, assistants) → preferences.md (budget, area, style) → todo.md (existing plans) → SOUL.md (decision-making style: propose, don't ask)

---

## Workflow 3: Business Dinner Arrangement

**Scenario:** "Book a restaurant for the 3/16 dinner with Tanaka and Nakamura."

### Without context files:

```
AI: "What cuisine do you prefer?
     What's your budget?
     What area?
     How many people?
     Any dietary restrictions?"
```

### With context files:

```
AI reads:
  → todo.md: 3/16 18:30~, Tanaka + Nakamura + assistants = ~4-5 people
  → preferences.md: Budget ¥10k-20k, Otemachi/Marunouchi area, private room, quiet
  → relationships.md: No dietary restrictions noted for Tanaka or Nakamura
  → preferences.md: Japanese or French preferred for banking contacts

AI: "For the 3/16 dinner (4-5 people, 18:30~, Otemachi area):

     1. 🏆 Tempura Kondo (Marunouchi) — ¥15,000 course, private room,
        8 min walk from Otemachi station
     2. Ristorante ASO (Marunouchi) — ¥18,000, Italian, private room,
        quieter atmosphere

     No dietary restrictions on file for Tanaka or Nakamura.
     Shall I book #1 and send details to Yamada-san?"

After approval:
  → Reservation made
  → Email to Yamada (Tanaka's secretary) with restaurant details
  → todo.md: Updated with restaurant name
  → Calendar: Event updated with location
```

**Files used:** todo.md (date, headcount) → preferences.md (budget, area, cuisine) → relationships.md (dietary info, secretary for logistics) → SOUL.md (propose best, don't over-ask)

---

## Workflow 4: Proactive Heartbeat Check

**Scenario:** Your AI runs a scheduled heartbeat check at 9:00 AM.

```
AI checks:
  → Email: 3 new messages overnight
    - Newsletter from TechCrunch → auto-archive (preferences.md: archive routine notifications)
    - Reply from Sarah Chen confirming 3/5 meeting → 🔴 update todo.md, notify user
    - Cold outreach from recruiter → low priority (preferences.md: respond within 1 week)

  → Calendar: Today's schedule
    - 15:00 Card issuing kickoff with Sarah Chen (todo.md: confirmed)
    - Prep needed? Check relationships.md: Sarah prefers data-driven, bullet points

  → todo.md: Overdue items?
    - 🔴 "Reply to B Dash Cup invite" — still pending, flag to user

  → Waiting On: Any updates?
    - "CFO candidate intro" from Michael Torres (since 2/5) — 2 weeks, consider nudge

AI message to user:
  "Good morning. Quick update:
   ✅ Sarah confirmed the 3/5 meeting — calendar updated
   📋 Today: 15:00 kickoff with Sarah (Zoom). She'll want metrics — prep the Q1 numbers
   ⚠️ B Dash Cup golf invite still needs your reply
   💡 Michael's CFO intro has been pending 2 weeks — want me to follow up?"
```

**Files used:** All files working together — preferences (auto-archive rules) → todo (deadlines, waiting-on) → relationships (meeting prep context) → SOUL (communication style for the morning briefing)

---

## Key Takeaway

Each file alone is useful. Together, they eliminate the back-and-forth that makes AI assistants frustrating. The AI stops asking questions and starts proposing answers.

| File | What it eliminates |
|---|---|
| SOUL.md | "How should I phrase this?" |
| relationships.md | "Who is this person? What tone? Who to CC?" |
| preferences.md | "What time? What budget? What area?" |
| todo.md | "What's the current status? What's already been done?" |
