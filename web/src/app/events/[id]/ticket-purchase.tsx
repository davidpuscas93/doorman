"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/common/auth/auth-context";

import { formatPrice } from "@/common/helpers/price.helpers";
import {
  formatCountdown,
  subscribeToSecond,
  getNowSeconds,
  getServerNowSeconds,
} from "@/common/helpers/time.helpers";

type TicketTier = {
  id: string;
  name: string;
  price: number;
  available: number;
};

type HeldTicket = {
  id: string;
  ticketTypeId: string;
  heldUntil: string;
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
  const [isReleasing, setIsReleasing] = useState(false);

  const heldByTier = held.reduce<Record<string, number>>((counts, ticket) => {
    counts[ticket.ticketTypeId] = (counts[ticket.ticketTypeId] ?? 0) + 1;
    return counts;
  }, {});

  const nowSeconds = useSyncExternalStore(
    subscribeToSecond,
    getNowSeconds,
    getServerNowSeconds,
  );

  const expiresAtSeconds = held.length
    ? Math.min(
        ...held.map((t) => Math.floor(new Date(t.heldUntil).getTime() / 1000)),
      )
    : null;

  const secondsLeft = expiresAtSeconds
    ? Math.max(0, expiresAtSeconds - nowSeconds)
    : 0;

  const hasExpired = expiresAtSeconds !== null && secondsLeft === 0;

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
      router.refresh();
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

  async function handleRelease() {
    setIsReleasing(true);

    try {
      const response = await authFetch("/tickets/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        setError(body?.message ?? "Could not release those tickets.");
        return;
      }

      setError(null);
      setHeld([]);

      router.refresh();
    } finally {
      setIsReleasing(false);
    }
  }

  useEffect(() => {
    if (!user) return;

    let ignore = false;

    async function loadHolds() {
      const response = await authFetch(`/tickets/holds?eventId=${eventId}`);
      if (!response.ok) return;

      const tickets = (await response.json()) as HeldTicket[];
      if (!ignore) setHeld(tickets);
    }

    void loadHolds();

    return () => {
      ignore = true;
    };
  }, [user, eventId, authFetch]);

  useEffect(() => {
    if (!expiresAtSeconds) return;

    const timer = setTimeout(
      () => {
        setHeld([]);
        setError("Your hold expired.");
        router.refresh();
      },
      expiresAtSeconds * 1000 - Date.now(),
    );

    return () => clearTimeout(timer);
  }, [expiresAtSeconds, router]);

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
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {hasExpired
              ? "Hold expired"
              : `On hold · expires in ${formatCountdown(secondsLeft)}`}
          </div>
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
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          {!hasExpired && (
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isCheckingOut || isReleasing}
              style={{
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
          <button
            type="button"
            onClick={handleRelease}
            disabled={isCheckingOut || isReleasing}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              border: "1px solid #e2e5e9",
              borderRadius: 6,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Release
          </button>
        </div>
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
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 16,
            }}
          >
            {purchase.tickets.map((ticket) => (
              <li
                key={ticket.id}
                style={{
                  background: "#fff",
                  border: "1px solid #cfe3e1",
                  borderRadius: 6,
                  padding: 12,
                  display: "grid",
                  justifyItems: "center",
                  gap: 8,
                }}
              >
                <QRCodeSVG value={ticket.qrCode} size={120} level="M" />
                <code
                  style={{
                    fontSize: 11,
                    color: "#666",
                    wordBreak: "break-all",
                  }}
                >
                  {ticket.qrCode}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
