#!/bin/bash
# usage: run-kiro.sh <name> <model> <promptfile>
export HOME=/workspace/kirohome PATH=/workspace/kirohome/.local/bin:$PATH
cd /workspace/work/ghost-from-the-past
N=$1; M=$2; P=$3
kiro-cli chat --no-interactive --trust-all-tools --model "$M" "$(cat "$P")" > docs/kiro-logs/$N.log 2>&1
echo "EXIT $?" >> docs/kiro-logs/$N.log
