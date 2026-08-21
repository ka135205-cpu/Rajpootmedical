# Offline Sync Architecture (Decision #2)

## What "offline" means here

Only **sales** are supported offline (POS is the operation a cashier genuinely
needs mid-shift with no internet). Purchases, returns, expenses, customer/supplier
management, and reports all require connectivity — these are lower-frequency,
back-office operations where "wait until you're back online" is an acceptable and
much safer default than building conflict resolution for every table.

## Client-side storage: IndexedDB (via `idb-keyval`)

Lightweight, no server component, standard PWA pattern. Two stores:

- `product_cache` — a periodically-refreshed read-only snapshot of
  `product_batches_pos_view` (product name, batch id, quantity, selling price,
  expiry) for the current store, refreshed every successful online load. This is
  what POS search uses when offline — **advisory only**, exactly like the online
  client-side cart math (see architecture §7): it lets the cashier see roughly what's
  in stock and complete a plausible sale, but it is never treated as authoritative.
- `pending_sales_queue` — durable queue of not-yet-synced sale payloads:
  ```ts
  interface PendingSale {
    clientTransactionId: string;   // uuid v4, generated at creation time — this
                                    // IS the idempotency key
    items: { productId: string; quantity: number; unitDiscount: number }[];
    customerId: string | null;
    totalDiscount: number;
    amountPaid: number;
    paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'other';
    createdAt: string;             // local device timestamp, for display only
    status: 'pending' | 'syncing' | 'synced' | 'failed';
    lastError?: string;
    serverSaleId?: string;         // filled in once synced
  }
  ```

## Flow

1. **Online, normal case**: `process_sale` RPC is called directly with
   `p_client_transaction_id = null` (or a generated id, doesn't matter — it just
   won't collide with anything since it's new). No queue involved.
2. **Offline**: `navigator.onLine === false` (plus an active health-check ping,
   since `navigator.onLine` alone is unreliable) → the app disables nothing about
   adding to cart, but on "Complete Sale":
   - Generates a `clientTransactionId` (uuid v4).
   - Validates against the **local cached** stock snapshot only (best-effort check,
     clearly labeled in the UI as "estimated stock").
   - Writes a `PendingSale` row to `pending_sales_queue` with `status: 'pending'`.
   - Immediately renders a receipt marked **"OFFLINE — pending sync"** so the
     cashier can still hand something to the customer; this receipt is NOT a
     database record yet.
3. **Reconnection**: an `online` event listener (+ 30s polling fallback, since
   `online` events are not fully reliable on Android Chrome) triggers the sync
   manager:
   - For each `pending` row, call `process_sale(items, customer_id, total_discount,
     amount_paid, payment_method, client_transaction_id)`.
   - On success: mark `status: 'synced'`, store `serverSaleId`, keep the record in
     IndexedDB for a grace period (e.g. 7 days) so "pending/synced transactions"
     stay visible per Decision #2, then prune.
   - On a **business-rule failure** (e.g. `Insufficient non-expired stock...`
     raised by the function because real stock had actually run out while
     offline): mark `status: 'failed'`, store `lastError`, and **surface it in a
     dedicated "Sync Issues" screen** — never silently drop or silently adjust
     the sale. The owner/cashier must manually resolve (edit quantity and
     resubmit, or cancel and refund the customer if goods were already handed
     over). This is the documented conflict-handling behavior requested.
   - On a **network failure mid-sync**: row stays `pending`, retried on next sync
     cycle. Because `process_sale` checks `client_transaction_id` first and
     returns the existing sale id if already committed, a retry after a response
     that was lost in transit (server actually succeeded, client never got the
     reply) is safe — it will not create a duplicate sale.

## Multi-device conflict scenario (explicitly addressed per your requirement)

Two devices (e.g. phone + laptop) both go offline, each sell the last 3 units of
the same batch from their local cache (which both showed 5 units available before
disconnecting). Whichever device syncs **first** succeeds normally. The **second**
device's sync call to `process_sale` will hit real, live stock validation inside
the function (it always re-checks actual `product_batches` rows, never trusts the
client) — if the batch (and no later-expiring batch) has enough remaining stock,
FEFO just pulls from the next batch and it succeeds transparently. If genuinely not
enough stock exists anywhere, the function raises an exception, the second device's
sale is marked `failed` with a clear message, and it is queued in "Sync Issues" for
the owner to resolve manually (e.g. contact the customer, substitute a product,
or process as a backorder outside the system). **Nothing is ever silently
overwritten** — nothing about the first device's already-committed sale changes,
and the second device's attempt is never force-completed against reality.

## What is explicitly out of scope for this version

- Offline purchases, returns, expenses, or customer/supplier edits.
- Editing/canceling an *already-synced* offline sale from the same offline flow
  (use the normal online return/adjustment process for that).
- Automatic conflict resolution (e.g. auto-splitting a short sale) — all conflicts
  are surfaced for a human decision, per your explicit "do not silently overwrite"
  requirement.

## Implementation files (this handoff)

- `lib/offline/db.ts` — IndexedDB wrapper (product cache + pending queue).
- `lib/offline/queue.ts` — enqueue/dequeue/status API used by the POS screen.
- `lib/offline/sync.ts` — the sync manager (online listener, retry loop, calls
  `process_sale` RPC).
- `lib/offline/useOnlineStatus.ts` — React hook powering the "You're offline"
  banner.

These are provided as a working starting skeleton, not a finished POS UI — Claude
Code should wire them into the actual POS cart component in a later phase once the
POS screen itself is built (per your original Phase 7).
