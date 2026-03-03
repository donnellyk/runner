#!/usr/bin/env bash
set -euo pipefail

COMMIT=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
SPINNER=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
RESET="\033[0m"
GREEN="\033[32m"
RED="\033[31m"
DIM="\033[2m"

get_status() {
  gh run list --commit "$COMMIT" --json workflowName,status,conclusion \
    --jq ".[] | select(.workflowName == \"$1\") | .status + \"/\" + (.conclusion // \"\")"
}

render_line() {
  local name=$1 raw=$2 frame=$3
  if [[ -z "$raw" ]]; then
    printf "  ${DIM}?${RESET} %s ${DIM}(not found)${RESET}" "$name"
  elif [[ "$raw" == completed/success ]]; then
    printf "  ${GREEN}✓${RESET} %s" "$name"
  elif [[ "$raw" == completed/* ]]; then
    local conclusion=${raw#completed/}
    printf "  ${RED}✗${RESET} %s ${RED}(%s)${RESET}" "$name" "$conclusion"
  else
    printf "  %s %s" "${SPINNER[$frame]}" "$name"
  fi
}

printf "\n"

frame=0
loading=true
while $loading; do
  printf "\033[1A\033[K"
  printf "  %s Loading..." "${SPINNER[$frame]}"
  printf "\n"

  ci=$(get_status "CI")
  build=$(get_status "Build & Push")

  if [[ -n "$ci" || -n "$build" ]]; then
    loading=false
    printf "\033[1A\033[K\n"
  else
    frame=$(( (frame + 1) % ${#SPINNER[@]} ))
    sleep 0.5
  fi
done

printf "\n"
while true; do
  ci=$(get_status "CI")
  build=$(get_status "Build & Push")

  # Move up 2 lines, clear them
  printf "\033[2A\033[K"
  render_line "CI" "$ci" "$frame"
  printf "\n\033[K"
  render_line "Build & Push" "$build" "$frame"
  printf "\n"

  # Exit if both are done
  if [[ "${ci:-pending/}" == completed/* && "${build:-pending/}" == completed/* ]]; then
    break
  fi

  frame=$(( (frame + 1) % ${#SPINNER[@]} ))
  sleep 0.5
done
