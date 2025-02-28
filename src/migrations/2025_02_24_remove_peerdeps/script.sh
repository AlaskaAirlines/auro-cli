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

# TOP LEVEL UPDATES
# ========================================

# set design-tokens version to 5.0.2 (no carat)
if jq -e --arg key "@aurodesignsystem/design-tokens" '.dependencies | has($key)' package.json > /dev/null; then
  jq --arg key "@aurodesignsystem/design-tokens" --arg value "5.0.2" '.dependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
fi

# set @alaskaairux/icons version to 5.2.0 (no carat)
if jq -e --arg key "@alaskaairux/icons" '.dependencies | has($key)' package.json > /dev/null; then
  jq --arg key "@alaskaairux/icons" --arg value "5.2.0" '.dependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
fi

# set @aurodesignsystem/webcorestylesheets version to 6.0.2 (no carat)
if jq -e --arg key "@aurodesignsystem/webcorestylesheets" '.dependencies | has($key)' package.json > /dev/null; then
  jq --arg key "@aurodesignsystem/webcorestylesheets" --arg value "6.1.0" '.dependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
fi

# BATCH 1 UPDATES
# ========================================

# install latest version of eslint-config
if jq -e --arg key "@aurodesignsystem/eslint-config" '.devDependencies | has($key)' package.json > /dev/null; then
  jq --arg key "@aurodesignsystem/eslint-config" --arg value "1.3.4" '.devDependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
fi

# BATCH 2 UPDATES
# ========================================

# install latest version of @aurodesignsystem/auro-library
if jq -e --arg key "@aurodesignsystem/auro-library" '.dependencies | has($key)' package.json > /dev/null; then
  jq --arg key "@aurodesignsystem/auro-library" --arg value "3.0.11" '.dependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
fi

# BATCH 3 UPDATES
# ========================================

# TODO: do this tomorrow :)


echo "Removing package-lock.json"
rm -f package-lock.json

echo "Updating package-lock.json via npm install"
npm install

echo "Building the project"
npm run build
