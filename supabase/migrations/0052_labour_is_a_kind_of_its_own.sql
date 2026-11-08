-- Labour is a kind of its own.
--
-- Petty and Invoice ask what the paper is. Labour is the honest third
-- answer: a man paid for his day's work, with a chit at best and often
-- nothing a tax office would recognise. Forcing it to be "Petty" put
-- the biggest regular outgoing on the site in the same pile as a bottle
-- of water, and left the office no way to pull it out again.
--
-- Nothing but the value is added here. Postgres will not let a new enum
-- value be used in the transaction that creates it, so everything that
-- reads or writes it waits for the next migration.

alter type public.expense_kind add value if not exists 'labour';
