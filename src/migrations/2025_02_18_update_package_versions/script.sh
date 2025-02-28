#!/bin/bash
set -e

echo "Using branch: $(git branch --show-current)"

node "$(dirname "$0")/script.js"

echo "Updating package-lock.json via npm install"
#npm install
