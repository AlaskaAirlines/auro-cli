#!/bin/bash

node "$(dirname "$0")/migration.js"

npx npm-check-updates -f "/^@aurodesignsystem/auro-config$/" -u --install always
