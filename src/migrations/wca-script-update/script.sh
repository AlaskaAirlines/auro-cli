#!/bin/bash

auro wca-setup
node "$(dirname "$0")/migration.js"
npm install
npm run build:api
npm run build:docs
npm run build

