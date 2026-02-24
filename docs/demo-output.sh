#!/bin/bash
# Simulated /today output for demo GIF recording
# To re-record: pip install asciinema && brew install agg
#   asciinema rec docs/demo.cast --command "bash docs/demo-output.sh" --cols 92 --rows 50
#   agg --font-size 14 --speed 1 --theme monokai docs/demo.cast docs/demo.gif

set -e

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
MAGENTA='\033[35m'
WHITE='\033[97m'
RESET='\033[0m'

delay() { sleep "$1"; }

type_slow() {
  local text="$1"
  for ((i=0; i<${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep 0.04
  done
}

print_line() {
  echo -e "$1"
  delay 0.03
}

# ═══════════════════════════════════════════════════════════════════════
# Part 1: Fetch + Classify
# ═══════════════════════════════════════════════════════════════════════

printf "${BOLD}${CYAN}>"
delay 0.3
type_slow " /today"
echo -e "${RESET}"
delay 0.6

printf "${DIM}● Reading SOUL.md, preferences.md, relationships.md...${RESET}"
delay 0.8
printf "\r${GREEN}✓${RESET} ${DIM}Knowledge files loaded${RESET}                              \n"
delay 0.2

printf "${DIM}● Fetching email, Slack, LINE, Messenger, Chatwork, calendar...${RESET}"
delay 1.5
printf "\r${GREEN}✓${RESET} ${DIM}6 channels fetched in parallel (3.8s)${RESET}               \n"
delay 0.2

printf "${DIM}● Classifying 47 messages...${RESET}"
delay 1.0
printf "\r${GREEN}✓${RESET} ${DIM}Classified: 8 skip, 3 info, 6 action_required${RESET}       \n"
delay 0.4

echo ""

# ═══════════════════════════════════════════════════════════════════════
# Part 2: Briefing
# ═══════════════════════════════════════════════════════════════════════

print_line "${BOLD}# Today's Briefing — Feb 18, 2026 (Tue)${RESET}"
echo ""
delay 0.2

# --- Schedule ---
print_line "${BOLD}${CYAN}## Schedule (4)${RESET}"
print_line "${DIM}┌─────────────┬────────────────────────────────┬───────────────────┬───────┐${RESET}"
print_line "${DIM}│${RESET} Time        ${DIM}│${RESET} Event                          ${DIM}│${RESET} Location          ${DIM}│${RESET} Prep  ${DIM}│${RESET}"
print_line "${DIM}├─────────────┼────────────────────────────────┼───────────────────┼───────┤${RESET}"
print_line "${DIM}│${RESET} 10:00-11:00 ${DIM}│${RESET} Weekly product sync            ${DIM}│${RESET} Zoom              ${DIM}│${RESET}       ${DIM}│${RESET}"
print_line "${DIM}│${RESET} 13:00-14:00 ${DIM}│${RESET} 1:1 with Kenji (design review) ${DIM}│${RESET} Office 3F         ${DIM}│${RESET}       ${DIM}│${RESET}"
print_line "${DIM}│${RESET} 15:00-16:00 ${DIM}│${RESET} Sequoia partner call           ${DIM}│${RESET} Google Meet       ${DIM}│${RESET} ${YELLOW}⚠️${RESET}     ${DIM}│${RESET}"
print_line "${DIM}│${RESET} 19:30-      ${DIM}│${RESET} Dinner with Ryo @Ebisu         ${DIM}│${RESET} Afuri (ramen)     ${DIM}│${RESET}       ${DIM}│${RESET}"
print_line "${DIM}└─────────────┴────────────────────────────────┴───────────────────┴───────┘${RESET}"
echo ""
delay 0.4

# --- Email ---
print_line "${BOLD}${CYAN}## Email${RESET}"
print_line "${GREEN}Skipped (8)${RESET} ${DIM}→ auto-archived${RESET}"
print_line "${DIM}  GitHub (3), Stripe receipts (2), Slack digests (2), newsletter (1)${RESET}"
echo ""
delay 0.3

print_line "${RED}Action Required (2)${RESET}"
echo ""

print_line "${BOLD}### 1. Sarah Chen ${DIM}<sarah@sequoia.com>${RESET}"
print_line "${DIM}Subject:${RESET} Re: Feb board deck — a few questions"
print_line "${DIM}Summary:${RESET} Asking for updated ARR numbers and Q1 hiring plan"
echo ""
print_line "${MAGENTA}Draft reply:${RESET}"
print_line "  Hi Sarah, thanks for flagging these. I'll have the updated"
print_line "  ARR slide and hiring plan to you by EOD Wednesday."
echo ""
print_line "  ${BOLD}${WHITE}▸ [Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.4

print_line "${BOLD}### 2. David Park ${DIM}<david@partnercorp.com>${RESET}"
print_line "${DIM}Subject:${RESET} Re: Contractor agreement renewal"
print_line "${DIM}Summary:${RESET} Current agreement expires 3/31, asking to renew on same terms"
echo ""
print_line "${MAGENTA}Draft reply:${RESET}"
print_line "  Hi David, thanks for reaching out. Happy to renew on the same"
print_line "  terms. I'll have the paperwork sent over by Friday."
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.3

# --- Slack ---
print_line "${BOLD}${CYAN}## Slack${RESET}"
print_line "${RED}Action Required (1)${RESET}"
echo ""
print_line "${BOLD}### 1. #product-dev — @you by Kenji${RESET}"
print_line "${DIM}Message:${RESET} Can you review the Figma before our 1:1?"
print_line "${DIM}Context:${RESET} Design review for v2 onboarding flow"
print_line "${MAGENTA}Draft reply:${RESET} Will take a look before 1pm 👀"
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.3

# --- LINE ---
print_line "${BOLD}${CYAN}## LINE${RESET}"
print_line "${RED}Action Required (1)${RESET}"
echo ""
print_line "${BOLD}### 1. Ryo${RESET}"
print_line "${DIM}Last message:${RESET} Yo, changed the spot to Afuri — booked 7:30pm"
print_line "${DIM}Context:${RESET} College friend, dinner tonight"
print_line "${MAGENTA}Draft reply:${RESET} Nice 👍 7:30 works. See you there"
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.3

# --- Messenger ---
print_line "${BOLD}${CYAN}## Messenger${RESET}"
print_line "${RED}Action Required (1)${RESET}"
echo ""
print_line "${BOLD}### 1. Mike Davis${RESET}"
print_line "${DIM}Last message:${RESET} Hey, are we still on for Friday? Let me know the spot."
print_line "${DIM}Context:${RESET} Ex-colleague, quarterly catch-up"
print_line "${MAGENTA}Draft reply:${RESET} Yep! How about 7pm at the new izakaya in Daikanyama?"
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.3

# --- Chatwork ---
print_line "${BOLD}${CYAN}## Chatwork${RESET}"
print_line "${RED}Action Required (1)${RESET}"
echo ""
print_line "${BOLD}### 1. 田中部長 — 営業定例${RESET}"
print_line "${DIM}Message:${RESET} [To:あなた] 来週の定例、議題を追加お願いします"
print_line "${DIM}Context:${RESET} Weekly sales meeting, agenda due Thursday"
print_line "${MAGENTA}Draft reply:${RESET} 承知しました。木曜までに追加します。"
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.3

# --- Triage Queue ---
print_line "${BOLD}${CYAN}## Triage Queue${RESET}"
print_line "  ${YELLOW}●${RESET} Stale pending responses: ${BOLD}2${RESET}"
print_line "  ${YELLOW}●${RESET} Overdue tasks: ${BOLD}1${RESET}"
print_line "  ${GREEN}→${RESET} All items decided"
echo ""
delay 0.2

print_line "${DIM}────────────────────────────────────────────────────────────────${RESET}"
print_line "${GREEN}✓${RESET} Briefing complete. ${BOLD}6 items${RESET} need your decision."
echo ""
delay 1.0

# ═══════════════════════════════════════════════════════════════════════
# Part 3: Send + Post-send hook (★ key feature demo)
# ═══════════════════════════════════════════════════════════════════════

print_line "${DIM}User selected ${BOLD}[Send]${RESET}${DIM} for Sarah Chen${RESET}"
delay 0.5

printf "${DIM}● Sending reply to Sarah Chen...${RESET}"
delay 0.6
printf "\r${GREEN}✅ Email sent${RESET}                                                \n"
delay 0.3

echo ""
print_line "${CYAN}⏳ Post-send hook triggered${RESET}"
delay 0.4

printf "   ${DIM}Calendar...${RESET}"
delay 0.4
printf "\r   ${GREEN}✅${RESET} Calendar — tentative block: ${DIM}\"Prepare board deck\" (Wed 14:00)${RESET}\n"
delay 0.4

printf "   ${DIM}Relationships...${RESET}"
delay 0.4
printf "\r   ${GREEN}✅${RESET} Relationships — updated: ${DIM}Sarah Chen → \"2/18 replied re: board deck\"${RESET}\n"
delay 0.4

printf "   ${DIM}Todo...${RESET}"
delay 0.4
printf "\r   ${GREEN}✅${RESET} Todo — added: ${DIM}\"ARR slide + hiring plan → Wed EOD\"${RESET}              \n"
delay 0.4

printf "   ${DIM}Pending...${RESET}"
delay 0.4
printf "\r   ${GREEN}✅${RESET} Pending — follow-up deadline set: ${DIM}Feb 20${RESET}                       \n"
delay 0.4

printf "   ${DIM}Git...${RESET}"
delay 0.4
printf "\r   ${GREEN}✅${RESET} Git — committed & pushed                                        \n"
delay 0.4

printf "   ${DIM}Archive...${RESET}"
delay 0.4
printf "\r   ${GREEN}✅${RESET} Email — thread archived                                         \n"
delay 0.3

echo ""
print_line "${GREEN}✓${RESET} All post-send tasks complete. ${DIM}Moving to next item →${RESET}"

# ═══════════════════════════════════════════════════════════════════════
# Part 4: Closing
# ═══════════════════════════════════════════════════════════════════════

echo ""
delay 0.5

print_line "${DIM}────────────────────────────────────────────────────────────────${RESET}"
print_line "${BOLD}💡 Hooks ensure nothing falls through the cracks${RESET}"
print_line "${DIM}   Every send triggers calendar, relationships, todo, and git${RESET}"
print_line "${DIM}   updates automatically — no manual follow-up needed.${RESET}"
delay 2.5
