export default function Loading() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>Events</h1>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {[0, 1, 2, 3].map((index) => (
          <li
            key={index}
            style={{
              background: "#fff",
              border: "1px solid #e2e5e9",
              borderRadius: 6,
              padding: 16,
              height: 92,
            }}
            aria-hidden
          />
        ))}
      </ul>
      <span className="sr-only" role="status">
        Loading events
      </span>
    </main>
  );
}
