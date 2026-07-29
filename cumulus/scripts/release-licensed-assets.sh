#!/bin/sh

set -eu

fail()
{
    echo "release-licensed-assets: $*" >&2
    exit 1
}

read_cumulus_config()
{
    config_value=$(git config --get "journey.$1" 2>/dev/null || true)
    if [ -z "$config_value" ]; then
        config_value=$(git config --get "quest.$1" 2>/dev/null || true)
    fi
    printf '%s\n' "$config_value"
}

public_root=$(git rev-parse --show-toplevel 2>/dev/null) ||
    fail "run this command from a journey_prototype worktree"
target="$public_root/cumulus/Assets/ThirdParty"

if [ ! -e "$target" ]; then
    echo "No licensed-assets worktree is provisioned at $target"
    exit 0
fi

licensed_repo=${CUMULUS_LICENSED_REPO:-}
if [ -z "$licensed_repo" ]; then
    licensed_repo=$(read_cumulus_config cumulusLicensedRepo)
fi
[ -n "$licensed_repo" ] ||
    fail "set CUMULUS_LICENSED_REPO or git config journey.cumulusLicensedRepo"
[ -d "$licensed_repo" ] ||
    fail "licensed repository does not exist: $licensed_repo"
licensed_repo=$(CDPATH= cd -- "$licensed_repo" && pwd -P)

licensed_git_dir=$(git -C "$licensed_repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) ||
    fail "configured path is not a Git repository: $licensed_repo"
target_root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)
[ "$target_root" = "$target" ] ||
    fail "target is not a licensed repository worktree: $target"
[ "$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)" = "$licensed_git_dir" ] ||
    fail "target belongs to a different Git repository: $target"
[ -z "$(git -C "$target" status --short)" ] ||
    fail "licensed worktree has uncommitted changes: $target"

branch=$(git -C "$target" branch --show-current)
commit=$(git -C "$target" rev-parse HEAD)
git -C "$licensed_repo" worktree remove "$target"

echo "Released licensed-assets worktree: $target"
echo "Retained licensed branch: $branch"
echo "Licensed commit: $commit"
