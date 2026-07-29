#!/bin/sh

set -eu

fail()
{
    echo "promote-licensed-assets: $*" >&2
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

resolve_primary_public_root()
{
    if [ -n "${CUMULUS_PUBLIC_PRIMARY_ROOT:-}" ]; then
        printf '%s\n' "$CUMULUS_PUBLIC_PRIMARY_ROOT"
        return
    fi

    primary_root=$(
        git worktree list --porcelain |
            awk '
                /^worktree / {
                    worktree_path = substr($0, 10)
                }
                $0 == "branch refs/heads/master" {
                    print worktree_path
                    count++
                }
                END {
                    if (count != 1) {
                        exit 1
                    }
                }
            '
    ) || fail "could not identify the one public worktree with master checked out"
    printf '%s\n' "$primary_root"
}

public_root=$(git rev-parse --show-toplevel 2>/dev/null) ||
    fail "run this command from a journey_prototype task worktree"
public_branch=$(git branch --show-current)
[ -n "$public_branch" ] ||
    fail "the public task worktree must have a branch checked out"

check_only=0
case "${1:-}" in
    "")
        ;;
    --check)
        check_only=1
        ;;
    *)
        fail "usage: $0 [--check]"
        ;;
esac

task_target="$public_root/cumulus/Assets/ThirdParty"
[ -d "$task_target" ] ||
    fail "provision the paired licensed-assets worktree before promotion"

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
[ "$(git -C "$licensed_repo" rev-parse --is-bare-repository)" = "true" ] ||
    fail "licensed repository must be bare: $licensed_repo"
[ -z "$(git -C "$licensed_repo" remote)" ] ||
    fail "licensed repository must not have a remote"
git -C "$licensed_repo" show-ref --verify --quiet refs/heads/main ||
    fail "licensed repository is missing its main branch"

licensed_repo_local_only=$(
    git -C "$licensed_repo" config --bool --get journey.localOnly 2>/dev/null || true
)
if [ -z "$licensed_repo_local_only" ]; then
    licensed_repo_local_only=$(
        git -C "$licensed_repo" config --bool --get quest.localOnly 2>/dev/null || true
    )
fi
[ "$licensed_repo_local_only" = "true" ] ||
    fail "licensed repository must set journey.localOnly=true"

if [ "${CUMULUS_LICENSED_PROMOTION_LOCKED:-}" != "1" ]; then
    lock_path="$licensed_git_dir/cumulus-promotion.lock"
    if command -v lockf >/dev/null 2>&1; then
        exec lockf -k "$lock_path" env CUMULUS_LICENSED_PROMOTION_LOCKED=1 "$0" "$@"
    elif command -v flock >/dev/null 2>&1; then
        exec flock "$lock_path" env CUMULUS_LICENSED_PROMOTION_LOCKED=1 "$0" "$@"
    fi
    fail "neither lockf nor flock is available to serialize licensed promotion"
fi

licensed_seed=${CUMULUS_LICENSED_SEED:-}
if [ -z "$licensed_seed" ]; then
    licensed_seed=$(read_cumulus_config cumulusLicensedSeed)
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

task_root=$(git -C "$task_target" rev-parse --show-toplevel 2>/dev/null || true)
[ "$task_root" = "$task_target" ] ||
    fail "paired licensed target is not a worktree root: $task_target"
[ "$(git -C "$task_target" rev-parse --path-format=absolute --git-common-dir)" = "$licensed_git_dir" ] ||
    fail "paired licensed target belongs to a different Git repository"
[ "$(git -C "$task_target" branch --show-current)" = "$public_branch" ] ||
    fail "public and licensed task worktrees must use the same branch name"
[ -z "$(git -C "$task_target" status --short)" ] ||
    fail "paired licensed task worktree must be clean"

primary_public_root=$(resolve_primary_public_root)
[ -d "$primary_public_root" ] ||
    fail "public primary worktree does not exist: $primary_public_root"
primary_public_root=$(CDPATH= cd -- "$primary_public_root" && pwd -P)
[ "$(git -C "$primary_public_root" rev-parse --show-toplevel 2>/dev/null || true)" = "$primary_public_root" ] ||
    fail "public primary path is not a worktree root: $primary_public_root"
[ "$(git -C "$primary_public_root" branch --show-current)" = "master" ] ||
    fail "public primary worktree must have master checked out"

primary_target="$primary_public_root/cumulus/Assets/ThirdParty"
[ -d "$primary_target" ] ||
    fail "primary licensed checkout does not exist: $primary_target"
primary_root=$(git -C "$primary_target" rev-parse --show-toplevel 2>/dev/null || true)
[ "$primary_root" = "$primary_target" ] ||
    fail "primary licensed checkout is not a worktree root: $primary_target"
[ "$(git -C "$primary_target" rev-parse --path-format=absolute --git-common-dir)" = "$licensed_git_dir" ] ||
    fail "primary licensed checkout belongs to a different Git repository"
[ -z "$(git -C "$primary_target" status --short)" ] ||
    fail "primary licensed checkout must be clean"

task_commit=$(git -C "$task_target" rev-parse HEAD)
main_commit=$(git -C "$licensed_repo" rev-parse main)
primary_commit=$(git -C "$primary_target" rev-parse HEAD)
primary_branch=$(git -C "$primary_target" branch --show-current)

git -C "$licensed_repo" merge-base --is-ancestor "$main_commit" "$task_commit" ||
    fail "licensed task branch must contain the current main commit"
git -C "$licensed_repo" merge-base --is-ancestor "$primary_commit" "$task_commit" ||
    fail "licensed task branch must contain the primary checkout commit"
if git -C "$licensed_repo" show-ref --verify --quiet refs/heads/primary; then
    legacy_primary_commit=$(git -C "$licensed_repo" rev-parse primary)
    git -C "$licensed_repo" merge-base --is-ancestor "$legacy_primary_commit" "$task_commit" ||
        fail "licensed task branch must contain the legacy primary branch commit"
fi

if [ -n "$primary_branch" ] && [ "$primary_branch" != "primary" ]; then
    fail "primary licensed checkout must be detached or on the legacy primary branch"
fi

if [ "$check_only" = "1" ]; then
    echo "Licensed promotion check passed: $task_commit"
    echo "Primary checkout will be detached at: $primary_target"
    exit 0
fi

git -C "$licensed_seed" merge --ff-only "$task_commit"
git -C "$primary_target" switch --detach "$task_commit"

if git -C "$licensed_repo" show-ref --verify --quiet refs/heads/primary; then
    git -C "$licensed_repo" branch -d primary
fi

[ "$(git -C "$licensed_repo" rev-parse main)" = "$task_commit" ] ||
    fail "licensed main did not reach the promoted commit"
[ "$(git -C "$primary_target" rev-parse HEAD)" = "$task_commit" ] ||
    fail "primary licensed checkout did not reach the promoted commit"
if git -C "$primary_target" symbolic-ref -q HEAD >/dev/null 2>&1; then
    fail "primary licensed checkout must be detached"
fi
if git -C "$licensed_repo" show-ref --verify --quiet refs/heads/primary; then
    fail "legacy licensed primary branch still exists"
fi

echo "Promoted licensed main: $task_commit"
echo "Updated detached primary checkout: $primary_target"
