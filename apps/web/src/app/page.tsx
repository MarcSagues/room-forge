import Link from 'next/link';

// Placeholder landing. The real landing (P8-01) must not load three.js.
export default function HomePage() {
  return (
    <main>
      <h1>RoomForge</h1>
      <p>Design rooms, offices and gaming setups in 3D.</p>
      <Link href="/editor/">Open the editor</Link>
    </main>
  );
}
