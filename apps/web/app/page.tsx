// Placeholder landing page. The Designer agent will replace this with the real,
// styled dashboard shell.
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '3rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>
        Agent Control Plane
      </h1>
      <p style={{ margin: 0, color: '#444' }}>
        Open-source control plane for AI agents. Self-hosted.
      </p>
      <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>
        Foundation is up. Design system and features are on the way.
      </p>
    </main>
  );
}
