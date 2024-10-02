#!/bin/sh
set -Ceux

NEXT_PUBLIC_MODE=production npm run build
find .next -name "*.js" | xargs grep "TEST_DEVELOPMENT"
# find .next -name "*.js" | xargs grep "NEW FEATURE"
