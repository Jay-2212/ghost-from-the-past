#!/bin/bash
# usage: run-review.sh <grok|agy> <outname> <prompt>
export HOME=/workspace/kirohome PATH=/workspace/kirohome/.local/bin:$PATH
cd /workspace/work/ghost-from-the-past
T=$1; O=$2; P="$3 (Review only: read files, do NOT modify files or run shell commands.)"
if [ "$T" = grok ]; then
  timeout 1500 grok -p "$P" --permission-mode plan --output-format plain > docs/reviews/$O.md 2>&1
else
  NP="googleapis.com,.googleapis.com,google.com,.google.com,antigravity.google,.antigravity.google"
  export NO_PROXY=$NP no_proxy=$NP
  timeout 1200 agy -p "$P" --print-timeout 900s > docs/reviews/$O.md 2>&1
fi
echo "EXIT $?" >> docs/reviews/$O.md
