#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
fixture_root=$(mktemp -d "${TMPDIR:-/tmp}/cumulus-licensed-promotion-test.XXXXXX")
trap 'rm -rf "$fixture_root"' EXIT HUP INT TERM

licensed_source="$fixture_root/licensed-source"
licensed_repo="$fixture_root/licensed.git"
licensed_seed="$fixture_root/licensed-seed"
public_primary="$fixture_root/public-primary"
public_task="$fixture_root/public-task"
primary_target="$public_primary/cumulus/Assets/ThirdParty"
task_target="$public_task/cumulus/Assets/ThirdParty"

git init -q -b main "$licensed_source"
git -C "$licensed_source" config user.name "Cumulus Test"
git -C "$licensed_source" config user.email "cumulus-test@example.invalid"
mkdir -p "$licensed_source/Synty/Example"
printf '%s\n' "fixture-guid" >"$licensed_source/Synty/Example/Asset.prefab.meta"
git -C "$licensed_source" add --all
git -C "$licensed_source" commit -q -m "Licensed fixture"
git clone -q --bare "$licensed_source" "$licensed_repo"
git -C "$licensed_repo" config journey.localOnly true
git -C "$licensed_repo" remote remove origin 2>/dev/null || true
git -C "$licensed_repo" worktree add -q "$licensed_seed" main

git init -q -b master "$public_primary"
git -C "$public_primary" config user.name "Cumulus Test"
git -C "$public_primary" config user.email "cumulus-test@example.invalid"
mkdir -p "$public_primary/cumulus/Assets"
printf '%s\n' "cumulus/Assets/ThirdParty/" >"$public_primary/.gitignore"
git -C "$public_primary" add .gitignore
git -C "$public_primary" commit -q -m "Public fixture"
git -C "$public_primary" worktree add -q -b wt/licensed-fixture "$public_task" master
git -C "$public_task" config journey.cumulusLicensedRepo "$licensed_repo"
git -C "$public_task" config journey.cumulusLicensedSeed "$licensed_seed"

mkdir -p "$(dirname "$primary_target")"
git -C "$licensed_repo" worktree add -q -b primary "$primary_target" main

(
    cd "$public_task"
    "$script_dir/provision-licensed-assets.sh"
)

git -C "$task_target" config user.name "Cumulus Test"
git -C "$task_target" config user.email "cumulus-test@example.invalid"
printf '%s\n' "promoted fixture" >"$task_target/Synty/Example/Asset.prefab.meta"
git -C "$task_target" add Synty/Example/Asset.prefab.meta
git -C "$task_target" commit -q -m "Licensed task change"
task_commit=$(git -C "$task_target" rev-parse HEAD)

(
    cd "$public_task"
    "$script_dir/promote-licensed-assets.sh" --check
)
test "$(git -C "$licensed_repo" rev-parse main)" != "$task_commit"
test "$(git -C "$primary_target" branch --show-current)" = "primary"

(
    cd "$public_task"
    "$script_dir/promote-licensed-assets.sh"
    "$script_dir/promote-licensed-assets.sh"
)

test "$(git -C "$licensed_repo" rev-parse main)" = "$task_commit"
test "$(git -C "$primary_target" rev-parse HEAD)" = "$task_commit"
if git -C "$primary_target" symbolic-ref -q HEAD >/dev/null 2>&1; then
    echo "expected primary licensed checkout to be detached" >&2
    exit 1
fi
if git -C "$licensed_repo" show-ref --verify --quiet refs/heads/primary; then
    echo "expected legacy primary branch to be deleted" >&2
    exit 1
fi
test "$(cat "$primary_target/Synty/Example/Asset.prefab.meta")" = "promoted fixture"

git -C "$primary_target" switch -q -c primary
printf '%s\n' "divergent primary" >"$primary_target/Synty/Example/Asset.prefab.meta"
git -C "$primary_target" add Synty/Example/Asset.prefab.meta
git -C "$primary_target" commit -q -m "Divergent primary change"
primary_commit=$(git -C "$primary_target" rev-parse HEAD)

printf '%s\n' "divergent task" >"$task_target/Synty/Example/Asset.prefab.meta"
git -C "$task_target" add Synty/Example/Asset.prefab.meta
git -C "$task_target" commit -q -m "Divergent task change"
if (
    cd "$public_task"
    "$script_dir/promote-licensed-assets.sh"
); then
    echo "expected divergent primary history to be rejected" >&2
    exit 1
fi
test "$(git -C "$licensed_repo" rev-parse main)" = "$task_commit"
test "$(git -C "$primary_target" rev-parse HEAD)" = "$primary_commit"
git -C "$licensed_repo" show-ref --verify --quiet refs/heads/primary

echo "promote-licensed-assets tests passed"
