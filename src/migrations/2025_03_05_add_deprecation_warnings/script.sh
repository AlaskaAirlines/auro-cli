#!/bin/bash
set -e

# fetch latest template if it doesn't exist
if [[ ! -f docTemplates/README.md ]]; then
  rm -rf docTemplates/README.md
fi

echo "Fetching latest README template..."
mkdir -p docTemplates
curl https://raw.githubusercontent.com/AlaskaAirlines/WC-Generator/master/componentDocs/README_updated_paths.md > docTemplates/README.md

node "$(dirname "$0")/migration.js"

# template has changed, add it to git (force required since parent is in .gitignore)
git add docTemplates/README.md -f

npm run build:docs # required to update git copy of README.md
