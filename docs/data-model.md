```mermaid
erDiagram
    USER        ||--o{ EVENT        : organizes
    USER        ||--o{ TRANSACTION  : makes
    USER        |o--o{ TICKET       : holds

    EVENT       ||--o{ TRANSACTION  : receives
    EVENT       ||--o{ TICKET       : sells
    EVENT       ||--o{ TICKET_TYPE  : offers

    TICKET_TYPE ||--o{ TICKET       : instantiates

    TRANSACTION |o--o{ TICKET       : "pays for"

    USER {
        uuid        id              PK
        text        name
        text        email
        text        description
        text        role
        timestamptz created_at
        timestamptz updated_at
    }

    EVENT {
        uuid        id              PK
        text        title
        text        description
        text        location
        timestamptz starts_at
        uuid        user_id         FK
        timestamptz created_at
        timestamptz updated_at
    }

    TICKET {
        uuid        id              PK
        text        status
        text        qr_code
        uuid        event_id        FK
        uuid        ticket_type_id  FK
        uuid        held_by_user_id FK  "nullable"
        uuid        transaction_id  FK  "nullable"
        timestamptz held_until          "nullable"
        timestamptz scanned_at          "nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    TICKET_TYPE {
        uuid        id              PK
        text        name
        int         price
        int         total
        uuid        event_id        FK
        timestamptz created_at
        timestamptz updated_at
    }

    TRANSACTION {
        uuid        id              PK
        int         amount
        text        status
        uuid        event_id        FK
        uuid        user_id         FK
        timestamptz created_at
        timestamptz updated_at
    }
```

- Availability is derived by counting ticket rows, not stored as a counter, because a stored counter drifts under concurrent writes.
- Tickets are pre-created per ticket type so each one can be locked individually.
- ticket.event_id is denormalised for query speed; safe because it's immutable, unlike a counter.
- Holds expire by timestamp rather than by a background job — an expired hold is treated as available at read time.
- Money is stored as integer minor units.
