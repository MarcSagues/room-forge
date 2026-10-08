import { CORE_PACKAGE_NAME } from '@roomforge/core';

// Placeholder editor route. The shell arrives with P1-06 and the 3D canvas with P2-06.
// The core import only proves the workspace wiring (web → core, transpiled by Next).
export default function EditorPage() {
  return (
    <main>
      <h1>Editor</h1>
      <p>Coming soon. Core package: {CORE_PACKAGE_NAME}</p>
    </main>
  );
}
