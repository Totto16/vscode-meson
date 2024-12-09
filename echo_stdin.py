#!/usr/bin/env python3


from pathlib import Path
import sys

array = ["-", "/dev/stdin", "/dev/fd/0", "/proc/self/fd/0"]

# print(sys.stdin.read())

for src in array:
    src_file = Path(src)

    try:
        print(src_file)
        code = src_file.read_text(encoding="utf-8")
    except IOError as e:
        print(f"Unable to read from {src_file}: {e}")
