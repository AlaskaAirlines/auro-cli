#!/bin/bash
set -e

echo "Using branch: $(git branch --show-current)"

if grep -q "@alaskaairux/icons" package.json; then
  echo "Updating @alaskaairux/icons to ^5.0.0"
  # check if the dependency is in peerDependencies or devDependencies
  if jq -e '.peerDependencies | has("@alaskaairux/icons")' package.json > /dev/null; then
    jq '.peerDependencies["@alaskaairux/icons"] = "^5.0.0"' package.json > package.tmp.json && mv package.tmp.json package.json
  fi

  if jq -e '.devDependencies | has("@alaskaairux/icons")' package.json > /dev/null; then
    jq '.devDependencies["@alaskaairux/icons"] = "^5.0.0"' package.json > package.tmp.json && mv package.tmp.json package.json
  fi

  if jq -e '.dependencies | has("@alaskaairux/icons")' package.json > /dev/null; then
    jq '.dependencies["@alaskaairux/icons"] = "^5.0.0"' package.json > package.tmp.json && mv package.tmp.json package.json
  fi
fi

echo "Updating package-lock.json via npm install"
npm install
