#!/usr/bin/env bash
set -euo pipefail

COMMIT=$(git rev-parse HEAD)
POLL_INTERVAL=50  # in ticks (50 * 0.1s = 5s)
SPINNER=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
RESET=$'\033[0m'
GREEN=$'\033[32m'
RED=$'\033[31m'
DIM=$'\033[2m'
UP1=$'\033[1A'
UP2=$'\033[2A'
CLR=$'\033[K'

ci="" build="" frame=0

poll() {
  local raw
  raw=$(gh run list --commit "$COMMIT" --json workflowName,status,conclusion 2>/dev/null || echo "[]")
  ci=$(echo "$raw" | jq -r '.[] | select(.workflowName == "CI") | .status + "/" + (.conclusion // "")' 2>/dev/null || echo "")
  build=$(echo "$raw" | jq -r '.[] | select(.workflowName == "Build & Push") | .status + "/" + (.conclusion // "")' 2>/dev/null || echo "")
}

render_line() {
  local name=$1 raw=$2
  if [[ -z "$raw" ]]; then
    printf "  ${DIM}?${RESET} %s ${DIM}(not found)${RESET}" "$name"
  elif [[ "$raw" == completed/success ]]; then
    printf "  ${GREEN}✓${RESET} %s" "$name"
  elif [[ "$raw" == completed/* ]]; then
    printf "  ${RED}✗${RESET} %s ${RED}(%s)${RESET}" "$name" "${raw#completed/}"
  else
    printf "  %s %s" "${SPINNER[$frame]}" "$name"
  fi
}

render() {
  printf "${UP2}${CLR}"
  render_line "CI" "$ci"
  printf "\n${CLR}"
  render_line "Build & Push" "$build"
  printf "\n"
}

tick() {
  frame=$(( (frame + 1) % ${#SPINNER[@]} ))
  sleep 0.1
}

# Loading phase
printf "\n"
while true; do
  printf "${UP1}${CLR}  %s Loading...\n" "${SPINNER[$frame]}"
  poll
  [[ -n "$ci" || -n "$build" ]] && break
  tick
done

# Status phase
printf "${UP1}${CLR}\n\n"
while true; do
  render

  [[ "${ci:-pending/}" == completed/* && "${build:-pending/}" == completed/* ]] && break

  for (( i=0; i<POLL_INTERVAL; i++ )); do
    tick
    render
  done
  poll
done
