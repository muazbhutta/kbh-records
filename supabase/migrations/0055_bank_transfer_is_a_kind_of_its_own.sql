-- Bank transfer is a kind of its own.
--
-- A great deal of what this company spends never passes through
-- anybody's hand: it leaves the bank, and the bill that comes back is
-- a transaction receipt, not a shop's invoice and not a petty slip.
-- The office has been filing those under whichever of the three fitted
-- worst, and could not pull them out again.
--
-- There was no other way to tell them apart. An expense has never
-- carried how it was paid - pay_method is null on all 382 of them,
-- and is only filled in for money handed to a man. The note mentions a
-- transfer in nine, seven of which are labour. So the kind is where it
-- goes, the same way labour did.
--
-- Nothing but the value is added here. Postgres will not let a new
-- enum value be used in the transaction that creates it.

alter type public.expense_kind add value if not exists 'bank_transfer';
