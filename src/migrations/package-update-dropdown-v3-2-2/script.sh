#!/bin/bash

# Define the package and version
PACKAGE="@aurodesignsystem/auro-dropdown"
VERSION="^3.2.2"

# Update package.json using npm
npm install $PACKAGE@$VERSION

# Run build
npm run build
npm run build:version