#!/bin/sh

set -eu

fail()
{
    echo "provision-licensed-assets: $*" >&2
    exit 1
}

public_root=$(git rev-parse --show-toplevel 2>/dev/null) ||
    fail "run this command from a quest_prototype worktree"
target="$public_root/cumulus/Assets/ThirdParty"
branch=${1:-$(git branch --show-current)}

[ -n "$branch" ] ||
    fail "the public worktree is detached; pass an explicit licensed branch name"
git check-ref-format --branch "$branch" >/dev/null 2>&1 ||
    fail "invalid licensed branch name: $branch"

licensed_repo=${CUMULUS_LICENSED_REPO:-}
if [ -z "$licensed_repo" ]; then
    licensed_repo=$(git config --get quest.cumulusLicensedRepo 2>/dev/null || true)
fi
[ -n "$licensed_repo" ] ||
    fail "set CUMULUS_LICENSED_REPO or git config quest.cumulusLicensedRepo"
[ -d "$licensed_repo" ] ||
    fail "licensed repository does not exist: $licensed_repo"

licensed_root=$(git -C "$licensed_repo" rev-parse --show-toplevel 2>/dev/null) ||
    fail "configured path is not a Git repository: $licensed_repo"
licensed_common=$(git -C "$licensed_root" rev-parse --path-format=absolute --git-common-dir)

[ "$(git -C "$licensed_root" config --bool --get quest.localOnly 2>/dev/null || true)" = "true" ] ||
    fail "licensed repository must set quest.localOnly=true"
[ -z "$(git -C "$licensed_root" remote)" ] ||
    fail "licensed repository must not have a remote"
git -C "$licensed_root" show-ref --verify --quiet refs/heads/main ||
    fail "licensed repository is missing its main branch"

git check-ignore -q "$target/.licensed-assets-probe" ||
    fail "$target must be ignored by the public repository"

if [ -e "$target" ]; then
    target_root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)
    [ "$target_root" = "$target" ] ||
        fail "target exists but is not a licensed repository worktree: $target"
    target_common=$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)
    [ "$target_common" = "$licensed_common" ] ||
        fail "target belongs to a different Git repository: $target"
    echo "Licensed assets already provisioned at $target"
    echo "Licensed branch: $(git -C "$target" branch --show-current)"
    exit 0
fi

mkdir -p "$(dirname "$target")"
if git -C "$licensed_root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$licensed_root" worktree add "$target" "$branch"
else
    git -C "$licensed_root" worktree add -b "$branch" "$target" main
fi

[ "$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)" = "$licensed_common" ] ||
    fail "provisioned worktree does not share the licensed repository"
[ -z "$(git -C "$target" status --short)" ] ||
    fail "provisioned licensed worktree is unexpectedly dirty"

echo "Licensed assets provisioned at $target"
echo "Licensed branch: $branch"
