#!/usr/bin/env bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting deployment...${NC}\n"

# Get the current version
VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Deploying version ${VERSION}${NC}\n"

# Publish to npm
echo -e "${YELLOW}Publishing to npm...${NC}"
npm publish --access public

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Successfully published to npm!${NC}\n"

  # Push git commits and tags
  echo -e "${YELLOW}Pushing to git...${NC}"
  git push && git push --tags

  echo -e "${GREEN}✓ Deployment complete! Version ${VERSION} is live.${NC}"
else
  echo -e "${RED}Failed to publish to npm${NC}"
  exit 1
fi
