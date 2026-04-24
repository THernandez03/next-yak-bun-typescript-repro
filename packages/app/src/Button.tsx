import { styled } from 'next-yak'

// ERROR 1: TS2349 "This expression is not callable"
// Triggered by: jsxImportSource "next-yak" + noUncheckedIndexedAccess: true
//
// YakJSX.IntrinsicElements is a mapped type:
//   type IntrinsicElements = { [K in keyof React.JSX.IntrinsicElements]: React.JSX.IntrinsicElements[K] & YakAttrs }
//
// noUncheckedIndexedAccess: true causes the [K] indexed access to be typed as T | undefined,
// so styled.div becomes LiteralWithAttrs<...> | undefined — not callable.
const Button = styled.button`
  background: blue;
  color: white;
`

// ERROR 2: TS2786 "'StyledButton' cannot be used as a JSX component"
// Triggered by: Bun installs next-yak as a symlink into ~/.bun/install/cache/links/next-yak@X.Y.Z.../
//
// TypeScript resolves next-yak types from that global cache path and searches
// for 'react' by walking up ancestor directories from ~/.bun/install/cache/links/...
// — a path that never reaches the project root where @types/react is installed.
// React.FunctionComponent becomes unresolved → YakComponent<any> fails the JSX element type check.
const StyledButton = styled(Button)`
  padding: 8px 16px;
`

export function App() {
  return <StyledButton>Click me</StyledButton>
}
