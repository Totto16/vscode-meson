#!/usr/bin/env bash

#ARR=("-" "/dev/stdin" "/dev/fd/0" "/proc/self/fd/0")
ARR=()

ls -l "/proc/self/fd"

for FILE in "${ARR[@]}"; do
  echo -n "$FILE: "
  if [ -e "$FILE" ] || [ "$FILE" = "-" ]; then
    cat "$FILE"
  else
    echo "NOT FOUND"
  fi
done
