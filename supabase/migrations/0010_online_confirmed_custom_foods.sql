-- PostgreSQL requires an enum value to be committed before any dependent
-- constraint can use it. The columns and constraint follow in 0011.
alter type public.custom_food_type add value if not exists 'ONLINE_CONFIRMED';
