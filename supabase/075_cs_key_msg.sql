-- V4.447: رفض مفتاح الموصل يذكر كود العهدة (كان «مفتاح الموصل غير صحيح» بلا تحديد ⇒ يتكرر كل دقيقة بسجل Supabase دون معرفة أي شيت)
do $$ declare r record; d text; begin
  for r in select p.oid, p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('cs_push', 'cs_ack', 'cs_stamps') and pg_get_functiondef(p.oid) like '%مفتاح الموصل غير صحيح%'
              and pg_get_functiondef(p.oid) not like '%مفتاح الموصل غير صحيح (%' loop
    d := replace(pg_get_functiondef(r.oid), 'raise exception ''مفتاح الموصل غير صحيح'' using', 'raise exception ''مفتاح الموصل غير صحيح — عهدة %'', p_code using');
    execute d;
  end loop;
end $$;
