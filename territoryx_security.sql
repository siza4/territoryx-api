-- ═══════════════════════════════════════════════════════════════════════════
-- TerritoryX — Security & Integrity Migration
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (uses CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ADMIN RLS POLICIES ──────────────────────────────────────────────────
-- Lets the admin panel read/approve every user's credit application instead
-- of only its own row. Role is read from app_metadata, which only YOU can set
-- (Supabase Dashboard → Authentication → Users → edit user → App Metadata:
--   {"role": "admin"} ), never from user_metadata, which the user controls.

alter table credit_accounts enable row level security;
alter table bids enable row level security;
alter table territories enable row level security;
alter table invoices enable row level security;

drop policy if exists "own_read_credit" on credit_accounts;
create policy "own_read_credit" on credit_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "own_insert_credit" on credit_accounts;
create policy "own_insert_credit" on credit_accounts for insert
  with check (auth.uid() = user_id);

-- Regular users may NOT update their own credit_accounts row (status, limit,
-- available, used). Only an admin can change those — this is what stops a
-- user from upserting themselves unlimited credit via devtools.
drop policy if exists "admin_all_credit" on credit_accounts;
create policy "admin_all_credit" on credit_accounts for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "own_read_bids" on bids;
create policy "own_read_bids" on bids for select
  using (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Regular users may NOT insert bids directly (must go through place_bid()
-- below, which validates credit atomically). Admin keeps full access.
drop policy if exists "admin_all_bids" on bids;
create policy "admin_all_bids" on bids for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "public_read_territories" on territories;
create policy "public_read_territories" on territories for select using (true);

drop policy if exists "auth_write_territories" on territories;
create policy "auth_write_territories" on territories for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "own_read_invoices" on invoices;
create policy "own_read_invoices" on invoices for select
  using (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "own_write_invoices" on invoices;
create policy "own_write_invoices" on invoices for all
  using (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- ── 2. ATOMIC, SERVER-VALIDATED BID PLACEMENT ──────────────────────────────
-- Replaces "trust the browser's math" with a single transaction that:
--  - confirms the bidder actually has an ACTIVE credit account
--  - confirms the bid beats the current price by the minimum increment
--  - releases this bidder's own previous bid on the territory (if any)
--  - releases the previous leader's reserved credit (if a different company)
--  - inserts the bid and decrements available credit, all atomically
-- This is what the client now calls via supabase.rpc('place_bid', ...).

create or replace function place_bid(p_territory_id text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_credit credit_accounts%rowtype;
  v_toll numeric;
  v_total numeric;
  v_current_bid numeric;
  v_min_increment numeric := 1000;
  v_prev_own bids%rowtype;
  v_prev_leader bids%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select * into v_credit from credit_accounts where user_id = v_user for update;
  if not found or v_credit.status <> 'ACTIVE' then
    return jsonb_build_object('success', false, 'error', 'No active credit account');
  end if;

  select bid into v_current_bid from territories where id = p_territory_id for update;
  if v_current_bid is null then
    return jsonb_build_object('success', false, 'error', 'Unknown territory');
  end if;

  if p_amount < v_current_bid + v_min_increment then
    return jsonb_build_object('success', false, 'error',
      'Bid must be at least ' || (v_current_bid + v_min_increment)::text);
  end if;

  v_toll := floor(p_amount * 0.05);
  v_total := p_amount + v_toll;

  -- release this user's own previous accepted bid on this territory
  select * into v_prev_own from bids
    where user_id = v_user and territory_id = p_territory_id and status = 'ACCEPTED'
    limit 1;
  if found then
    update credit_accounts set
      used = used - (v_prev_own.amount + v_prev_own.toll_buffer),
      available = available + (v_prev_own.amount + v_prev_own.toll_buffer)
      where user_id = v_user;
    update bids set status = 'OUTBID' where id = v_prev_own.id;
    select * into v_credit from credit_accounts where user_id = v_user;
  end if;

  if v_credit.available < v_total then
    return jsonb_build_object('success', false, 'error',
      'Insufficient credit. Available: ' || v_credit.available::text);
  end if;

  -- release the current leader's reserved credit, if it's a different company
  select * into v_prev_leader from bids
    where territory_id = p_territory_id and status = 'ACCEPTED' and user_id <> v_user
    order by created_at desc limit 1;
  if found then
    update credit_accounts set
      used = used - (v_prev_leader.amount + v_prev_leader.toll_buffer),
      available = available + (v_prev_leader.amount + v_prev_leader.toll_buffer)
      where user_id = v_prev_leader.user_id;
    update bids set status = 'OUTBID' where id = v_prev_leader.id;
  end if;

  insert into bids (user_id, territory_id, amount, toll_buffer, status)
    values (v_user, p_territory_id, p_amount, v_toll, 'ACCEPTED');

  update credit_accounts set
    used = used + v_total,
    available = available - v_total
    where user_id = v_user;

  update territories set
    bid = p_amount,
    pending_brand = (select company_profile->>'company' from credit_accounts where user_id = v_user),
    pending_color = '#00F2FE',
    pending_tagline = 'New market leader'
    where id = p_territory_id;

  return jsonb_build_object('success', true, 'amount', p_amount, 'toll', v_toll);
end;
$$;

grant execute on function place_bid(text, numeric) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- After running this file:
-- 1. Set your own user to admin: Dashboard → Authentication → Users → your
--    account → App Metadata → {"role": "admin"} → Save.
-- 2. Sign out and back in on the site so the new JWT carries the role claim.
-- ═══════════════════════════════════════════════════════════════════════════
