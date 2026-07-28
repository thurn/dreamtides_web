#!/bin/sh

set -eu

fail()
{
    echo "provision-licensed-assets: $*" >&2
    exit 1
}

public_root=$(git rev-parse --show-toplevel 2>/dev/null) ||
    fail "run this command from a journey_prototype worktree"
target="$public_root/cumulus/Assets/ThirdParty"
branch=${1:-$(git branch --show-current)}

[ -n "$branch" ] ||
    fail "the public worktree is detached; pass an explicit licensed branch name"
git check-ref-format --branch "$branch" >/dev/null 2>&1 ||
    fail "invalid licensed branch name: $branch"

licensed_repo=${CUMULUS_LICENSED_REPO:-}
if [ -z "$licensed_repo" ]; then
    licensed_repo=$(git config --get journey.cumulusLicensedRepo 2>/dev/null || true)
fi
[ -n "$licensed_repo" ] ||
    fail "set CUMULUS_LICENSED_REPO or git config journey.cumulusLicensedRepo"
[ -d "$licensed_repo" ] ||
    fail "licensed repository does not exist: $licensed_repo"
licensed_repo=$(CDPATH= cd -- "$licensed_repo" && pwd -P)

licensed_git_dir=$(git -C "$licensed_repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) ||
    fail "configured path is not a Git repository: $licensed_repo"
[ "$(git -C "$licensed_repo" rev-parse --is-bare-repository)" = "true" ] ||
    fail "licensed repository must be bare: $licensed_repo"

[ "$(git -C "$licensed_repo" config --bool --get journey.localOnly 2>/dev/null || true)" = "true" ] ||
    fail "licensed repository must set journey.localOnly=true"
[ -z "$(git -C "$licensed_repo" remote)" ] ||
    fail "licensed repository must not have a remote"
git -C "$licensed_repo" show-ref --verify --quiet refs/heads/main ||
    fail "licensed repository is missing its main branch"

licensed_seed=${CUMULUS_LICENSED_SEED:-}
if [ -z "$licensed_seed" ]; then
    licensed_seed=$(git config --get journey.cumulusLicensedSeed 2>/dev/null || true)
fi
[ -n "$licensed_seed" ] ||
    fail "set CUMULUS_LICENSED_SEED or git config journey.cumulusLicensedSeed"
[ -d "$licensed_seed" ] ||
    fail "licensed seed does not exist: $licensed_seed"
licensed_seed=$(CDPATH= cd -- "$licensed_seed" && pwd -P)
seed_root=$(git -C "$licensed_seed" rev-parse --show-toplevel 2>/dev/null || true)
[ "$seed_root" = "$licensed_seed" ] ||
    fail "licensed seed must be a Git worktree root: $licensed_seed"
[ "$(git -C "$licensed_seed" rev-parse --path-format=absolute --git-common-dir)" = "$licensed_git_dir" ] ||
    fail "licensed seed belongs to a different Git repository: $licensed_seed"
[ "$(git -C "$licensed_seed" branch --show-current)" = "main" ] ||
    fail "licensed seed must have the main branch checked out"
[ -z "$(git -C "$licensed_seed" status --short)" ] ||
    fail "licensed seed worktree must be clean"

git check-ignore -q "$target/.licensed-assets-probe" ||
    fail "$target must be ignored by the public repository"

if [ -e "$target" ]; then
    target_root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)
    [ "$target_root" = "$target" ] ||
        fail "target exists but is not a licensed repository worktree: $target"
    [ "$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)" = "$licensed_git_dir" ] ||
        fail "target belongs to a different Git repository: $target"
    echo "Licensed assets already provisioned at $target"
    echo "Licensed branch: $(git -C "$target" branch --show-current)"
    exit 0
fi

mkdir -p "$(dirname "$target")"
seed_device=$(stat -f %d "$licensed_seed")
target_device=$(stat -f %d "$(dirname "$target")")
[ "$seed_device" = "$target_device" ] ||
    fail "licensed seed and target must be on the same filesystem for copy-on-write clones"

if git -C "$licensed_repo" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$licensed_repo" worktree add --no-checkout "$target" "$branch"
else
    git -C "$licensed_repo" worktree add --no-checkout -b "$branch" "$target" main
fi

if ! find "$licensed_seed" -mindepth 1 -maxdepth 1 ! -name .git \
    -exec cp -cR {} "$target/" \;
then
    git -C "$licensed_repo" worktree remove --force "$target"
    fail "could not create copy-on-write files from the licensed seed"
fi
git -C "$target" reset --mixed --quiet HEAD

target_common=$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)
if [ "$target_common" != "$licensed_git_dir" ]; then
    git -C "$licensed_repo" worktree remove --force "$target"
    fail "provisioned worktree does not share the licensed repository"
fi
if [ -n "$(git -C "$target" status --short)" ]; then
    git -C "$licensed_repo" worktree remove --force "$target"
    fail "provisioned licensed worktree is unexpectedly dirty"
fi

echo "Licensed assets provisioned at $target"
echo "Licensed branch: $branch"
echo "File strategy: APFS copy-on-write clone"
