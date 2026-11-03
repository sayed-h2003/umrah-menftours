/* ============================================================================
   🚚 Migration.gs — نقل البيانات من الشيتات إلى Supabase (PostgreSQL) — المرحلة 2
   ----------------------------------------------------------------------------
   • لا يعدّل أي شيت ولا أي سلوك بالبرنامج. يقرأ فقط ويضخّ إلى Supabase عبر Data API (PostgREST).
   • الإعداد (مرة واحدة): Project Settings ← Script properties:
       SUPA_URL         = https://xxxx.supabase.co
       SUPA_SERVICE_KEY = مفتاح service_role  (سرّي — لا يوضع بالكود ولا بالواجهة أبداً)
   • التشغيل بالترتيب من المحرر:
       1) mgPing()      اختبار الاتصال والمفتاح
       2) mgDryRun()    فحص بلا كتابة: أعداد وأخطاء (تواريخ/مفاتيح مكررة/أيتام/مبالغ سالبة)
       3) mgRun()       النقل الفعلي (يستأنف تلقائياً كل دقيقة حتى ينتهي؛ آمن لإعادة التشغيل — upsert)
       4) mgVerify()    مطابقة الأعداد والأرصدة (GL + الحسابات + الوزارة + التأشيرات) — يُطبع بالسجل
       5) mgReport()    آخر تقرير
   • mgReset() يمسح جداول الوجهة (بترتيب عكسي) — لإعادة نقل نظيفة فقط.
   • ترتيب النقل: الآباء أولاً (المستخدمون ← الشركات ← العملاء ← الرحلات ← «ظلال» الأيتام) ثم التوابع.
   ============================================================================ */

var MG_BUDGET_MS_ = 270000;          // حد أمان قبل مهلة 6 دقائق
var MG_TOL_ = 0.01;                  // تفاوت المطابقة المالية
var MG_CTX_ = null;                  // سياق التشغيل الحالي: تحذيرات وتخطيات
var MG_CACHE_ = {};                  // قراءة كل ورقة مرة واحدة بالتنفيذ

/* ---------- أدوات التحويل ---------- */
function _mgTz_() { try { return (typeof _tz_ === 'function' && _tz_()) || 'Africa/Cairo'; } catch (e) { return 'Africa/Cairo'; } }
function _mgDigits_(s) { return String(s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); }); }
function _mgP2_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function _mgW_(key) { if (MG_CTX_) MG_CTX_.warn[key] = (MG_CTX_.warn[key] || 0) + 1; }
function _mgDate_(v, key) {
  if (v === '' || v === null || v === undefined) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : Utilities.formatDate(v, _mgTz_(), 'yyyy-MM-dd');
  var s = _mgDigits_(String(v)).trim(), m;
  if (!s) return null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) { if (+m[2] > 12 || +m[2] < 1) { _mgW_('تاريخ غير صالح ' + key); return null; } return m[3] + '-' + _mgP2_(m[2]) + '-' + _mgP2_(m[1]); }
  _mgW_('تاريخ غير مفهوم ' + key); return null;
}
function _mgTs_(v, key) {
  if (v === '' || v === null || v === undefined) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v.toISOString();
  var s = _mgDigits_(String(v)).trim(), m;
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})[ T]+(\d{1,2}):(\d{2})/))) { var d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])); return isNaN(d.getTime()) ? null : d.toISOString(); }
  if ((m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/))) return m[1] + 'T' + m[2] + ':00Z';
  var dd = _mgDate_(v, key); return dd ? dd + 'T00:00:00Z' : null;
}
function _mgTime_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : Utilities.formatDate(v, _mgTz_(), 'HH:mm');
  return String(v).trim() || null;
}
function _mgNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 1e4) / 1e4 : null;
  var s = _mgDigits_(String(v)).replace(/[,\s٬]/g, '').replace('٫', '.');
  if (!s || isNaN(+s)) return null;
  return Math.round(+s * 1e4) / 1e4;
}
function _mgInt_(v) { var n = _mgNum_(v); return n === null ? null : Math.round(n); }
function _mgBool_(v) {
  if (v === true) return true;
  if (v === false || v === '' || v === null || v === undefined) return false;
  return /^(true|1|yes|نعم|تم|معتمد|✓|✔|صح)/i.test(String(v).trim());
}
function _mgStr_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : Utilities.formatDate(v, _mgTz_(), 'yyyy-MM-dd HH:mm');
  var s = String(v).trim(); return s === '' ? null : s;
}
function _mgJson_(v, dflt) {
  if (v === null || v === undefined || v === '') return dflt;
  if (typeof v === 'object') return dflt;
  try { return JSON.parse(String(v)); } catch (e) { return { raw: String(v) }; }
}
function _mgPerms_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return [];
  if (s.charAt(0) === '[') { try { var a = JSON.parse(s); if (Array.isArray(a)) return a; } catch (e) {} }
  return s.split(/[,،;|]/).map(function (x) { return x.trim(); }).filter(Boolean);
}
function _mgRaw_(v) { return Object.prototype.toString.call(v) === '[object Date]' ? (isNaN(v.getTime()) ? null : v.toISOString()) : v; }

/* تحويل عمود حسب رمز النوع */
function _mgConv_(t, v, key) {
  switch (t) {
    case 's': return _mgStr_(v);
    case 'S': return _mgStr_(v) === null ? '' : _mgStr_(v);
    case 'n': return _mgNum_(v);
    case 'N0': var n = _mgNum_(v); return n === null ? 0 : n;
    case 'i': return _mgInt_(v);
    case 'd': return _mgDate_(v, key);
    case 't': return _mgTs_(v, key);
    case 'T': return _mgTs_(v, key) || MG_CTX_.now;
    case 'h': return _mgTime_(v);
    case 'b': return _mgBool_(v);
    case 'bt': return !(v === false || /^(false|0|no|لا|معطل|غير نشط)$/i.test(String(v === null || v === undefined ? '' : v).trim()));   // الافتراضي true
    case 'bn': return (v === '' || v === null || v === undefined) ? null : _mgBool_(v);
    case 'j': return _mgJson_(v, null);
    case 'ja': return _mgJson_(v, []);
    case 'jo': return _mgJson_(v, {});
    case 'cur': return _mgStr_(v) || 'EGP';
    case 'rate1': var r = _mgNum_(v); return r === null ? 1 : r;
  }
  return _mgStr_(v);
}

/* ---------- قراءة الأوراق ---------- */
function _mgSS_(which) { return which === 'gl' ? _glSS_() : getSpreadsheet_(); }
function _mgSheet_(which, name) {
  var k = which + '|' + name;
  if (MG_CACHE_[k] !== undefined) return MG_CACHE_[k];
  var sh = null; try { sh = _mgSS_(which).getSheetByName(name); } catch (e) { sh = null; }
  var out = { hdr: [], rows: [], missing: !sh };
  if (sh && sh.getLastRow() >= 1 && sh.getLastColumn() >= 1) {
    var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    out.hdr = vals[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
    out.rows = vals.slice(1).filter(function (r) { for (var i = 0; i < r.length; i++) { if (r[i] !== '' && r[i] !== null && r[i] !== undefined) return true; } return false; });
  }
  MG_CACHE_[k] = out; return out;
}

/* ---------- مواصفات الجداول (بترتيب النقل) ----------
   cols: [عمود قاعدة البيانات، اسم عمود الشيت أو رقمه، رمز النوع]
   req: أعمدة إلزامية (الصف بدونها يُتخطى ويُسجَّل) · extra: عمود jsonb لباقي الأعمدة
   fk: {عمود: مجموعة المراجع} — «stub» ينشئ ظلاً بالأب المفقود · «null» يصفّر المرجع · «skip» يتخطى الصف
   wipe: جدول بمفتاح تلقائي — يُمسح قبل أول دفعة (لتفادي التكرار عند إعادة التشغيل) */
var MG_SPECS_ = [
  { t: 'app_users', ss: 'main', sheet: 'Users', pk: ['username'], req: ['username', 'password_hash'], cols: [['username', 0, 'S'], ['password_hash', 1, 's'], ['full_name', 2, 's'], ['active', 3, 'bt'], ['permissions', 4, 'perms'], ['must_change_pwd', 5, 'b']] },
  { t: 'user_ui_prefs', ss: 'main', sheet: 'UserUiPrefs', pk: ['username', 'screen'], req: ['username', 'screen'], fk: { username: 'users' }, cols: [['username', 'المستخدم', 'S'], ['screen', 'الشاشة', 'S'], ['prefs', 'التفضيلات', 'jo'], ['updated_at', 'عُدّل في', 'T']] },
  { t: 'companies', ss: 'main', sheet: 'Agents_Settings', pk: ['name'], req: ['name'], extra: 'extra', konst: { kind: 'وكيل سعودي' }, cols: [['name', 0, 'S']] },
  { t: 'clients', ss: 'main', sheet: 'Clients', pk: ['name'], req: ['name'], cols: [['name', 'اسم العميل', 'S'], ['phone', 'رقم الجوال', 's'], ['notes', 'ملاحظات', 's']] },
  { t: 'trips', ss: 'main', sheet: 'Trips', pk: ['name'], req: ['name'], extra: 'extra', cols: [
    ['name', 'اسم الرحلة', 'S'], ['egypt_company', 'الشركة المصرية', 's'], ['saudi_agent', 'الوكيل السعودي', 's'], ['supervisor', 'المشرف', 's'], ['supervisor_role', 'دور المشرف', 's'],
    ['depart_date', 'تاريخ الذهاب', 'd'], ['return_date', 'تاريخ العودة', 'd'], ['airlines', 'الخطوط', 's'],
    ['madinah_hotel', 'سكن المدينة', 's'], ['madinah_in', 'تاريخ دخول المدينة', 'd'], ['madinah_out', 'تاريخ الخروج من المدينة', 'd'], ['madinah_nights', 'ليالي المدينة', 'i'],
    ['makkah_hotel', 'سكن مكة', 's'], ['makkah_in', 'تاريخ دخول مكة', 'd'], ['makkah_out', 'تاريخ الخروج من مكة', 'd'], ['makkah_nights', 'ليالي مكة', 'i'],
    ['linked_booking_no', 'رقم الإشعار المرتبط', 's'], ['ref_no', 'الرقم المرجعي', 's'], ['stay_direction', 'اتجاه الإقامة', 's'], ['reserved_seats', 'عدد الأماكن المحجوزة', 'i'],
    ['ticket_url', 'رابط تذكرة الرحلة', 's'], ['ticket_file_id', 'معرف تذكرة الرحلة', 's'], ['draft', 'مسودة الإشعار (JSON)', 'j'], ['created_at', 'تاريخ الإنشاء', 'T']], chunk: 100 },
  { t: 'client_links', ss: 'main', sheet: 'ClientLinks', pk: ['link_code'], req: ['link_code'], fk: { client_name: 'clients' }, cols: [['link_code', 'رمز الرابط', 'S'], ['trip_name', 'اسم الرحلة', 's'], ['client_name', 'العميل', 's'], ['active', 'نشط', 'bt'], ['created_by', 'أنشأه', 's'], ['created_at', 'تاريخ الإنشاء', 'T']] },
  { kind: 'stubs' },
  { t: 'pilgrims', ss: 'main', sheet: 'Pilgrims', pk: ['pilgrim_id'], req: ['name'], extra: 'extra', genId: 'pilgrim_id', fk: { client_name: 'clients', trip_name: 'trips' }, cols: [
    ['seq', 0, 'i'], ['name', 1, 'S'], ['passport_no', 2, 's'], ['gender', 3, 's'], ['client_name', 4, 's'], ['housing_kind', 5, 's'], ['room_no', 6, 's'], ['notes', 7, 's'], ['trip_name', 8, 's'], ['booking_no', 9, 's'],
    ['name_en', 10, 's'], ['birth_date', 11, 'd'], ['passport_issue', 12, 'd'], ['passport_expiry', 13, 'd'], ['pilgrim_id', 14, 'S'], ['mahram_id', 15, 's'], ['mahram_relation', 16, 's'],
    ['madinah_hotel', 17, 's'], ['makkah_hotel', 18, 's'], ['room_group', 19, 's'], ['not_housed', 20, 'b'], ['excluded_housing', 22, 'b'], ['madinah_room', 25, 's'], ['makkah_room', 26, 's']], chunk: 300 },
  { t: 'bookings', ss: 'main', sheet: 'Bookings', pk: ['booking_no'], req: ['booking_no'], extra: 'extra', rawExtra: ['مراجعة واعتماد'], cols: [
    ['booking_no', 'رقم الإشعار', 'S'], ['approved', 'مراجعة واعتماد', 'b'], ['saudi_agent', 'الوكيل السعودي', 's'], ['egypt_company', 'الشركة المصرية', 's'], ['group_nos', 'أرقام المجموعات', 's'], ['client_name', 'العميل', 's'], ['pax', 'العدد', 'i'], ['supervisor', 'المشرف', 's'],
    ['travel_mode', 'وسيلة السفر', 's'], ['arrival_port', 'منفذ الوصول', 's'], ['arrival_date', 'تاريخ الوصول', 'd'], ['arrival_time', 'ساعة الوصول', 'h'], ['arrival_flight', 'رقم رحلة الوصول', 's'],
    ['departure_date', 'تاريخ المغادرة', 'd'], ['departure_flight', 'رقم رحلة المغادرة', 's'], ['departure_time', 'ساعة المغادرة', 'h'], ['departure_port', 'منفذ المغادرة', 's'],
    ['internal_transport', 'شركة النقل الداخلي', 's'], ['run_no', 'رقم التشغيلة', 's'], ['buses', 'عدد الباصات', 'i'], ['stay_direction', 'اتجاه الإقامة', 's'], ['madinah_nights', 'عدد ليالي المدينة', 'i'], ['makkah_nights', 'عدد ليالي مكة', 'i'],
    ['madinah_hotel', 'سكن المدينة', 's'], ['madinah_in', 'دخول المدينة', 'd'], ['madinah_out', 'خروج المدينة', 'd'], ['makkah_hotel', 'سكن مكة', 's'], ['makkah_in', 'دخول مكة', 'd'], ['makkah_out', 'خروج مكة', 'd']], chunk: 150 },
  { t: 'movements', ss: 'main', sheet: 'Movements', pk: ['id'], wipe: true, req: ['booking_no'], fk: { booking_no: 'bookings_skip' }, rowObj: 'data', cols: [['booking_no', 1, 'S'], ['move_date', 2, 'd'], ['kind', 4, 's']], chunk: 300 },
  { t: 'notifications', ss: 'main', sheet: 'Notifications', pk: ['id'], req: ['id'], cols: [['id', 'المعرف', 'S'], ['kind', 'النوع', 's'], ['message', 'الرسالة', 's'], ['client_name', 'العميل', 's'], ['trip_name', 'اسم الرحلة', 's'], ['required_perm', 'الصلاحية المطلوبة', 's'], ['is_read', 'مقروء؟', 'b'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  { t: 'housing_notes', ss: 'main', sheet: 'HousingNotes', pk: ['key'], req: ['key'], cols: [['key', 'المفتاح', 'S'], ['trips', 'الرحلات', 's'], ['city', 'المدينة', 's'], ['notes', 'الملاحظات', 's'], ['updated_by', 'آخر مستخدم', 's'], ['updated_at', 'آخر تحديث', 'T']] },
  { t: 'merged_housing', ss: 'main', sheet: 'MergedHousing', pk: ['merge_key'], req: ['merge_key'], cols: [['merge_key', 'مفتاح الدمج', 'S'], ['trips', 'الرحلات', 's'], ['city', 'المدينة', 's'], ['rooms', 'بيانات الغرف', 'j'], ['updated_by', 'آخر مستخدم', 's'], ['updated_at', 'آخر تحديث', 'T']] },
  // ----- حسابات عملاء العمرة -----
  { t: 'acc_items', ss: 'main', sheet: 'ClientAccounts_Items', pk: ['id'], req: ['id', 'client_name'], fk: { client_name: 'clients', trip_name: 'trips' }, cols: [
    ['id', 'المعرف', 'S'], ['client_name', 'العميل', 'S'], ['trip_name', 'اسم الرحلة', 's'], ['description', 'البيان', 's'], ['category', 'الفئة', 's'], ['currency', 'العملة', 'cur'], ['qty', 'العدد', 'n'], ['price', 'السعر', 'n'], ['amount', 'القيمة', 'n'],
    ['is_discount', 'خصم؟', 'b'], ['nights', 'الليالي', 'i'], ['company', 'الشركة', 's'], ['is_auto', 'تلقائي؟', 'b'], ['sort_order', 'الترتيب', 'i'], ['direct_value', 'قيمة مباشرة؟', 'b'], ['notes', 'ملاحظات', 's'],
    ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 't']], chunk: 400 },
  { t: 'acc_payments', ss: 'main', sheet: 'ClientAccounts_Payments', pk: ['id'], req: ['id', 'client_name', 'amount'], fk: { client_name: 'clients', trip_name: 'trips' }, cols: [
    ['id', 'المعرف', 'S'], ['client_name', 'العميل', 'S'], ['trip_name', 'اسم الرحلة', 's'], ['kind', 'النوع', 's'], ['pay_date', 'التاريخ', 'd'], ['amount', 'المبلغ', 'n'], ['currency', 'العملة', 'cur'], ['fx_rate', 'سعر الصرف', 'n'],
    ['description', 'البيان', 's'], ['serial', 'الرقم التسلسلي', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']], chunk: 400 },
  { t: 'acc_meta', ss: 'main', sheet: 'ClientAccounts_Meta', pk: ['client_name', 'trip_name'], req: ['client_name', 'trip_name'], fk: { client_name: 'clients', trip_name: 'trips' }, cols: [
    ['client_name', 'العميل', 'S'], ['trip_name', 'اسم الرحلة', 'S'], ['mode', 'نمط الحساب', 's'], ['counts_snapshot', 'لقطة الأعداد', 'j'], ['alert_read', 'تنبيه مقروء', 'b'], ['display_name', 'اسم العرض', 's'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 'T']] },
  { t: 'acc_trip_prices', ss: 'main', sheet: 'ClientAccounts_TripPrices', pk: ['trip_name'], req: ['trip_name'], fk: { trip_name: 'trips' }, cols: [['trip_name', 'اسم الرحلة', 'S'], ['prices', 'الأسعار (JSON)', 'j'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 'T']] },
  { t: 'acc_client_prices', ss: 'main', sheet: 'ClientAccounts_ClientPrices', pk: ['client_name'], req: ['client_name'], fk: { client_name: 'clients' }, cols: [['client_name', 'العميل', 'S'], ['prices', 'الأسعار (JSON)', 'j'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 'T']] },
  { t: 'acc_merge_groups', ss: 'main', sheet: 'ClientAccounts_MergeGroups', pk: ['group_id'], req: ['client_name'], genId: 'group_id', fk: { client_name: 'clients' }, cols: [
    ['group_id', 'معرف المجموعة', 'S'], ['client_name', 'العميل', 'S'], ['group_name', 'اسم المجموعة', 's'], ['trips', 'الرحلات (JSON)', 'ja'], ['updated_by', 'أنشئ/عُدّل بواسطة', 's'], ['updated_at', 'أنشئ/عُدّل في', 'T']] },
  // ----- الوكلاء والنقل -----
  { t: 'agent_company_accounts', ss: 'main', sheet: 'AgentCompanyAccounts', pk: ['agent', 'egypt_company'], req: ['agent'], cols: [
    ['agent', 'الوكيل', 'S'], ['egypt_company', 'الشركة المصرية', 'S'], ['mode', 'نمط الحساب', 's'], ['main_company', 'الشركة الرئيسية', 's'], ['notes', 'ملاحظات', 's'], ['active', 'نشط', 'bt'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 'T']] },
  { t: 'vz_transport_prices', ss: 'main', sheet: 'TransportAgentPrices', pk: ['id'], wipe: true, req: ['agent'], cols: [['agent', 'الوكيل', 'S'], ['price', 'السعر', 'n'], ['valid_from', 'من تاريخ', 'd'], ['valid_to', 'إلى تاريخ', 'd'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  { t: 'vz_agent_prices', ss: 'main', sheet: 'VisaAgentPrices', pk: ['id'], wipe: true, req: ['agent'], cols: [['agent', 'الوكيل', 'S'], ['price', 'السعر', 'n'], ['valid_from', 'من تاريخ', 'd'], ['valid_to', 'إلى تاريخ', 'd'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  { t: 'transport_overrides', ss: 'main', sheet: 'TransportAccounts_Overrides', pk: ['booking_no'], req: ['booking_no'], cols: [['booking_no', 'رقم الإشعار', 'S'], ['supplier', 'المورد', 's'], ['description', 'البيان', 's'], ['notes', 'ملاحظات', 's'], ['entry_no', 'رقم القيد', 's'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 'T']] },
  // ----- ملفات الوزارة -----
  { t: 'mf_supervisors', ss: 'main', sheet: 'MinistrySupervisors', pk: ['name'], req: ['name'], cols: [
    ['name', 'اسم المشرف', 'S'], ['kind', 'النوع', 's'], ['main_company', 'الشركة الأساسية', 's'], ['shared_companies', 'شركات المشاركة', 's'], ['phone', 'رقم الجوال', 's'], ['notes', 'ملاحظات', 's'],
    ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 't']] },
  { t: 'mf_files', ss: 'main', sheet: 'MinistryFiles', pk: ['file_id'], req: ['file_id'], extra: 'extra', unique: ['seq'], fk: { linked_trip: 'trips_null' }, cols: [
    ['file_id', 'معرف الملف', 'S'], ['seq', 'مسلسل', 'i'], ['file_no', 'رقم الملف', 's'], ['approved', 'معتمد', 'b'], ['e_invoice', 'فاتورة إلكترونية', 'bn'], ['entry_no', 'القيد', 's'], ['egypt_company', 'الشركة المصرية', 's'], ['saudi_agent', 'الوكيل السعودي', 's'],
    ['review_date', 'تاريخ المراجعة', 'd'], ['review_kind', 'نوع المراجعة', 's'], ['travel_mode', 'وسيلة السفر', 's'], ['client_name', 'العميل', 's'], ['client_items', 'بنود العميل (JSON)', 'j'], ['linked_trip', 'الرحلة المرتبطة', 's'],
    ['depart_date', 'تاريخ الذهاب', 'd'], ['return_date', 'تاريخ العودة', 'd'], ['pax', 'معتمرين', 'i'], ['supervisors_count', 'مشرفين', 'i'], ['supervisors', 'المشرفون (JSON)', 'j'], ['program_price', 'سعر البرنامج', 'n'], ['ticket', 'التذكرة', 'n'],
    ['room_fee_per', 'رسوم الغرفة للفرد', 'n'], ['admin_fee_per', 'رسوم إدارية للفرد', 'n'], ['ratio', 'النسبة', 'n'], ['sar_rate', 'سعر صرف الريال', 'n'],
    ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 't']], chunk: 100 },
  { t: 'mf_receipts', ss: 'main', sheet: 'RoomFeeReceipts', pk: ['receipt_no'], req: ['receipt_no', 'company', 'amount'], cols: [
    ['receipt_no', 'رقم الإيصال', 'S'], ['receipt_date', 'التاريخ', 'd'], ['receipt_time', 'الوقت', 'h'], ['company', 'الشركة', 'S'], ['license_no', 'رقم الترخيص', 's'], ['amount', 'المبلغ', 'n'], ['depositor', 'اسم المودع', 's'], ['source', 'المصدر', 's'], ['notes', 'ملاحظات', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  { t: 'mf_quota_transfers', ss: 'main', sheet: 'MfQuotaTransfers', pk: ['id'], req: ['id', 'company'], cols: [['id', 'معرف', 'S'], ['company', 'الشركة', 'S'], ['from_month', 'من شهر', 's'], ['to_month', 'إلى شهر', 's'], ['qty', 'العدد', 'i'], ['notes', 'ملاحظات', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  // ----- التأشيرات -----
  { t: 'vz_files', ss: 'main', sheet: 'VisaFiles', pk: ['id'], req: ['id'], extra: 'extra', unique: ['seq'], fk: { linked_trip: 'trips_null' }, cols: [
    ['id', 0, 'S'], ['seq', 1, 'i'], ['group_no', 2, 's'], ['status', 3, 's'], ['file_date', 4, 'd'], ['egypt_company', 5, 's'], ['saudi_agent', 6, 's'], ['linked_trip', 7, 's'], ['client_items', 8, 'j'], ['selected_pilgrims', 9, 'j'],
    ['pax', 10, 'i'], ['price_per', 11, 'n'], ['notes', 12, 's'], ['created_by', 13, 's'], ['created_at', 14, 'T'], ['updated_by', 15, 's'], ['updated_at', 16, 't'], ['pay_status', 17, 's'],
    ['makkah_in', 18, 'd'], ['makkah_out', 19, 'd'], ['madinah_in', 20, 'd'], ['madinah_out', 21, 'd'], ['housing_refs', 26, 'jo']], chunk: 100 },
  { t: 'vz_items', ss: 'main', sheet: 'AgentAccounts_Items', pk: ['id'], req: ['id', 'agent', 'amount'], cols: [
    ['id', 'المعرف', 'S'], ['agent', 'الوكيل', 'S'], ['description', 'البيان', 's'], ['currency', 'العملة', 'cur'], ['amount', 'القيمة', 'n'], ['is_credit', 'دائن؟', 'b'], ['notes', 'ملاحظات', 's'], ['sort_order', 'الترتيب', 'i'],
    ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'], ['entry_no', 'رقم القيد', 's'], ['item_date', 'التاريخ', 'd']] },
  { t: 'vz_payments', ss: 'main', sheet: 'AgentAccounts_Payments', pk: ['id'], req: ['id', 'agent', 'amount'], cols: [
    ['id', 'المعرف', 'S'], ['agent', 'الوكيل', 'S'], ['pay_date', 'التاريخ', 'd'], ['amount', 'المبلغ', 'n'], ['currency', 'العملة', 'cur'], ['notes', 'ملاحظات', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'], ['entry_no', 'رقم القيد', 's']] },
  { t: 'vz_housing_agreements', ss: 'main', sheet: 'HousingAgreements', pk: ['id'], req: ['id'], unique: ['agreement_no'], cols: [
    ['id', 'المعرف', 'S'], ['seq', 'مسلسل', 'i'], ['agreement_no', 'رقم الاتفاقية', 's'], ['city', 'المدينة', 's'], ['hotel', 'الفندق', 's'], ['qty', 'العدد', 'i'], ['from_date', 'من تاريخ', 'd'], ['to_date', 'إلى تاريخ', 'd'],
    ['status', 'الحالة', 's'], ['notes', 'ملاحظات', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 't'], ['supplier', 'المورد', 's'], ['agreement_kind', 'نوع الاتفاقية', 's']] },
  { t: 'vz_housing_allocations', ss: 'main', sheet: 'HousingAllocations', pk: ['id'], req: ['id', 'agreement_id'], fk: { agreement_id: 'agreements_skip' }, cols: [
    ['id', 'المعرف', 'S'], ['agreement_id', 'معرف الاتفاقية', 'S'], ['group_no', 'رقم المجموعة', 's'], ['qty', 'العدد', 'i'], ['from_date', 'من تاريخ', 'd'], ['to_date', 'إلى تاريخ', 'd'], ['notes', 'ملاحظات', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  { t: 'catering_contracts', ss: 'main', sheet: 'CateringContracts', pk: ['contract_id'], req: ['contract_id'], genId: 'contract_id', cols: [
    ['contract_id', 'معرف الاتفاقية', 'S'], ['contract_no', 'رقم الاتفاقية', 's'], ['provider', 'اسم مقدم الخدمة', 's'], ['service_area', 'منطقة الخدمة', 's'], ['days', 'عدد أيام الاتفاقية', 'i'], ['start_date', 'تاريخ بداية الاتفاقية', 'd'], ['end_date', 'تاريخ نهاية الاتفاقية', 'd'],
    ['pilgrims', 'عدد المعتمرين', 'i'], ['duration', 'المدة', 's'], ['total_amount', 'المبلغ الإجمالي للمعتمرين', 'n'], ['client_or_trip', 'العميل / الرحلة', 's'], ['company', 'اسم شركة العمرة', 's'], ['group_no', 'رقم المجموعة', 's'],
    ['source', 'مصدر الملف', 's'], ['supplier', 'المورد', 's'], ['notes', 'ملاحظات', 's'], ['attachment_url', 'رابط مرفق الاتفاقية', 's'], ['supplier_account', 'حساب المورد', 's'], ['client_account', 'حساب العميل / الرحلة', 's'],
    ['sale_total', 'سعر البيع الإجمالي', 'n'], ['manual_entry_no', 'رقم القيد اليدوي', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 't']] },
  // ----- الحسابات العامة (GL) -----
  { t: 'gl_accounts', ss: 'gl', sheet: 'GL_Accounts', pk: ['code'], req: ['code', 'name', 'acc_type'], selfParent: 'parent_code', cols: [
    ['code', 'الكود', 'S'], ['name', 'اسم الحساب', 'S'], ['acc_type', 'النوع', 'S'], ['parent_code', 'الحساب الأب', 's'], ['is_group', 'تجميعي؟', 'b'], ['currency', 'العملة', 's'], ['category', 'الفئة', 's'], ['link', 'الربط', 's'],
    ['active', 'نشط', 'bt'], ['notes', 'ملاحظات', 's'], ['legacy_id', 'المعرف القديم', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  { t: 'gl_batches', ss: 'gl', sheet: 'GL_Batches', pk: ['batch_no'], req: ['batch_no'], cols: [['batch_no', 'رقم الدفعة', 'S'], ['kind', 'النوع', 's'], ['description', 'الوصف', 's'], ['entries_count', 'عدد القيود', 'i'], ['status', 'الحالة', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T']] },
  { t: 'gl_entries', ss: 'gl', sheet: 'GL_Entries', pk: ['entry_id'], req: ['entry_id', 'entry_date', 'status'], fk: { batch_no: 'batches_null' }, cols: [
    ['entry_id', 'رقم القيد', 'S'], ['seq', 'التسلسل', 'i'], ['entry_date', 'التاريخ', 'd'], ['entry_type', 'نوع القيد', 's'], ['description', 'البيان', 's'], ['status', 'الحالة', 'S'], ['source_key', 'مفتاح المصدر', 's'], ['batch_no', 'دفعة الاستيراد', 's'],
    ['total_base', 'إجمالي المعادل', 'n'], ['reference', 'المرجع', 's'], ['trip_name', 'الرحلة', 's'], ['executing_company', 'الشركة المنفذة', 's'], ['created_by', 'أنشئ بواسطة', 's'], ['created_at', 'أنشئ في', 'T'],
    ['posted_by', 'رُحِّل بواسطة', 's'], ['posted_at', 'رُحِّل في', 't'], ['updated_by', 'عُدّل بواسطة', 's'], ['updated_at', 'عُدّل في', 't'], ['void_reason', 'سبب الإلغاء', 's']], chunk: 400 },
  { t: 'gl_lines', ss: 'gl', sheet: 'GL_Lines', pk: ['entry_id', 'line_no'], req: ['entry_id', 'line_no', 'account_code'], fk: { entry_id: 'entries_skip', account_code: 'accounts_skip' }, cols: [
    ['entry_id', 'رقم القيد', 'S'], ['line_no', 'رقم السطر', 'i'], ['line_date', 'التاريخ', 'd'], ['status', 'الحالة', 's'], ['account_code', 'الحساب', 'S'], ['debit', 'مدين', 'N0'], ['credit', 'دائن', 'N0'], ['currency', 'العملة', 'cur'], ['fx_rate', 'سعر الصرف', 'rate1'],
    ['debit_base', 'مدين معادل', 'N0'], ['credit_base', 'دائن معادل', 'N0'], ['trip_name', 'الرحلة', 's'], ['executing_company', 'الشركة المنفذة', 's'], ['client_name', 'العميل', 's'], ['agent', 'الوكيل', 's'], ['description', 'البيان', 's']], chunk: 500 },
  { t: 'gl_pending', ss: 'gl', sheet: 'GL_Pending', pk: ['key'], req: ['key'], cols: [
    ['key', 'المفتاح', 'S'], ['entry_id', 'رقم القيد', 's'], ['kind', 'النوع', 's'], ['cur_desc', 'البيان الحالي', 's'], ['cur_base', 'المعادل الحالي', 'n'], ['new_desc', 'البيان الجديد', 's'], ['new_base', 'المعادل الجديد', 'n'],
    ['new_fingerprint', 'البصمة الجديدة', 's'], ['detected_at', 'اكتُشف في', 't'], ['status', 'الحالة', 's'], ['by_user', 'بواسطة', 's'], ['at', 'في', 't'], ['cur_amount', 'المبلغ الحالي', 'n'], ['new_amount', 'المبلغ الجديد', 'n'], ['change_detail', 'تفاصيل التغيير', 's']] },
  { t: 'gl_pay_direct', ss: 'gl', sheet: 'GL_PayDirect', pk: ['payment_id'], req: ['payment_id'], cols: [['payment_id', 'معرّف الدفعة', 'S'], ['cash_account', 'الحساب النقدي', 's'], ['by_user', 'بواسطة', 's'], ['at', 'في', 't']] },
  { t: 'gl_auto_log', ss: 'gl', sheet: 'GL_AutoLog', pk: ['id'], wipe: true, cols: [['at', 'في', 'T'], ['entry_id', 'رقم القيد', 's'], ['description', 'البيان', 's'], ['base_amount', 'المعادل', 'n'], ['source', 'المصدر', 's'], ['event', 'الحدث', 's']] },
  { t: 'gl_statements', ss: 'gl', sheet: 'GL_Statements', pk: ['statement_no'], req: ['statement_no'], cols: [
    ['statement_no', 'رقم الكشف', 'S'], ['issued_at', 'أصدر في', 'T'], ['by_user', 'بواسطة', 's'], ['account_code', 'كود الحساب', 's'], ['account_name', 'اسم الحساب', 's'], ['from_date', 'من', 'd'], ['to_date', 'إلى', 'd'],
    ['balances', 'الأرصدة', 'j'], ['output', 'الإخراج', 's'], ['fingerprint', 'البصمة', 's'], ['notes', 'ملاحظات', 's']] },
  { t: 'gl_settings', ss: 'gl', sheet: 'GL_Settings', pk: ['key'], req: ['key'], cols: [['key', 'المفتاح', 'S'], ['value', 'القيمة', 's']] },
  { t: 'gl_attachments', ss: 'gl', sheet: 'GL_Attachments', pk: ['id'], wipe: true, req: ['entry_id'], fk: { entry_id: 'entries_skip' }, cols: [
    ['entry_id', 'رقم القيد', 'S'], ['file_id', 'معرّف الملف', 's'], ['name', 'الاسم', 's'], ['kind', 'النوع', 's'], ['url', 'الرابط', 's'], ['by_user', 'بواسطة', 's'], ['at', 'في', 'T']] },
  { t: 'gl_fx_daily', ss: 'gl', sheet: 'GL_FX_Daily', pk: ['fx_date'], req: ['fx_date'], cols: [
    ['fx_date', 'التاريخ', 'd'], ['sar_sell', 'ريال بيع', 'n'], ['sar_buy', 'ريال شراء', 'n'], ['usd_sell', 'دولار بيع', 'n'], ['usd_buy', 'دولار شراء', 'n'], ['source', 'المصدر', 's'], ['by_user', 'بواسطة', 's'], ['at', 'في', 'T']] },
  { t: 'gl_hb_map', ss: 'gl', sheet: 'GL_HB_Map', pk: ['name'], req: ['name'], fk: { account_code: 'accounts_null' }, cols: [
    ['name', 'الاسم', 'S'], ['kind', 'النوع', 's'], ['account_code', 'كود الحساب', 's'], ['link', 'الربط', 's'], ['notes', 'ملاحظات', 's'], ['by_user', 'بواسطة', 's'], ['at', 'في', 'T']] },
  { t: 'gl_hb_pay', ss: 'gl', sheet: 'GL_HB_Pay', pk: ['payment_id'], req: ['payment_id'], cols: [
    ['payment_id', 'معرّف الدفعة', 'S'], ['cash_account', 'الحساب النقدي', 's'], ['currency', 'العملة', 's'], ['amount_fc', 'المبلغ بالعملة', 'n'], ['fx_rate', 'سعر الصرف', 'n'], ['by_user', 'بواسطة', 's'], ['at', 'في', 't'], ['party_account', 'حساب الطرف', 's'], ['manual_link', 'ربط يدوي (دفعة مرتبطة)', 's']] },
  { t: 'gl_hb_trip', ss: 'gl', sheet: 'GL_HB_Trip', pk: ['booking_key'], req: ['booking_key'], fk: { trip_name: 'trips' }, cols: [['booking_key', 'مفتاح الحجز', 'S'], ['trip_name', 'الرحلة', 's'], ['by_user', 'بواسطة', 's'], ['at', 'في', 'T']] },
  { t: 'gl_hb_mirror', ss: 'gl', sheet: 'GL_HB_Mirror', pk: ['entry_id'], req: ['entry_id'], cols: [['entry_id', 'رقم القيد', 'S'], ['rows_count', 'عدد الصفوف', 'i'], ['at', 'في', 'T']] },
  { t: 'gl_hb_keep_erp', ss: 'gl', sheet: 'GL_HB_KeepERP', pk: ['auto_key'], req: ['auto_key'], cols: [['auto_key', 'مفتاح القيد التلقائي', 'S'], ['erp_entry_id', 'قيد الـ ERP المعتمد', 's'], ['deleted_hb_desc', 'بيان قيد الحجوزات المحذوف', 's'], ['by_user', 'بواسطة', 's'], ['at', 'في', 'T']] },
  { t: 'gl_recon_links', ss: 'gl', sheet: 'GL_ReconLinks', pk: ['link_key'], req: ['link_key'], rowObj: 'data', cols: [['link_key', 0, 'S']] },
  { t: 'gl_auto_override', ss: 'gl', sheet: 'GL_AutoOverride', pk: ['key'], req: ['key'], rowObj: 'data', cols: [['key', 0, 'S']] },
  { t: 'gl_bank_due', ss: 'gl', sheet: 'GL_BankDue', pk: ['key'], req: ['key'], rowObj: 'data', cols: [['key', 0, 'S']] },
  { t: 'gl_maker_checker', ss: 'gl', sheet: 'GL_MakerChecker', pk: ['id'], req: ['id'], rowObj: 'data', cols: [['id', 0, 'S'], ['status', 'الحالة', 's']] },
  { t: 'gl_charters', ss: 'gl', sheet: 'GL_HB_Charters', pk: ['id'], req: ['id'], rowObj: 'data', cols: [['id', 0, 'S']] },
  { t: 'gl_deleted', ss: 'gl', sheet: 'GL_Deleted', pk: ['id'], wipe: true, req: ['del_id'], rowObj: 'payload', cols: [['del_id', 0, 'S'], ['role', 1, 's']], chunk: 200 }
];

/* ---------- بناء صفوف جدول واحد (قراءة + تحويل + تحقق، بلا شبكة) ---------- */
function _mgRowObj_(hdr, row) { var o = {}; hdr.forEach(function (h, j) { if (row[j] !== '' && row[j] !== null && row[j] !== undefined) o[h || ('col' + (j + 1))] = _mgRaw_(row[j]); }); return o; }

function _mgBuild_(spec, refs) {
  var sh = _mgSheet_(spec.ss, spec.sheet), res = { rows: [], raw: sh.rows.length, skipped: 0, dup: 0, missing: sh.missing };
  if (sh.missing) return res;
  var seen = {}, uniq = {};
  var mapped = sh.rows.map(function (row, ri) {
    var o = {}, used = {};
    spec.cols.forEach(function (c) {
      var idx = c[1], j = (typeof idx === 'number') ? idx : sh.hdr.indexOf(idx);
      if (j >= 0) used[j] = 1;
      var v = j >= 0 ? row[j] : '';
      o[c[0]] = c[2] === 'perms' ? _mgPerms_(v) : _mgConv_(c[2], v, spec.t + '.' + c[0]);
    });
    if (spec.konst) { for (var k in spec.konst) o[k] = spec.konst[k]; }
    if (spec.genId && !o[spec.genId]) o[spec.genId] = 'MG-' + spec.t + '-' + (ri + 2);
    if (spec.extra) {
      var ex = {};
      sh.hdr.forEach(function (h, j) { if (!used[j] && h && row[j] !== '' && row[j] !== null && row[j] !== undefined) { var key = ex.hasOwnProperty(h) ? h + '#' + (j + 1) : h; ex[key] = _mgRaw_(row[j]); } });
      (spec.rawExtra || []).forEach(function (h) { var j = sh.hdr.indexOf(h); if (j >= 0 && row[j] !== '') ex['raw:' + h] = _mgRaw_(row[j]); });
      o[spec.extra] = ex;
    }
    if (spec.rowObj) o[spec.rowObj] = _mgRowObj_(sh.hdr, row);
    o.__row = ri + 2;
    return o;
  });
  // عمود الأب الذاتي (حسابات): ترتيب بالعمق
  if (spec.selfParent) {
    var byCode = {}; mapped.forEach(function (o) { byCode[o.code] = o; });
    var depth = function (o, n) { n = n || 0; if (n > 30 || !o[spec.selfParent] || !byCode[o[spec.selfParent]]) return n; return depth(byCode[o[spec.selfParent]], n + 1); };
    mapped.forEach(function (o) { if (o[spec.selfParent] && !byCode[o[spec.selfParent]]) { _mgW_('حساب أب غير موجود ' + spec.t); o[spec.selfParent] = null; } o.__d = depth(o); });
    mapped.sort(function (a, b) { return a.__d - b.__d; });
  }
  mapped.forEach(function (o) {
    var bad = (spec.req || []).some(function (c) { var v = o[c]; return v === null || v === undefined || v === ''; });
    if (bad) { res.skipped++; _mgSkip_(spec.t, 'حقل إلزامي فارغ'); return; }
    // مراجع الآباء
    var fk = spec.fk || {}, drop = false;
    Object.keys(fk).forEach(function (col) {
      var mode = fk[col], v = o[col]; if (v === null || v === undefined || v === '') return;
      var setName = mode.split('_')[0], act = mode.indexOf('_') > 0 ? mode.split('_')[1] : 'stub';
      var set = refs[setName];
      if (set && !set[v]) {
        if (act === 'skip') { drop = true; _mgSkip_(spec.t, 'أب مفقود: ' + col); }
        else if (act === 'null') { if (spec.extra && o[spec.extra]) o[spec.extra]['raw:' + col] = v; o[col] = null; _mgW_('مرجع صُفِّر ' + spec.t + '.' + col); }
        else { /* stub: يُنشأ ظل بخطوة الظلال */ }
      }
    });
    if (drop) { res.skipped++; return; }
    var key = spec.pk.map(function (c) { return String(o[c]); }).join('\u0001');
    if (!spec.wipe) { if (seen[key]) { res.dup++; _mgSkip_(spec.t, 'مفتاح مكرر (يُؤخذ الأخير)'); } seen[key] = o; }
    (spec.unique || []).forEach(function (c) { var u = o[c]; if (u === null || u === undefined || u === '') return; uniq[c] = uniq[c] || {}; if (uniq[c][u]) { _mgW_('قيمة فريدة مكررة ' + spec.t + '.' + c); if (spec.extra && o[spec.extra]) o[spec.extra]['raw:' + c] = u; o[c] = null; } else uniq[c][u] = 1; });
    res.rows.push(o);
  });
  if (!spec.wipe) {
    var last = {}; res.rows.forEach(function (o) { last[spec.pk.map(function (c) { return String(o[c]); }).join('\u0001')] = o; });
    res.rows = Object.keys(last).map(function (k) { return last[k]; });
    if (spec.selfParent) res.rows.sort(function (a, b) { return a.__d - b.__d; });
  }
  res.rows.forEach(function (o) { delete o.__d; });
  return res;
}
// بناء صامت: يُستعمل لقراءات مساعدة (الآباء/الظلال/المطابقة) فلا تتضاعف عدّادات التخطّي والتحذير بالتقرير
function _mgQuiet_(fn) { var save = MG_CTX_; MG_CTX_ = { warn: {}, skip: {}, now: save ? save.now : new Date().toISOString() }; try { return fn(); } finally { MG_CTX_ = save; } }
function _mgSkip_(t, why) { if (!MG_CTX_) return; var k = t + ' — ' + why; MG_CTX_.skip[k] = (MG_CTX_.skip[k] || 0) + 1; }

/* مجموعات الآباء من الشيتات (للتحقق من المراجع) */
function _mgRefs_() { return _mgQuiet_(_mgRefs0_); }
function _mgRefs0_() {
  var s = function (sp, col) { var o = {}; _mgBuild_(sp, {}).rows.forEach(function (r) { o[r[col]] = 1; }); return o; };
  var by = function (t) { return MG_SPECS_.filter(function (x) { return x.t === t; })[0]; };
  var refs = { users: s(by('app_users'), 'username'), clients: s(by('clients'), 'name'), trips: s(by('trips'), 'name'), bookings: s(by('bookings'), 'booking_no'),
    agreements: s(by('vz_housing_agreements'), 'id'), batches: s(by('gl_batches'), 'batch_no'), accounts: s(by('gl_accounts'), 'code'), entries: s(by('gl_entries'), 'entry_id') };
  return refs;
}

/* أسماء العملاء/الرحلات المذكورة بالتوابع وغير الموجودة بأصلها ⇒ تُنشأ «ظلالاً» حتى لا تتعارض المفاتيح الأجنبية */
function _mgStubs_(refs) { return _mgQuiet_(function () { return _mgStubs0_(refs); }); }
function _mgStubs0_(refs) {
  var needC = {}, needT = {};
  MG_SPECS_.forEach(function (sp) {
    if (!sp.fk || !sp.t) return;
    Object.keys(sp.fk).forEach(function (col) {
      var mode = sp.fk[col], setName = mode.split('_')[0], act = mode.indexOf('_') > 0 ? mode.split('_')[1] : 'stub';
      if (act !== 'stub' || (setName !== 'clients' && setName !== 'trips')) return;
      _mgBuild_(sp, {}).rows.forEach(function (o) { var v = o[col]; if (v && !refs[setName][v]) (setName === 'clients' ? needC : needT)[v] = 1; });
    });
  });
  return { clients: Object.keys(needC), trips: Object.keys(needT) };
}

/* ---------- الشبكة ---------- */
function _mgCfg_() {
  var p = PropertiesService.getScriptProperties(), url = String(p.getProperty('SUPA_URL') || '').replace(/\/+$/, ''), key = String(p.getProperty('SUPA_SERVICE_KEY') || '');
  if (!url || !key) throw new Error('عيّن SUPA_URL و SUPA_SERVICE_KEY في Script properties');
  return { url: url, key: key };
}
function _mgReq_(method, path, body, prefer) {
  var c = _mgCfg_(), h = { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  var opt = { method: method, headers: h, muteHttpExceptions: true };
  if (body !== undefined && body !== null) opt.payload = JSON.stringify(body);
  var r, tries = 0;
  while (true) {
    r = UrlFetchApp.fetch(c.url + '/rest/v1/' + path, opt);
    var code = r.getResponseCode();
    if ((code === 429 || code >= 500) && tries < 3) { tries++; Utilities.sleep(1500 * tries); continue; }
    break;
  }
  return { code: r.getResponseCode(), text: r.getContentText(), headers: r.getAllHeaders ? r.getAllHeaders() : {} };
}
function _mgPost_(spec, rows, st, ignoreDup) {
  if (!rows.length) return;
  var path = spec.t + '?on_conflict=' + encodeURIComponent(spec.pk.join(',')) , prefer = (ignoreDup ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates') + ',return=minimal';
  if (spec.wipe) { path = spec.t; prefer = 'return=minimal'; }
  var res = _mgReq_('post', path, rows, prefer);
  if (res.code >= 200 && res.code < 300) { st.sent += rows.length; return; }
  if (rows.length === 1) { st.failed++; if (st.errors.length < 40) st.errors.push(spec.t + ' [' + spec.pk.map(function (c) { return rows[0][c]; }).join('|') + '] ' + res.code + ' ' + String(res.text).slice(0, 160)); return; }
  var mid = Math.floor(rows.length / 2);
  _mgPost_(spec, rows.slice(0, mid), st, ignoreDup); _mgPost_(spec, rows.slice(mid), st, ignoreDup);
}
function _mgClean_(rows) { return rows.map(function (o) { var c = {}; for (var k in o) if (k !== '__row') c[k] = o[k]; return c; }); }

/* ---------- الحالة والتقرير ---------- */
function _mgState_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('MG_STATE') || 'null') || { i: 0, off: 0, tables: {} }; } catch (e) { return { i: 0, off: 0, tables: {} }; } }
function _mgSave_(st) { PropertiesService.getScriptProperties().setProperty('MG_STATE', JSON.stringify(st)); }
function _mgNewCtx_() { MG_CTX_ = { warn: {}, skip: {}, now: new Date().toISOString() }; MG_CACHE_ = {}; }

function mgPing() {
  var r = _mgReq_('get', 'clients?select=name&limit=1');
  var msg = r.code === 200 ? '✅ الاتصال سليم (Supabase يرد)' : '❌ فشل الاتصال: ' + r.code + ' ' + String(r.text).slice(0, 200);
  Logger.log(msg); return msg;
}

/* فحص بلا كتابة */
function mgDryRun() {
  _mgNewCtx_();
  var refs = _mgRefs_(), lines = [], tot = 0;
  MG_SPECS_.forEach(function (sp) {
    if (sp.kind === 'stubs') { var s = _mgStubs_(refs); lines.push('— ظلال مطلوبة: عملاء ' + s.clients.length + ' · رحلات ' + s.trips.length + (s.clients.length ? ' (مثال عملاء: ' + s.clients.slice(0, 3).join('، ') + ')' : '') + (s.trips.length ? ' (مثال رحلات: ' + s.trips.slice(0, 3).join('، ') + ')' : '')); return; }
    var b = _mgBuild_(sp, refs); tot += b.rows.length;
    lines.push((b.missing ? '⚠️ ورقة غير موجودة ' : '') + sp.t + ' ← ' + sp.sheet + ': قرئ ' + b.raw + ' · سيُنقل ' + b.rows.length + (b.skipped ? ' · مُتخطّى ' + b.skipped : '') + (b.dup ? ' · مكرر ' + b.dup : ''));
    if (sp.t === 'gl_lines') { var neg = b.rows.filter(function (o) { return o.debit < 0 || o.credit < 0; }).length; if (neg) lines.push('   ⚠️ سطور GL بمبالغ سالبة: ' + neg + ' (تخالف قيد الجدول — راجعها قبل النقل)'); }
  });
  Object.keys(MG_CTX_.skip).forEach(function (k) { lines.push('تخطّي: ' + k + ' = ' + MG_CTX_.skip[k]); });
  Object.keys(MG_CTX_.warn).forEach(function (k) { lines.push('تحذير: ' + k + ' = ' + MG_CTX_.warn[k]); });
  var out = 'فحص بلا كتابة — إجمالي الصفوف الجاهزة: ' + tot + '\n' + lines.join('\n');
  Logger.log(out); return out;
}

/* النقل الفعلي — يستأنف تلقائياً */
function mgRun() {
  var t0 = Date.now(), st = _mgState_();
  _mgNewCtx_();
  _mgClearTriggers_();
  var refs = _mgRefs_(), done = true;
  while (st.i < MG_SPECS_.length) {
    var sp = MG_SPECS_[st.i];
    if (Date.now() - t0 > MG_BUDGET_MS_) { done = false; break; }
    if (sp.kind === 'stubs') {
      var s = _mgStubs_(refs), tmp = { sent: 0, failed: 0, errors: [] };
      _mgPost_({ t: 'clients', pk: ['name'] }, s.clients.map(function (n) { return { name: n, notes: '[نقل: غير موجود بالأصل — أنشئ كظل]' }; }), tmp, true);
      _mgPost_({ t: 'trips', pk: ['name'] }, s.trips.map(function (n) { return { name: n, archived: true, extra: { _migrated_stub: true } }; }), tmp, true);
      st.tables['_stubs'] = { clients: s.clients.length, trips: s.trips.length, failed: tmp.failed, errors: tmp.errors };
      st.i++; st.off = 0; _mgSave_(st); continue;
    }
    var b = _mgBuild_(sp, refs), rows = _mgClean_(b.rows), size = sp.chunk || 500;
    var tb = st.tables[sp.t] = st.tables[sp.t] || { raw: b.raw, expected: rows.length, skipped: b.skipped, dup: b.dup, sent: 0, failed: 0, errors: [], missing: b.missing };
    if (st.off === 0 && sp.wipe && !b.missing) { var w = _mgReq_('delete', sp.t + '?id=gt.0'); if (w.code >= 300) { tb.errors.push('تعذّر المسح: ' + w.code + ' ' + String(w.text).slice(0, 120)); } }
    while (st.off < rows.length) {
      if (Date.now() - t0 > MG_BUDGET_MS_) { done = false; break; }
      var part = rows.slice(st.off, st.off + size), acc = { sent: 0, failed: 0, errors: [] };
      _mgPost_(sp, part, acc, false);
      tb.sent += acc.sent; tb.failed += acc.failed; acc.errors.forEach(function (e) { if (tb.errors.length < 40) tb.errors.push(e); });
      st.off += size; _mgSave_(st);
      if (tb.failed > 300) { tb.errors.push('توقف الجدول: أخطاء كثيرة'); st.off = rows.length; }
    }
    if (!done) break;
    tb.warn = {}; Object.keys(MG_CTX_.warn).forEach(function (k) { if (k.indexOf(sp.t) >= 0) tb.warn[k] = MG_CTX_.warn[k]; });
    st.i++; st.off = 0; _mgSave_(st);
  }
  _mgSave_(st);
  if (!done) {
    ScriptApp.newTrigger('mgRun').timeBased().after(60 * 1000).create();
    Logger.log('⏳ لم ينتهِ بعد — سيستأنف تلقائياً بعد دقيقة (الجدول ' + (st.i + 1) + ' من ' + MG_SPECS_.length + ')');
    return 'partial';
  }
  Logger.log('✅ انتهى النقل — شغّل mgVerify() للمطابقة');
  var rep = mgReport(); return rep;
}
function _mgClearTriggers_() { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mgRun') { try { ScriptApp.deleteTrigger(t); } catch (e) {} } }); }

function mgReport() {
  var st = _mgState_(), L = ['تقرير النقل — الجدول ' + Math.min(st.i + 1, MG_SPECS_.length) + ' من ' + MG_SPECS_.length];
  Object.keys(st.tables).forEach(function (t) {
    var x = st.tables[t];
    if (t === '_stubs') { L.push('ظلال: عملاء ' + x.clients + ' · رحلات ' + x.trips + (x.failed ? ' · فشل ' + x.failed : '')); return; }
    L.push((x.failed || x.missing ? '⚠️ ' : '✓ ') + t + ': قرئ ' + x.raw + ' · متوقع ' + x.expected + ' · أُرسل ' + x.sent + (x.skipped ? ' · مُتخطّى ' + x.skipped : '') + (x.dup ? ' · مكرر ' + x.dup : '') + (x.failed ? ' · فشل ' + x.failed : '') + (x.missing ? ' · الورقة غير موجودة' : ''));
    (x.errors || []).slice(0, 5).forEach(function (e) { L.push('     ✗ ' + e); });
  });
  var out = L.join('\n'); Logger.log(out); return out;
}

/* مسح جداول الوجهة بترتيب عكسي (لإعادة نقل نظيفة) — لا يُشغَّل بالخطأ: يتطلب mgReset('نعم') */
function mgReset(confirm) {
  if (confirm !== 'نعم') { Logger.log('لتأكيد المسح: mgReset("نعم")'); return 'لم يُنفَّذ'; }
  var tabs = MG_SPECS_.filter(function (s) { return s.t; }).map(function (s) { return s.t; }).reverse(), msgs = [];
  tabs.forEach(function (t) {
    var sp = MG_SPECS_.filter(function (s) { return s.t === t; })[0], col = sp.pk[0];
    var r = _mgReq_('delete', t + '?' + col + '=not.is.null');
    if (r.code >= 300) msgs.push(t + ': ' + r.code + ' ' + String(r.text).slice(0, 100));
  });
  PropertiesService.getScriptProperties().deleteProperty('MG_STATE');
  Logger.log(msgs.length ? msgs.join('\n') : '✅ تم المسح'); return msgs.join('\n') || 'تم';
}

/* ---------- المطابقة: الأعداد + الأرصدة (GL كاملاً) + مجاميع الحسابات ---------- */
function mgVerify() {
  _mgNewCtx_();
  var refs = _mgRefs_(), exp = {}, sums = {}, glKeys = {};
  var by = function (t) { return MG_SPECS_.filter(function (x) { return x.t === t; })[0]; };
  MG_SPECS_.forEach(function (sp) { if (sp.t) { var b = _mgQuiet_(function () { return _mgBuild_(sp, refs); }); exp[sp.t] = b.rows.length; } });
  var stubs = _mgStubs_(refs); exp.clients += stubs.clients.length; exp.trips += stubs.trips.length;   // الظلال المنشأة بالنقل
  // مجاميع الشيت الخام لسطور GL (كلها — لا المنقول فقط) ⇒ أي سطر لم يُنقل يظهر فرقاً
  var lsp = by('gl_lines'), sh = _mgSheet_('gl', lsp.sheet), H = function (n) { return sh.hdr.indexOf(n); };
  var iA = H('الحساب'), iS = H('الحالة'), iC = H('العملة'), iD = H('مدين'), iK = H('دائن'), iDB = H('مدين معادل'), iKB = H('دائن معادل'), tot = { d: 0, c: 0, db: 0, cb: 0, n: 0 };
  sh.rows.forEach(function (r) {
    var cur = _mgStr_(r[iC]) || 'EGP', key = String(r[iA]).trim() + '|' + (_mgStr_(r[iS]) || '') + '|' + cur;
    var g = glKeys[key] = glKeys[key] || { d: 0, c: 0, db: 0, cb: 0, n: 0 };
    var d = _mgNum_(r[iD]) || 0, c = _mgNum_(r[iK]) || 0, db = _mgNum_(r[iDB]) || 0, cb = _mgNum_(r[iKB]) || 0;
    g.d += d; g.c += c; g.db += db; g.cb += cb; g.n++;
    tot.d += d; tot.c += c; tot.db += db; tot.cb += cb; tot.n++;
  });
  var money = [['acc_items', 'ClientAccounts_Items', 'القيمة'], ['acc_payments', 'ClientAccounts_Payments', 'المبلغ'], ['mf_receipts', 'RoomFeeReceipts', 'المبلغ'], ['vz_items', 'AgentAccounts_Items', 'القيمة'], ['vz_payments', 'AgentAccounts_Payments', 'المبلغ'], ['catering_contracts', 'CateringContracts', 'المبلغ الإجمالي للمعتمرين'], ['gl_entries', 'GL_Entries', 'إجمالي المعادل']];
  money.forEach(function (m) { var s2 = by(m[0]), b = _mgQuiet_(function () { return _mgBuild_(s2, refs); }), col = s2.cols.filter(function (c) { return c[1] === m[2]; })[0][0], t = 0; b.rows.forEach(function (o) { t += (o[col] || 0); }); sums[m[0]] = Math.round(t * 1e4) / 1e4; });
  var r = _mgReq_('post', 'rpc/mg_check', {});
  if (r.code !== 200) { var e = '❌ تعذّر استدعاء mg_check (' + r.code + '): ' + String(r.text).slice(0, 200) + '\nشغّل SQL التحضير أولاً.'; Logger.log(e); return e; }
  var db = JSON.parse(r.text), L = [], bad = 0;
  L.push('— الأعداد (الشيت بعد التحويل ↔ قاعدة البيانات)');
  Object.keys(exp).forEach(function (t) { var d = Number((db.counts || {})[t] || 0), ok = d === exp[t]; if (!ok) bad++; L.push((ok ? '✓ ' : '✗ ') + t + ': ' + exp[t] + ' ↔ ' + d); });
  L.push('— مجاميع مالية');
  Object.keys(sums).forEach(function (k) { var d = Number((db.sums || {})[k] || 0), ok = Math.abs(d - sums[k]) <= MG_TOL_; if (!ok) bad++; L.push((ok ? '✓ ' : '✗ ') + k + ': ' + sums[k] + ' ↔ ' + d); });
  L.push('— الحسابات العامة (GL): كل مفتاح = حساب|حالة|عملة');
  var dbk = {}; (db.gl || []).forEach(function (g) { dbk[g.k] = g; });
  var keys = {}; Object.keys(glKeys).forEach(function (k) { keys[k] = 1; }); Object.keys(dbk).forEach(function (k) { keys[k] = 1; });
  var diff = 0, ok0 = 0;
  Object.keys(keys).forEach(function (k) {
    var a = glKeys[k] || { d: 0, c: 0, db: 0, cb: 0, n: 0 }, b = dbk[k] || { d: 0, c: 0, db: 0, cb: 0, n: 0 };
    var same = a.n === Number(b.n) && Math.abs(a.d - b.d) <= MG_TOL_ && Math.abs(a.c - b.c) <= MG_TOL_ && Math.abs(a.db - b.db) <= MG_TOL_ && Math.abs(a.cb - b.cb) <= MG_TOL_;
    if (same) { ok0++; return; }
    diff++; if (diff <= 25) L.push('✗ ' + k + ': شيت[n=' + a.n + ' مدين=' + a.db + ' دائن=' + a.cb + '] ↔ قاعدة[n=' + b.n + ' مدين=' + b.db + ' دائن=' + b.cb + ']');
  });
  bad += diff;
  L.push('تطابق ' + ok0 + ' مفتاحاً · اختلاف ' + diff);
  var T = db.gl_total || {}, same2 = Number(T.n) === tot.n && Math.abs(tot.db - T.db) <= MG_TOL_ && Math.abs(tot.cb - T.cb) <= MG_TOL_ && Math.abs(tot.d - T.d) <= MG_TOL_ && Math.abs(tot.c - T.c) <= MG_TOL_;
  if (!same2) bad++;
  L.push((same2 ? '✓ ' : '✗ ') + 'إجمالي GL: سطور ' + tot.n + ' ↔ ' + T.n + ' · مدين معادل ' + Math.round(tot.db * 100) / 100 + ' ↔ ' + T.db + ' · دائن معادل ' + Math.round(tot.cb * 100) / 100 + ' ↔ ' + T.cb);
  L.push('ميزان المراجعة بالشيت: مدين-دائن (معادل) = ' + Math.round((tot.db - tot.cb) * 100) / 100 + ' · بقاعدة البيانات = ' + Math.round((Number(T.db) - Number(T.cb)) * 100) / 100);
  L.push(bad === 0 ? '✅✅ تطابق 100% — يمكن اعتماد النقل' : '❌ يوجد ' + bad + ' اختلاف — لا تعتمد النقل قبل معالجته (راجع mgReport للأخطاء)');
  var out = L.join('\n'); Logger.log(out); return out;
}
