#!/bin/bash

# Update package.json using npm-check-updates
npx npm-check-updates -f "/^@aurodesignsystem/.*$/" -u --install always

# Run build
npm run build:version
npm run build

# Run tests
npm run test