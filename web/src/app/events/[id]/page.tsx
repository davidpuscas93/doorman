import { notFound } from "next/navigation";
import Link from "next/link";

import { TicketPurchase } from "./ticket-purchase";

type TicketTier = {
  id: string;
  name: string;
  price: number;
  available: number;
};

type EventDetails = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  organizer: string | null;
  ticketTypes: TicketTier[];
};

async function getEvent(id: string): Promise<EventDetails | null> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/events/${id}`,
    {
      cache: "no-store",
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to load event: ${response.status}`);

  return response.json();
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) notFound();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <Link href="/" style={{ fontSize: 14, color: "#555" }}>
        ← All events
      </Link>
      <h1 style={{ margin: "16px 0 4px" }}>{event.title}</h1>

      <p style={{ margin: 0, color: "#666" }}>
        {new Date(event.startsAt).toLocaleDateString("ro-RO", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        {" · "}
        {event.location}
      </p>

      {event.organizer && (
        <p style={{ margin: "4px 0 0", color: "#666", fontSize: 14 }}>
          Organised by {event.organizer}
        </p>
      )}

      <h2 style={{ margin: "32px 0 12px", fontSize: 18 }}>Tickets</h2>

      <TicketPurchase key={event.id} eventId={event.id} ticketTypes={event.ticketTypes} />
    </main>
  );
}
