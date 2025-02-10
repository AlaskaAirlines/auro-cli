#!/bin/bash
set -e

echo "Using branch: $(git branch --show-current)"

# If @aurodesignsystem/webcorestylesheets is present in the package.json, update to ^6.0.1
if grep -q "@aurodesignsystem/webcorestylesheets" package.json; then
  echo "Updating @aurodesignsystem/webcorestylesheets to ^6.0.1"
  # check if the dependency is in peerDependencies or devDependencies
  if jq -e '.peerDependencies | has("@aurodesignsystem/webcorestylesheets")' package.json > /dev/null; then
    jq '.peerDependencies["@aurodesignsystem/webcorestylesheets"] = "^6.0.1"' package.json > package.tmp.json && mv package.tmp.json package.json
  fi

  if jq -e '.devDependencies | has("@aurodesignsystem/webcorestylesheets")' package.json > /dev/null; then
    jq '.devDependencies["@aurodesignsystem/webcorestylesheets"] = "^6.0.1"' package.json > package.tmp.json && mv package.tmp.json package.json
  fi
fi

# If auro-icon is present in the package.json, update to ^6.1.8
if grep -q "@aurodesignsystem/auro-icon" package.json; then
  echo "Updating @aurodesignsystem/auro-icon to ^6.1.8"
  # check if the dependency is in dependencies or peerDependencies
  if jq -e '.dependencies | has("@aurodesignsystem/auro-icon")' package.json > /dev/null; then
    jq '.dependencies["@aurodesignsystem/auro-icon"] = "^6.1.8"' package.json > package.tmp.json && mv package.tmp.json package.json
  fi

  if jq -e '.peerDependencies | has("@aurodesignsystem/auro-icon")' package.json > /dev/null; then
    jq '.peerDependencies["@aurodesignsystem/auro-icon"] = "^6.1.8"' package.json > package.tmp.json && mv package.tmp.json package.json
  fi
fi

echo "Updating package-lock.json via npm install"
npm install
