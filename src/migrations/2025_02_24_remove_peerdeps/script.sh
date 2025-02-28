#!/bin/bash
set -e

echo "Using branch: $(git branch --show-current)"

# peerDeps to remove:
RELEVANT_DEPS=(
  "@alaskaairux/icons"
  "@aurodesignsystem/webcorestylesheets"
  "@aurodesignsystem/design-tokens"
)

# Function to update package versions
update_package_versions() {
  local -n packages=$1

  for package in "${!packages[@]}"; do
    if jq -e --arg key "$package" '.dependencies | has($key)' package.json > /dev/null; then
      echo "Detected $package, updating to v${packages[$package]}"
      jq --arg key "$package" --arg value "${packages[$package]}" '.dependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
    fi

    # also check in devDependencies
    if jq -e --arg key "$package" '.devDependencies | has($key)' package.json > /dev/null; then
      echo "Detected $package, updating to v${packages[$package]}"
      jq --arg key "$package" --arg value "${packages[$package]}" '.devDependencies[$key] = $value' package.json > package.tmp.json && mv package.tmp.json package.json
    fi
  done
}

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
declare -A top_level_components=(
  ["@aurodesignsystem/design-tokens"]="5.0.2"
  ["@alaskaairux/icons"]="5.2.0"
  ["@aurodesignsystem/webcorestylesheets"]="6.1.0"
)

# Call the function with the packages array
update_package_versions top_level_components

# BATCH 1 UPDATES
# ========================================
declare -A batch_1_components=(
  ["@aurodesignsystem/eslint-config"]="1.3.4"
)

# Call the function with the packages array
update_package_versions batch_1_components

# BATCH 2 UPDATES
# ========================================
declare -A batch_2_components=(
  ["@aurodesignsystem/auro-library"]="3.0.11"
)

# Call the function with the packages array
update_package_versions batch_2_components

# BATCH 3 UPDATES
# ========================================

# Define an associative array with package names and their versions
declare -A batch_3_components=(
  ["@aurodesignsystem/auro-popover"]="5.0.0"
  ["@aurodesignsystem/auro-icon"]="7.0.0"
  ["@aurodesignsystem/auro-header"]="4.0.0"
  ["@aurodesignsystem/auro-loader"]="4.0.0"
  ["@aurodesignsystem/auro-datetime"]="3.0.0"
  ["@aurodesignsystem/auro-table"]="4.0.0"
  ["@aurodesignsystem/auro-lockup"]="5.0.0"
  ["@aurodesignsystem/auro-background"]="4.0.0"
  ["@aurodesignsystem/auro-skeleton"]="4.0.0"
)

# Call the function with the packages array
update_package_versions batch_3_components

# BATCH 4 UPDATES
# ========================================

declare -A batch_4_components=(
  ["@aurodesignsystem/auro-hyperlink"]="5.0.0"
  ["@aurodesignsystem/auro-avatar"]="6.0.0"
  ["@aurodesignsystem/auro-alert"]="4.0.0"
  ["@aurodesignsystem/auro-banner"]="4.0.0"
  ["@aurodesignsystem/auro-button"]="9.0.0"
  ["@aurodesignsystem/auro-pane"]="4.0.0"
)

# Call the function with the packages array
update_package_versions batch_4_components

# BATCH 5 UPDATES
# ========================================

declare -A batch_5_components=(
  ["@aurodesignsystem/auro-card"]="5.0.0"
  ["@aurodesignsystem/auro-drawer"]="3.0.0"
  ["@aurodesignsystem/auro-toast"]="3.0.0"
  ["@aurodesignsystem/auro-backtotop"]="4.0.0"
  ["@aurodesignsystem/auro-accordion"]="5.0.0"
  ["@aurodesignsystem/auro-nav"]="3.0.0"
  ["@aurodesignsystem/auro-dialog"]="3.0.0"
  ["@aurodesignsystem/auro-carousel"]="4.0.0"
  ["@aurodesignsystem/auro-badge"]="4.0.0"
)

# Call the function with the packages array
update_package_versions batch_5_components

# BATCH 6 UPDATES
# ========================================
# AlaskaAirlines/auro-sidenav
#   - AlaskaAirlines/auro-flightline

declare -A batch_6_components=(
  ["@aurodesignsystem/auro-sidenav"]="4.0.0"
  ["@aurodesignsystem/auro-flightline"]="4.0.0"
)

# Call the function with the packages array
update_package_versions batch_6_components

# Pre-install changes
# ========================================
echo "Overwrite packageScripts/postinstall.js with _postInstallTemplate.js in script folder"
rm -f ./packageScripts/postinstall.js
cp -f /Users/Doug.Hooker@alaskaair.com/code/auro/auro-cli/src/migrations/2025_02_24_remove_peerdeps/_postInstallTemplate.js ./packageScripts/postinstall.mjs

echo "Removing package-lock.json"
rm -f package-lock.json

echo "Updating package-lock.json via npm install"
npm install

echo "Building the project"
npm run build

echo "Cleaning up cache for next run"
npm cache clean --force
