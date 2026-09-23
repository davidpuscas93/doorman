"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/common/auth/auth-context";
import { formatPrice } from "@/common/helpers/price.helpers";

type TicketTier = {
  id: string;
  name: string;
  price: number;
  available: number;
};

type HeldTicket = {
  id: string;
  ticketTypeId: string;
};

type PurchasedTicket = {
  id: string;
  ticketTypeId: string;
  qrCode: string;
};

type Purchase = {
  transaction: { id: string; amount: number };
  tickets: PurchasedTicket[];
};

export function TicketPurchase({
  eventId,
  ticketTypes,
}: {
  eventId: string;
  ticketTypes: TicketTier[];
}) {
  const router = useRouter();
  const { user, isLoading, authFetch } = useAuth();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [held, setHeld] = useState<HeldTicket[]>([]);
  const [pendingTierId, setPendingTierId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const heldByTier = held.reduce<Record<string, number>>((counts, ticket) => {
    counts[ticket.ticketTypeId] = (counts[ticket.ticketTypeId] ?? 0) + 1;
    return counts;
  }, {});

  async function handleHold(tier: TicketTier) {
    setPendingTierId(tier.id);
    const timer = setTimeout(() => setShowPending(true), 200);

    try {
      const response = await authFetch("/tickets/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketTypeId: tier.id,
          quantity: quantities[tier.id] ?? 1,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        setError(body?.message ?? "Could not hold those tickets.");
        return;
      }

      setError(null);
      const tickets = (await response.json()) as HeldTicket[];
      setHeld((current) => [...current, ...tickets]);
    } finally {
      clearTimeout(timer);
      setShowPending(false);
      setPendingTierId(null);
    }
  }

  async function handleCheckout() {
    setIsCheckingOut(true);

    try {
      const response = await authFetch("/tickets/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        setError(body?.message ?? "Could not complete the purchase.");
        return;
      }

      setError(null);
      setPurchase((await response.json()) as Purchase);
      setHeld([]);
      router.refresh();
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {ticketTypes.map((tier) => (
          <li
            key={tier.id}
            style={{
              background: "#fff",
              border: "1px solid #E2E5E9",
              borderRadius: 6,
              padding: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{tier.name}</div>
              <div style={{ fontSize: 14, color: "#666" }}>
                {tier.available > 0
                  ? `${tier.available} available`
                  : "Sold out"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatPrice(tier.price)}
              </span>

              {isLoading ? null : !user ? (
                <Link href="/login" style={{ fontSize: 14 }}>
                  Sign in to buy
                </Link>
              ) : tier.available === 0 ? null : (
                <>
                  <input
                    type="number"
                    min={1}
                    max={Math.min(10, tier.available)}
                    value={quantities[tier.id] ?? 1}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [tier.id]: Number(event.target.value),
                      }))
                    }
                    style={{
                      width: 56,
                      padding: 6,
                      fontSize: 14,
                      border: "1px solid #e2e5e9",
                      borderRadius: 6,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleHold(tier)}
                    disabled={pendingTierId === tier.id}
                    style={{
                      padding: "8px 14px",
                      fontSize: 14,
                      border: "none",
                      borderRadius: 6,
                      background: "#0e6b65",
                      color: "#fff",
                      cursor: "pointer",
                      minWidth: 88,
                    }}
                  >
                    {showPending && pendingTierId === tier.id
                      ? "Holding..."
                      : "Hold"}
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p
          role="alert"
          style={{ marginTop: 12, fontSize: 14, color: "#b3261e" }}
        >
          {error}
        </p>
      )}

      {held.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 14 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>On hold</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ticketTypes
              .filter((tier) => heldByTier[tier.id])
              .map((tier) => (
                <li key={tier.id}>
                  {heldByTier[tier.id]} × {tier.name} —{" "}
                  {formatPrice(heldByTier[tier.id] * tier.price)}
                </li>
              ))}
          </ul>
        </div>
      )}

      {held.length > 0 && !purchase && (
        <button
          type="button"
          onClick={handleCheckout}
          disabled={isCheckingOut}
          style={{
            marginTop: 12,
            padding: "10px 16px",
            fontSize: 14,
            border: "none",
            borderRadius: 6,
            background: "#0e6b65",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Complete purchase
        </button>
      )}

      {purchase && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            border: "1px solid #cfe3e1",
            background: "#f2f8f7",
            borderRadius: 6,
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>
            {purchase.tickets.length} ticket
            {purchase.tickets.length === 1 ? "" : "s"} bought
          </h3>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#666" }}>
            Paid {formatPrice(purchase.transaction.amount)}
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 4,
            }}
          >
            {purchase.tickets.map((ticket) => (
              <li
                key={ticket.id}
                style={{ fontSize: 13, fontFamily: "ui-monospace, monospace" }}
              >
                {ticket.qrCode}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
