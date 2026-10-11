# hv-umm2.435 pre-existing observations

- The tracked inventory is stale on base 675dbfb8bafa6b655b56e87d88907be57f3fa7fa. The unchanged generator detects createCard and takeExtraTurn as present while the tracked inventory lists them as pending. `before-cli-check.log` preserves exit 1; `before-cli-regenerate.log` and `inventory-before-current.json` preserve the current old-generator output. Original tracked bytes were restored identically before implementation. These observations are distinct from the intended C12 correction.
- npm install reports 17 dependency advisories: 9 moderate, 7 high and 1 critical. The manifest and lockfile are unchanged.
