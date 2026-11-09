-- V4.418: تخطيط شاشة الأرصدة الشخصي لكل مستخدم في Supabase (بدل خصائص السكربت GL_BALU_<user>).
-- شغّل هذا الملف قبل 043 إن لم يكن 043 مشغّلاً بعد، أو بعده ثم أعد تشغيل 043 (create or replace) — يلزم الجدول قبل استدعاء glx_bootstrap.
create table if not exists gl_bal_user (
  username text primary key,
  layout text not null default '',
  updated_at timestamptz not null default now()
);
alter table gl_bal_user enable row level security;   -- بلا سياسات: الوصول عبر الدوال security definer فقط
revoke all on gl_bal_user from anon, authenticated;

-- تنظيف التخطيط (مطابق لـ _glBalSanitize_ في Accounts.gs)
create or replace function _glx_bal_clean(p_layout text) returns text language plpgsql immutable as
$$ declare
  L jsonb; c jsonb; g jsonb; secs jsonb := '[]'; o jsonb; ids text[] := '{}'; id text; i int := 0; j int; grp jsonb; typ text; out text;
begin
  begin L := p_layout::jsonb; exception when others then raise exception 'تخطيط غير صالح'; end;
  if L is null or jsonb_typeof(L -> 'secs') <> 'array' then raise exception 'تخطيط غير صالح'; end if;
  for c in select e from jsonb_array_elements(L -> 'secs') e limit 30 loop
    i := i + 1;
    typ := c ->> 't';
    if typ is null or typ not in ('acc', 'top') then continue; end if;
    id := left(regexp_replace(coalesce(c ->> 'id', ''), '[^A-Za-z0-9_-]', '', 'g'), 24);
    if id = '' then id := 's' || (i - 1); end if;
    while id = any(ids) loop id := id || 'x'; end loop;
    ids := ids || id;
    o := jsonb_build_object('id', id, 't', typ,
      'title', coalesce(nullif(left(btrim(regexp_replace(coalesce(c ->> 'title', ''), '[<>]', '', 'g')), 60), ''), 'قسم'),
      'icon', left(btrim(regexp_replace(coalesce(c ->> 'icon', ''), '[<>]', '', 'g')), 4),
      'color', case when (c ->> 'color') ~ '^#[0-9a-fA-F]{6}$' then c ->> 'color' else '#475569' end,
      'off', case when coalesce(c ->> 'off', '') in ('', '0', 'false') then 0 else 1 end);
    if typ = 'acc' then
      o := o || jsonb_build_object(
        'prefixes', coalesce((select jsonb_agg(v) from (select left(regexp_replace(x, '[^0-9A-Za-z_.\-]', '', 'g'), 24) v from jsonb_array_elements_text(case when jsonb_typeof(c -> 'prefixes') = 'array' then c -> 'prefixes' else '[]'::jsonb end) x limit 20) q where v <> ''), '[]'::jsonb),
        'extra', coalesce((select jsonb_agg(v) from (select left(regexp_replace(x, '[^0-9A-Za-z_.\-]', '', 'g'), 24) v from jsonb_array_elements_text(case when jsonb_typeof(c -> 'extra') = 'array' then c -> 'extra' else '[]'::jsonb end) x limit 400) q where v <> ''), '[]'::jsonb),
        'hide', coalesce((select jsonb_agg(v) from (select left(regexp_replace(x, '[^0-9A-Za-z_.\-]', '', 'g'), 24) v from jsonb_array_elements_text(case when jsonb_typeof(c -> 'hide') = 'array' then c -> 'hide' else '[]'::jsonb end) x limit 400) q where v <> ''), '[]'::jsonb),
        'order', coalesce((select jsonb_agg(v) from (select left(regexp_replace(x, '[^0-9A-Za-z_.\-]', '', 'g'), 24) v from jsonb_array_elements_text(case when jsonb_typeof(c -> 'order') = 'array' then c -> 'order' else '[]'::jsonb end) x limit 400) q where v <> ''), '[]'::jsonb));
    else
      grp := '[]'; j := 0;
      for g in select e from jsonb_array_elements(case when jsonb_typeof(c -> 'groups') = 'array' then c -> 'groups' else '[]'::jsonb end) e limit 10 loop
        j := j + 1;
        if left(regexp_replace(coalesce(g ->> 'prefix', ''), '[^0-9]', '', 'g'), 12) = '' then continue; end if;
        grp := grp || jsonb_build_array(jsonb_build_object(
          'k', coalesce(nullif(left(regexp_replace(coalesce(g ->> 'k', ''), '[^A-Za-z0-9_-]', '', 'g'), 24), ''), 'g' || (j - 1)),
          'title', coalesce(nullif(left(btrim(regexp_replace(coalesce(g ->> 'title', ''), '[<>]', '', 'g')), 60), ''), 'g' || (j - 1)),
          'prefix', left(regexp_replace(coalesce(g ->> 'prefix', ''), '[^0-9]', '', 'g'), 12),
          'dir', case when g ->> 'dir' = 'cr' then 'cr' else 'dr' end,
          'n', greatest(1, least(50, coalesce(nullif(regexp_replace(coalesce(g ->> 'n', ''), '[^0-9]', '', 'g'), '')::int, 10)))));
      end loop;
      o := o || jsonb_build_object('groups', grp);
    end if;
    secs := secs || jsonb_build_array(o);
  end loop;
  out := jsonb_build_object('v', 1, 'secs', secs)::text;
  if length(out) > 8500 then raise exception 'التخطيط كبير جداً — قلّل عدد الأقسام/الحسابات المخصَّصة'; end if;
  return out;
end $$;

-- حفظ/تصفير تخطيط المستخدم الشخصي (scope=mine فقط؛ العام يبقى بـ glSaveSettings)
create or replace function glx_bal_save(p_layout text default '', p_scope text default 'mine') returns jsonb
language plpgsql volatile security definer set search_path = public as
$$ declare u text := lower(coalesce(app_user(), '')); js text; on_ boolean;
begin
  perform _glx_need(null);
  if u = '' then raise exception 'غير مسجَّل' using errcode = '42501'; end if;
  if p_scope is distinct from 'mine' then raise exception 'تخطيط عام: Apps Script' using errcode = '0A000'; end if;
  select coalesce(max(btrim(coalesce(value, ''))), '') = 'نعم' into on_ from gl_settings where key = 'bal_user_cust';
  if not on_ and not app_has('admin') then raise exception 'تخصيص الأرصدة الشخصي غير مفعَّل — اطلب من المدير تفعيل «تخصيص الصلاحيات»'; end if;
  js := case when coalesce(p_layout, '') = '' then '' else _glx_bal_clean(p_layout) end;
  if js = '' then delete from gl_bal_user where username = u;
  else insert into gl_bal_user(username, layout, updated_at) values (u, js, now())
       on conflict (username) do update set layout = excluded.layout, updated_at = now(); end if;
  return jsonb_build_object('success', true, 'scope', 'mine', 'layout', js);
end $$;
revoke all on function glx_bal_save(text, text) from public, anon;
grant execute on function glx_bal_save(text, text) to authenticated, service_role;
