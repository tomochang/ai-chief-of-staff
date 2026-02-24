# Trigger Words -> Workflows

When the following trigger patterns are detected, read the corresponding section in **`WORKFLOWS.md`** and execute:

| Trigger | Workflow | WORKFLOWS.md Section |
| ------- | -------- | -------------------- |
| "I want to automate this", "This is tedious every time", etc. | Automation proposal | Automation Proposal Workflow |
| "Dinner with X", "Find a restaurant", etc. | Restaurant booking | Restaurant Booking Assistant |
| When drafting a reply | Reply drafting | Reply Drafting Workflow |
| When drafting a scheduling reply | Schedule coordination | Schedule Reply Workflow |
| When registering a calendar event | Calendar registration | Calendar Registration Workflow |

## How to Customize

Add your own trigger-workflow mappings to this table. Each trigger should:
1. Match a natural language pattern the user commonly says
2. Map to a named workflow defined in `WORKFLOWS.md`
3. Be specific enough to avoid false matches but broad enough to catch variations

## Example Custom Triggers

| Trigger | Workflow | WORKFLOWS.md Section |
| ------- | -------- | -------------------- |
| "Summarize this thread", "TLDR", etc. | Thread summary | Thread Summary Workflow |
| "Follow up on X", "Remind me about X", etc. | Follow-up tracking | Follow-up Workflow |
| "Draft an email to X", etc. | Email drafting | Email Draft Workflow |
