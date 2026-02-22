alter table public.firm_billing
  alter column trial_remaining set default 1;

update public.firm_billing
set trial_remaining = least(trial_remaining, 1),
    updated_at = now()
where trial_remaining > 1;

