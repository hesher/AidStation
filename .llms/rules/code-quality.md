# Code Quality Rules

## Always Run Lint and Type Checking

Before completing any code changes, you MUST run the following checks:

### For the web app (`apps/web`):
```bash
cd /Users/bkatz/Desktop/AidStation/apps/web && npm run lint && npx tsc --noEmit
```

### For the API (`apps/api`):
```bash
cd /Users/bkatz/Desktop/AidStation/apps/api && npm run lint && npx tsc --noEmit
```

### For Python workers (`workers/python`):
```bash
cd /Users/bkatz/Desktop/AidStation/workers/python && python -m py_compile src/**/*.py
```

## Validation Checklist

Before marking any code change as complete:

1. ✅ Run ESLint: `npm run lint`
2. ✅ Run TypeScript type checker: `npx tsc --noEmit`
3. ✅ Fix ALL lint errors and type errors before proceeding
4. ✅ Use `validate_changes` tool as a final check

## Common Lint Commands

| Package | Lint Command | Type Check Command |
|---------|-------------|-------------------|
| apps/web | `npm run lint` | `npx tsc --noEmit` |
| apps/api | `npm run lint` | `npx tsc --noEmit` |
| workers/python | `ruff check .` | `mypy .` |

## Error Handling

If lint or type errors are found:
1. Fix all errors immediately
2. Re-run the checks to confirm fixes
3. Only then proceed with the next task

**NEVER** submit or complete code changes with lint or type errors.
