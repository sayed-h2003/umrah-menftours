-- 014_audit_fix.sql — إصلاح جدول audit_log (عمود action غير موجود في ذاكرة PostgREST) — الجدول نسخة مؤقتة فيُعاد بناؤه بأمان
drop table if exists audit_log;
create table audit_log (
  src          text   not null,
  rn           bigint not null,
  ts_str       text   not null default '-',
  ts_ms        float8,
  t_ms         float8 not null default 0,
  username     text   not null default '-',
  action       text   not null default '-',
  record_id    text   not null default '-',
  field        text   not null default '-',
  old_value    text   not null default '-',
  new_value    text   not null default '-',
  screen       text   not null default 'other',
  screen_label text   not null default 'أخرى',
  primary key (src, rn)
);
alter table audit_log enable row level security;
revoke all on audit_log from anon, authenticated;
grant all on audit_log to service_role;
notify pgrst, 'reload schema';
