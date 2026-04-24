# next-yak + Bun Workspaces: TypeScript Errors (TS2349 + TS2786)

Minimal reproduction of two TypeScript errors that occur when using `next-yak` with Bun workspaces and `noUncheckedIndexedAccess: true`.

## Reproduce

```bash
bun install
bun run typecheck
```

Expected: 0 errors  
Actual: TS2349 and TS2786 errors in `packages/app/src/Button.tsx`

## Errors

### TS2349 — `styled.button` is not callable

```
packages/app/src/Button.tsx(11,16): error TS2349: This expression is not callable.
  Type 'LiteralWithAttrs<...> | undefined' has no call signatures.
```

**Root cause:** `jsxImportSource: "next-yak"` makes TypeScript use `YakJSX` as the JSX namespace. `YakJSX.IntrinsicElements` is a mapped type:

```ts
type IntrinsicElements = {
  [K in keyof React.JSX.IntrinsicElements]: React.JSX.IntrinsicElements[K] & { css?: ... }
}
```

When `noUncheckedIndexedAccess: true` is set (even in a parent/root tsconfig), TypeScript adds `| undefined` to the indexed access `[K]` on this mapped type. As a result, `styled.button` resolves to `LiteralWithAttrs<...> | undefined` — which has no call signatures.

**Suggested fix in next-yak:** Use `-?` to strip the optionality from the mapped type key, preventing `noUncheckedIndexedAccess` from widening the type:

```ts
// Current — breaks with noUncheckedIndexedAccess: true
type IntrinsicElements = {
  [K in keyof React.JSX.IntrinsicElements]: React.JSX.IntrinsicElements[K] & YakAttributes
}

// Fix
type IntrinsicElements = {
  [K in keyof React.JSX.IntrinsicElements]-?: React.JSX.IntrinsicElements[K] & YakAttributes
}
```

---

### TS2786 — `YakComponent` cannot be used as a JSX element

```
packages/app/src/Button.tsx(24,22): error TS2786: 'StyledButton' cannot be used as a JSX component.
  Its type 'YakComponent<any>' is not a valid JSX element type.
```

**Root cause:** Bun installs packages as symlinks into a global cache at `~/.bun/install/cache/links/next-yak@X.Y.Z.../`. TypeScript follows the symlink and then resolves module imports (like `react`) by walking up ancestor directories from `~/.bun/install/cache/links/...` — a path that never reaches the project root, where `@types/react` is installed. Because `React.FunctionComponent` (which `YakComponent<T>` extends) is unresolved, TypeScript infers `YakComponent<any>` and rejects it as a JSX element type.

**Suggested fix in next-yak:** Add `"types"` conditions to all entries in the `exports` map in `package.json`. When Bun detects a `"types"` condition in the exports, it treats the package differently during installation — placing it into the project-local `node_modules/.bun/` folder rather than symlinking to the global cache. This makes TypeScript's ancestor directory search reach the project root where `@types/react` lives:

```diff
  "exports": {
    ".": {
      "import": "./dist/index.js",
-     "require": "./dist/index.cjs"
+     "require": "./dist/index.cjs",
+     "types": "./dist/index.d.ts"
    },
```

---

## Workarounds (consumer side)

### Fix TS2349 only

Add `"noUncheckedIndexedAccess": false` to the package-level tsconfig to override the root setting:

```json
{
  "compilerOptions": {
    "jsxImportSource": "next-yak",
    "noUncheckedIndexedAccess": false
  }
}
```

### Fix both errors via `bun patch`

```bash
bun patch next-yak
# Add "types" entries to package.json exports, then:
bun patch --commit next-yak
```

This causes Bun to copy the patched package into the project-local `node_modules/.bun/` folder, making TypeScript's ancestor search reach `@types/react`.

## Environment

- `next-yak`: 9.4.1
- Bun: 1.3.x (symlink-based package manager)
- TypeScript: 5.8.x
- React: 19.x
