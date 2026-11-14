-- V4.459: موصلات الشيتات تُحسب على حصة UrlFetch اليومية لحساب Google (≈20,000/يوم لحساب شخصي) — كل شيت موصول كان يتصل كل دقيقة (1,440/يوم لكل شيت).
-- التعديل داخل الشيت يُرسل فوراً عبر onEdit/onChange، فالدورة المجدولة لسحب كتابات البرنامج للشيت فقط ⇒ الحجوزات كل 5 دقائق، شيتات العهد كل 15 على الأقل.
update cs_sheets set every_min = 5 where code like 'HBSRC:%' and every_min < 5;
update cs_sheets set every_min = 15 where code not like 'HBSRC:%' and every_min < 15;
select code, every_min from cs_sheets order by code;
