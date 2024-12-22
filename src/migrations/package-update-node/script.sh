#!/bin/bash

auro sync
node "$(dirname "$0")/migration.js"
npm install
