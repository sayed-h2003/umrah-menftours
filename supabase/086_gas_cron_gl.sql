-- V4.464: خطوات الحسابات الجانبية (طابور عمليات الحسابات، الترحيل اللحظي لتعديلات الشيت، بوت الحسابات، مزامنة العهدة) بمهمة منفصلة كل 5 دقائق —
-- كانت تعمل داخل مهمة تليجرام كل دقيقة فتحمّل سطور القيود كلها كل دقيقة (ضغط على قاعدة البيانات وتأخر الشاشات).
select cron.unschedule(jobid) from cron.job where jobname = 'gas-gl-tick';
select cron.schedule('gas-gl-tick', '*/5 * * * *', $$select gas_cron_fire('supaCronGl')$$);
-- مهلة استعلامات دالة gas: 45 ثانية (120 كانت تسمح لاستعلام ثقيل بحجز الاتصالات طويلاً)
alter role service_role set statement_timeout = '45s';
notify pgrst, 'reload config';
select jobname, schedule, active from cron.job where jobname like 'gas-%' order by jobname;
