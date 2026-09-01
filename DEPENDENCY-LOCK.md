# v2.5.1 Dependency Lock Policy

- Direct dependencies in `package.json` are exact versions; no `latest` specifiers are allowed.
- TypeScript is fixed at `5.9.2` because the Windows evaluation observed a regression after `latest` resolved to TypeScript 7.
- If `package-lock.json` exists, Windows installation/build uses `npm ci`.
- If the distributed source does not yet contain `package-lock.json`, the first connected Windows install creates it once from the exact direct pins, then immediately runs `npm ci` against that lock.
- `FREEZE-DEPENDENCIES.ps1` can be used explicitly to create/refresh the lock and run the Windows stability checks.
- Do not run `npm audit fix --force` automatically. Review dependency changes and rerun `WINDOWS-RELEASE-CHECK.ps1`.
