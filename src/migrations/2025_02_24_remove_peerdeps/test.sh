#!/bin/bash

declare -A top_level_components=(
  ["@aurodesignsystem/design-tokens"]="5.0.2"
  ["@alaskaairux/icons"]="5.2.0"
  ["@aurodesignsystem/webcorestylesheets"]="6.1.0"
)

for i in "${!top_level_components[@]}"; do
  echo "key  : $i"
  echo "value: ${top_level_components[$i]}"
done
