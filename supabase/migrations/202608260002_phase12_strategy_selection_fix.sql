-- Keep both seeded BTTS selections eligible; the strategy already carries a selections array.

update public.strategies
set config_json = config_json - 'selection',
    updated_at = now()
where slug = 'btts-prematch';
