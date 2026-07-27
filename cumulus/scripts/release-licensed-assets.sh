#!/bin/sh

set -eu

fail()
{
    echo "release-licensed-assets: $*" >&2
    exit 1
}

public_root=$(git rev-parse --show-toplevel 2>/dev/null) ||
    fail "run this command from a quest_prototype worktree"
target="$public_root/cumulus/Assets/ThirdParty"

if [ ! -e "$target" ]; then
    echo "No licensed-assets worktree is provisioned at $target"
    exit 0
fi

licensed_repo=${CUMULUS_LICENSED_REPO:-}
if [ -z "$licensed_repo" ]; then
    licensed_repo=$(git config --get quest.cumulusLicensedRepo 2>/dev/null || true)
fi
[ -n "$licensed_repo" ] ||
    fail "set CUMULUS_LICENSED_REPO or git config quest.cumulusLicensedRepo"

licensed_root=$(git -C "$licensed_repo" rev-parse --show-toplevel 2>/dev/null) ||
    fail "configured path is not a Git repository: $licensed_repo"
licensed_common=$(git -C "$licensed_root" rev-parse --path-format=absolute --git-common-dir)
target_root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)
[ "$target_root" = "$target" ] ||
    fail "target is not a licensed repository worktree: $target"
[ "$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)" = "$licensed_common" ] ||
    fail "target belongs to a different Git repository: $target"
[ -z "$(git -C "$target" status --short)" ] ||
    fail "licensed worktree has uncommitted changes: $target"

branch=$(git -C "$target" branch --show-current)
commit=$(git -C "$target" rev-parse HEAD)
git -C "$licensed_root" worktree remove "$target"

echo "Released licensed-assets worktree: $target"
echo "Retained licensed branch: $branch"
echo "Licensed commit: $commit"
