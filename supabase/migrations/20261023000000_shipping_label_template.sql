-- Apply after 20261022000000_admin_primary_workflow.sql.
-- Uses existing settings SELECT policy and admin-only UPDATE policy, unchanged.
-- Public-readable design preferences only: never store contacts or credentials here.
begin;
alter table public.settings add column if not exists shipping_label_template jsonb;
alter table public.settings drop constraint if exists zyha_label_template_shape;
alter table public.settings add constraint zyha_label_template_shape check (
    shipping_label_template is null or (
        jsonb_typeof(shipping_label_template) = 'object'
        and octet_length(shipping_label_template::text) <= 8192
        and (not shipping_label_template ? 'version' or shipping_label_template->'version' = '1'::jsonb)
    )
);
comment on column public.settings.shipping_label_template is
    'Versioned public label design only. NULL means built-in defaults. Admin writes via existing settings RLS.';
commit;