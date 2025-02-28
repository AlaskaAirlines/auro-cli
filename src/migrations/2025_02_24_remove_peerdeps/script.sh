#!/bin/bash
set -e

echo "Using branch: $(git branch --show-current)"

# peerDeps to remove:
RELEVANT_DEPS=(
  "@alaskaairux/icons"
  "@aurodesignsystem/webcorestylesheets"
  "@aurodesignsystem/design-tokens"
)

if grep -q "peerDependencies" package.json; then
  echo "Removing requested peerDependencies"

  # use jq to remove the peerDeps
  for i in "${RELEVANT_DEPS[@]}"
  do
    echo "Moving $i from peerDependencies to normal dependencies"
    if jq -e --arg key "$i" '.peerDependencies | has($key)' package.json > /dev/null; then
      current_version=$(jq -r --arg key "$i" '.peerDependencies[$key]' package.json)

      # add the peerDep to the dependencies object
      jq --arg key "$i" --arg value "$current_version" '.dependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
      jq --arg key "$i" 'del(.peerDependencies[$key])' package.json > package.tmp.json && mv package.tmp.json package.json

      # if also in devDependencies, remove it since we're making it a true dependency
      if jq -e --arg key "$i" '.devDependencies | has($key)' package.json > /dev/null; then
        jq --arg key "$i"  'del(.devDependencies[$key])' package.json > package.tmp.json && mv package.tmp.json package.json
      fi
    fi
  done

  # if the peerDeps object is empty now, remove the peerDependencies key
  if jq -e '.peerDependencies | length == 0' package.json > /dev/null; then
    jq "del(.peerDependencies)" package.json > package.tmp.json && mv package.tmp.json package.json
  fi
fi

# if peerDeps still in package.json, print it so we can see what's left
if grep -q "peerDependencies" package.json; then
  echo "Remaining peerDependencies:"
  jq '.peerDependencies' package.json
fi

echo "Updating package-lock.json via npm install"
npm install

echo "Building the project"
npm run build
