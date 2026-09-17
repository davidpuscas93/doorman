import Link from "next/link";

type EventListItem = {
  id: string;
  title: string;
  startsAt: string;
  organizer: string | null;
  available: number;
};

async function getEvents(): Promise<EventListItem[]> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/events?limit=20`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load events: ${response.status}`);
  }

  return response.json();
}

export default async function HomePage() {
  const events = await getEvents();

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      <h1>Events</h1>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {events.map((event) => (
          <li key={event.id}>
            <Link href={`/events/${event.id}`} className="event-card">
              <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{event.title}</h2>

              <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
                {new Date(event.startsAt).toLocaleDateString("ro-RO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {event.organizer ? ` · ${event.organizer}` : ""}
              </p>

              <p style={{ margin: "8px 0 0", fontSize: 14 }}>
                {event.available > 0
                  ? `${event.available} tickets available`
                  : "Sold out"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
