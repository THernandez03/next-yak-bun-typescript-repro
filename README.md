# next-yak + Bun Workspaces: TypeScript Compatibility Analysis

This repo reproduces TypeScript errors (TS2349, TS2786) that appear when using `next-yak` in a Bun workspace. It documents the root causes, whose responsibility they are, and how to work around them today.

> For the full reproduction details and error explanations, see [PROBLEM.md](./PROBLEM.md).

---

## Whose bug is it?

Both errors stem from an **interaction between two independently reasonable behaviors** — neither tool is strictly wrong, but together they produce a broken experience.

### TS2349 — `styled.button` not callable → `next-yak` issue

`next-yak` defines `YakJSX.IntrinsicElements` as a mapped type without the `-?` modifier:

```ts
type IntrinsicElements = {
  [K in keyof React.JSX.IntrinsicElements]: React.JSX.IntrinsicElements[K] &
    YakAttributes;
};
```

When `noUncheckedIndexedAccess: true` is active, TypeScript widens every indexed access `T[K]` on a mapped type to `T[K] | undefined`. This is a well-known TypeScript behavior. The fix belongs in `next-yak` — adding `-?` to the key makes the type non-optional and immune to `noUncheckedIndexedAccess`:

```ts
type IntrinsicElements = {
  [K in keyof React.JSX.IntrinsicElements]-?: React.JSX.IntrinsicElements[K] &
    YakAttributes;
};
```

### TS2786 — `YakComponent` cannot be used as JSX → shared Bun + `next-yak` issue

Bun's **isolated linker** (the default in workspaces with `configVersion = 1`) installs packages as symlinks pointing into a global virtual store at `~/.bun/install/cache/links/next-yak@X.Y.Z.../`. TypeScript follows the symlink and then searches for peer dependencies (like `react`) by walking up ancestor directories from that cache path — a path that never reaches the project root where `@types/react` is installed. This causes `React.FunctionComponent` to be unresolved, making `YakComponent<any>` fail the JSX element type check.

- **Bun's side:** the isolated linker's global symlink strategy breaks TypeScript's ancestor-directory module resolution for packages without a `"types"` export condition.
- **`next-yak`'s side:** if `next-yak` added a `"types"` condition to its `exports` map, Bun would materialize the package into the project-local `node_modules/.bun/` instead of the global cache, restoring TypeScript's ability to find peer types.

---

## Why `bun install --linker hoisted` fixes everything

The **hoisted linker** flattens all dependencies into a single `node_modules/` at the project root — the classic npm/Yarn behavior:

```
node_modules/
  next-yak/       ← real files, not a symlink to a global cache
  react/
  @types/react/
  ...
```

Because `next-yak` is a real directory under the project root, TypeScript's ancestor-directory search for `react` succeeds immediately. No symlinks, no global cache paths, no broken resolution chain. Both TS2349 and TS2786 disappear because:

1. The module resolution works correctly → `React.FunctionComponent` resolves → TS2786 gone
2. With correct resolution the types are fully valid, and TS2349 can be addressed independently

The **isolated linker** creates this instead:

```
node_modules/
  next-yak → ~/.bun/install/cache/links/next-yak@9.4.1.../  ← symlink
```

TypeScript follows the symlink and starts its ancestor search from `~/.bun/install/cache/links/...`, which has no `node_modules/@types/react` anywhere above it.

---

## Workarounds today (consumer side)

### Option 1 — Switch to hoisted linker (quickest fix)

```bash
bun install --linker hoisted
```

Or persist it in `bunfig.toml`:

```toml
[install]
linker = "hoisted"
```

This restores the flat `node_modules` structure that TypeScript's resolution expects. **Both errors disappear.**

### Option 2 — `bun patch` (keeps isolated linker, fixes TS2786)

Patch `next-yak` to add a `"types"` condition to its exports. Bun then materializes the package locally instead of symlinking to the global cache:

```bash
bun patch next-yak
# In the patched package.json, add "types" to all exports entries:
# "exports": { ".": { "import": "...", "require": "...", "types": "./dist/index.d.ts" } }
bun patch --commit next-yak
```

### Option 3 — Disable `noUncheckedIndexedAccess` per package (fixes TS2349 only)

In `packages/app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsxImportSource": "next-yak",
    "noUncheckedIndexedAccess": false
  }
}
```

This suppresses TS2349 but does not fix TS2786 on its own.

---

## Recommended fix requests upstream

| Where          | What to fix                                                            |
| -------------- | ---------------------------------------------------------------------- |
| `next-yak`     | Add `-?` to `YakJSX.IntrinsicElements` mapped type                     |
| `next-yak`     | Add `"types"` condition to all `exports` entries in `package.json`     |
| Bun (optional) | Consider preserving project-relative resolution for symlinked packages |

---

## Environment

| Tool / Package     | Version                                                |
| ------------------ | ------------------------------------------------------ |
| Bun                | 1.3.14 (canary)                                        |
| `next-yak`         | 9.4.1                                                  |
| `react`            | 19.2.5                                                 |
| `@types/react`     | 19.2.14                                                |
| `@types/react-dom` | 19.2.3                                                 |
| `typescript`       | 6.0.3                                                  |
| Bun linker         | isolated (default for workspaces, `configVersion = 1`) |
