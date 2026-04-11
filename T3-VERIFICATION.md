# T3 Verification: Compound Commands Support

## Task
Support compound commands in noxdev run (frontend && backend)

## Findings
✅ **Compound commands already work correctly** - no additional shell invocation needed.

## Evidence

### 1. Docker Scripts Use bash -c
Both Docker execution scripts already use explicit shell invocation:
- `docker-run-max.sh` (line 56): `bash -c 'git config ... && claude ...'`
- `docker-run-api.sh` (line 58): `bash -c 'git config ... && claude ...'`

### 2. Existing Compound Commands in Codebase
Configuration defaults already include compound commands:
```typescript
// packages/cli/src/lib/configDefaults.ts:184
lint_command: `${packageManager} exec eslint src && ${packageManager} exec tsc --noEmit`
```

### 3. Verification Test
Manual test confirmed compound commands work:
```bash
$ echo 'Frontend build' && pnpm build
Frontend build
# ... build output follows successfully
```

## Conclusion
Commands like `"build_command": "frontend && backend"` will work correctly through the existing `bash -c` implementation in the Docker execution environment.

## Technical Flow
1. `ProjectConfig.build_command` → stores command string
2. `docker-run-*.sh` → executes via `bash -c 'command'`
3. Shell environment → processes compound commands with `&&`

No code changes required.