#!/bin/bash
# Simulated /today output for demo GIF recording
# To re-record: pip install asciinema && brew install agg
#   asciinema rec docs/demo.cast --command "bash docs/demo-output.sh" --cols 92 --rows 46
#   agg --font-size 14 --speed 1 --theme monokai docs/demo.cast docs/demo.gif

set -e

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
MAGENTA='\033[35m'
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

# Simulate Claude Code startup
printf "${BOLD}${CYAN}>"
delay 0.3
type_slow " /today"
echo -e "${RESET}"
delay 0.8

printf "${DIM}● Reading SOUL.md, preferences.md, relationships.md...${RESET}"
delay 1.2
printf "\r${GREEN}✓${RESET} ${DIM}Knowledge files loaded${RESET}                              \n"
delay 0.3

printf "${DIM}● Fetching email, Slack, LINE, calendar in parallel...${RESET}"
delay 2.0
printf "\r${GREEN}✓${RESET} ${DIM}All channels fetched (4.2s)${RESET}                         \n"
delay 0.3

printf "${DIM}● Classifying messages...${RESET}"
delay 1.5
printf "\r${GREEN}✓${RESET} ${DIM}Classification complete${RESET}                              \n"
delay 0.5

echo ""

print_line "${BOLD}# Today's Briefing — Feb 18, 2026 (Tue)${RESET}"
echo ""
delay 0.3

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
delay 0.5

print_line "${BOLD}${CYAN}## Email${RESET}"
print_line "${GREEN}Skipped (8)${RESET} ${DIM}→ auto-archived${RESET}"
print_line "${DIM}  GitHub notifications (3), Stripe receipts (2), Slack digests (2), newsletter (1)${RESET}"
echo ""
delay 0.4

print_line "${RED}Action Required (2)${RESET}"
echo ""
delay 0.3

print_line "${BOLD}### 1. Sarah Chen ${DIM}<sarah@sequoia.com>${RESET}"
print_line "${DIM}Subject:${RESET} Re: Feb board deck — a few questions"
print_line "${DIM}Summary:${RESET} Asking for updated ARR numbers and Q1 hiring plan"
echo ""
print_line "${MAGENTA}Draft reply:${RESET}"
print_line "  Hi Sarah, thanks for flagging these. I'll have the updated"
print_line "  ARR slide and hiring plan to you by EOD Wednesday."
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.6

print_line "${BOLD}### 2. 松野陽子 ${DIM}<yoko@helixes.co>${RESET}"
print_line "${DIM}Subject:${RESET} 業務委託契約の更新について"
print_line "${DIM}Summary:${RESET} Current contract expires 3/31, asking to renew"
echo ""
print_line "${MAGENTA}Draft reply:${RESET}"
print_line "  松野様　お世話になっております。"
print_line "  契約更新の件、承知いたしました。同条件での更新で問題ございません。"
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.5

print_line "${BOLD}${CYAN}## LINE${RESET}"
print_line "${RED}Action Required (1)${RESET}"
echo ""
print_line "${BOLD}### 1. Ryo${RESET}"
print_line "${DIM}Last message:${RESET} 今日の店やっぱアフリにしない？19:30で予約した"
print_line "${DIM}Context:${RESET} College friend, dinner tonight"
echo ""
print_line "${MAGENTA}Draft reply:${RESET} おー最高👍 19:30了解！"
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.5

print_line "${BOLD}${CYAN}## Slack${RESET}"
print_line "${RED}Action Required (1)${RESET}"
echo ""
print_line "${BOLD}### 1. #product-dev — @you by Kenji${RESET}"
print_line "${DIM}Message:${RESET} Can you review the Figma before our 1:1?"
print_line "${DIM}Context:${RESET} Design review for v2 onboarding flow"
echo ""
print_line "${MAGENTA}Draft reply:${RESET} Will take a look before 1pm 👀"
echo ""
print_line "  ${BOLD}[Send]${RESET}  ${DIM}[Edit]  [Skip]${RESET}"
echo ""
delay 0.5

print_line "${BOLD}${CYAN}## Triage Queue${RESET}"
print_line "  ${YELLOW}●${RESET} Stale pending responses: ${BOLD}2${RESET}"
print_line "  ${YELLOW}●${RESET} Overdue tasks: ${BOLD}1${RESET}"
print_line "  ${GREEN}→ All items decided${RESET}"
echo ""
delay 0.3

print_line "${DIM}────────────────────────────────────────────${RESET}"
print_line "${GREEN}✓${RESET} Briefing complete. ${BOLD}4 items${RESET} need your decision."
delay 2
