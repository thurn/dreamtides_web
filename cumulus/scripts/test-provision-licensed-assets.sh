#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
fixture_root=$(mktemp -d "${TMPDIR:-/tmp}/cumulus-licensed-assets-test.XXXXXX")
trap 'rm -rf "$fixture_root"' EXIT HUP INT TERM

licensed_source="$fixture_root/licensed-source"
licensed_repo="$fixture_root/licensed.git"
licensed_seed="$fixture_root/licensed-seed"
public_repo="$fixture_root/public"

git init -q -b main "$licensed_source"
git -C "$licensed_source" config user.name "Cumulus Test"
git -C "$licensed_source" config user.email "cumulus-test@example.invalid"
mkdir -p "$licensed_source/Synty/Example"
printf '%s\n' "fixture-guid" >"$licensed_source/Synty/Example/Asset.prefab.meta"
git -C "$licensed_source" add --all
git -C "$licensed_source" commit -q -m "Licensed fixture"
git clone -q --bare "$licensed_source" "$licensed_repo"
git -C "$licensed_repo" config quest.localOnly true
git -C "$licensed_repo" remote remove origin 2>/dev/null || true
git -C "$licensed_repo" worktree add -q "$licensed_seed" main

git init -q -b main "$public_repo"
git -C "$public_repo" config user.name "Cumulus Test"
git -C "$public_repo" config user.email "cumulus-test@example.invalid"
mkdir -p "$public_repo/cumulus/Assets"
printf '%s\n' "cumulus/Assets/ThirdParty/" >"$public_repo/.gitignore"
git -C "$public_repo" add .gitignore
git -C "$public_repo" commit -q -m "Public fixture"
git -C "$public_repo" switch -q -c wt/licensed-fixture
git -C "$public_repo" config quest.cumulusLicensedRepo "$licensed_repo"
git -C "$public_repo" config quest.cumulusLicensedSeed "$licensed_seed"

git -C "$licensed_repo" remote add forbidden "$fixture_root/nowhere"
if (
    cd "$public_repo"
    "$script_dir/provision-licensed-assets.sh"
); then
    echo "expected a configured remote to be rejected" >&2
    exit 1
fi
git -C "$licensed_repo" remote remove forbidden

(
    cd "$public_repo"
    "$script_dir/provision-licensed-assets.sh"
    "$script_dir/provision-licensed-assets.sh"
)

target="$public_repo/cumulus/Assets/ThirdParty"
test -f "$target/Synty/Example/Asset.prefab.meta"
test "$(git -C "$target" branch --show-current)" = "wt/licensed-fixture"
test -z "$(git -C "$target" status --short)"
test "$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)" = \
    "$(git -C "$licensed_repo" rev-parse --path-format=absolute --git-common-dir)"
printf '%s\n' "task edit" >"$target/Synty/Example/Asset.prefab.meta"
test "$(cat "$licensed_seed/Synty/Example/Asset.prefab.meta")" = "fixture-guid"
git -C "$target" restore Synty/Example/Asset.prefab.meta

(
    cd "$public_repo"
    "$script_dir/release-licensed-assets.sh"
    "$script_dir/release-licensed-assets.sh"
)
test ! -e "$target"
git -C "$licensed_repo" show-ref --verify --quiet refs/heads/wt/licensed-fixture

git -C "$public_repo" config journey.cumulusLicensedRepo "$licensed_repo"
git -C "$public_repo" config journey.cumulusLicensedSeed "$licensed_seed"
git -C "$public_repo" config quest.cumulusLicensedRepo "$fixture_root/stale-repo"
git -C "$public_repo" config quest.cumulusLicensedSeed "$fixture_root/stale-seed"
git -C "$licensed_repo" config journey.localOnly true
git -C "$licensed_repo" config quest.localOnly false

(
    cd "$public_repo"
    "$script_dir/provision-licensed-assets.sh"
    "$script_dir/release-licensed-assets.sh"
)
test ! -e "$target"

echo "provision-licensed-assets tests passed"
