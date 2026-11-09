# جرد الوظائف التي ما زالت تعمل عبر Google Sheets / Apps Script + خطة النقل لـ Supabase + تصوّر مزامنة الشيتات

> مُولَّد في V4.385 من فحص النداءات في `index_web.html` (كل `google.script.run.<fn>(authToken, …)` غير الموجَّه لـ Postgres عبر STRPC). الأعداد تقريبية والفئات اجتهادية؛ المرجع الحاسم دائماً سجل الكونسول (`↩︎ apps-script <fn>` = ما زالت على Apps Script).

## 1. ما نُقل فعلاً (يعمل من Postgres)
- **قراءات (≈37 دالة):** الرحلات/المعتمرون/الحركات/الحجوزات/التأشيرات/الوزارة/القوائم، كشوف الحسابات العامة (GL)، getClientAccount، searchDynamicBookings، سجل التعديلات، الإعدادات (notif/session/sort)، الجرس (022) — عبر `rx_call/rx_call2/rx_boot`.
- **كتابات:** saveMinistryFile، saveVisaFile (+ outbox للتدقيق/التنبيهات)، قيود GL (003) عبر `rw_call`.
- **V4.385:** رمز الطباعة (020)، الدخول السريع (021)، الجرس (022)، سجل التعديلات يُعرض فوراً من Postgres.

## 2. ما بقي (269 دالة) مصنَّفاً

### الدخول والجلسة والإعدادات (57)
`saveSystemSettings` · `runAdminSetupAction` · `supaIssueToken` · `logoutUserSession` · `hbUserSaveFromMain` · `getRequiredFieldsConfig` · `getTempCleanupStatus` · `changeMyPassword` · `perfReport` · `appPulse` · `lfFetch` · `lfPoll` · `getAllUsersForAdmin` · `hbUsersMap` · `deleteUserAccount` · `addNewUser` · `uploadCompanyLogo` · `saveCompanySetting` · `deleteCompanySetting` · `getCompaniesSettings` · `getAlertCenter` · `saveAlertCenter` · `getFolderSettingsForAdmin` · `updateFolderSettingFromUI` · `driveRootAudit` · `driveRootFix` · `runAllTestsForUI` · `saveBookingsSortDefault` · `saveSessionDurationConfig` · `getTgCateringConfig` · `saveTgCateringConfig` · `setTgCateringWebhook` · `testTgCateringBot` · `getTgNoticeConfig` · `saveTgNoticeConfig` · `testTgNoticeBot` · `getTgAlertGroups` · `saveTgAlertGroups` · `testTgAlertGroups` · `saveRequiredFieldsConfig` · `getServicesStatus` · `checkBusPriceColumnsExist` · `setupUsersSystemFromUI` · `runOneTimeReconciliation` · `setTempCleanupScheduleAuth` · `disableTempCleanupSchedule` · `changeUserPassword` · `setUserActiveStatus` · `updateUserFullName` · `updateUsername` · `updateUserPermissions` · `settingsScreenBootstrap` · `getBackupStatus` · `appBatch` · `perfTop` · `perfDiag` · `perfSetOn`

### الحجوزات والإشعارات (35)
`getBookingNoticeHtmlForImage` · `syncTripBookingByName` · `getAgentByCompany` · `uploadAndParseTicketManual` · `uploadAndAnalyzeTicket` · `getTripByName` · `saveTransportRowEdit` · `deleteBookingRecord` · `deleteTicketFile` · `deleteTicketFromBooking` · `getRule70Bookings` · `flightPrintOcr` · `flightPrintExtract` · `flightCmpPdf` · `getTransportAccountsData` · `deleteTransportRowEdit` · `exportTransportAccountsExcel` · `toggleApprovalStatus` · `getTripBookingCompare` · `adoptBookingGroupToTrip` · `getDriveFileBase64` · `getBookingPilgrimNames` · `deleteBookingAttachmentFile` · `uploadBookingAttachment` · `getBookingLinkSuggestions` · `saveBookingToServer` · `exportToProfessionalExcelV4` · `deleteTempFile` · `exportMovementExcel` · `generatePrintAccessToken` · `getWebAppUrl` · `generateBookingPdfForShare` · `createBookingPdfFromHtml` · `deleteSharedBookingFile` · `analyzeTicketTextServer`

### الرحلات والمعتمرون والتسكين (38)
`generateHousingPdf` · `saveTripPilgrims` · `extractPassportData` · `saveGlobalPilgrim` · `deleteGlobalPilgrims` · `extractPassportFromText` · `audUndo` · `linkTripNotification` · `getTripsPilgrimsMap` · `assignPilgrimToTrip` · `assignPilgrimsBulk` · `movePilgrimsBulk` · `movePilgrimBetweenTrips` · `getTripChangeLog` · `getTripSnapshots` · `saveTrip` · `deleteTrip` · `getHousingShareSuggestions` · `applyTripPricing` · `generatePilgrimsTemplate` · `generatePilgrimsTemplateSafa` · `parsePilgrimsExcel` · `extractPassportDataManual` · `saveHousingNote` · `getPilgrimsForMergedHousing` · `getMergedHousing` · `saveMergedHousing` · `getStatsData` · `getTripClientLinksInfo` · `createTripClientLink` · `revokeTripClientLink` · `getTripAccountsSummary` · `saveTripDraft` · `getTripAccommodationLevels` · `getHousingCateringByGroup` · `getHousingAgreements` · `saveHousingAgreement` · `saveHousingAllocation`

### حسابات العملاء (41)
`saveAccItem` · `saveAccPayment` · `accStatementPdf` · `syncTripAccountsBg` · `deleteAccPayment` · `accHbSyncAll` · `saveAccItemsBulk` · `saveRoomFeeReceipt` · `clientAccountBg` · `getAccPricing` · `saveAccPricing` · `getClientTripStats` · `getClientAccountHistory` · `addClientRecord` · `getClientUnlinkedFees` · `insertClientUnlinkedFees` · `deleteAccItem` · `getClientPricing` · `saveClientPricing` · `setAccDisplayName` · `carryForwardTripBalance` · `transferAccPaymentsBulk` · `transferAccPayment` · `saveAccPaymentsBulk` · `updateAccPaymentsBulk` · `accCounterAccounts` · `accPayCounterSet` · `saveGeneralPaymentsBulk` · `accFixOrphanLines` · `getClientsWithAlerts` · `accGenerateDraft` · `accGlPullPayments` · `updateAccItemsBulk` · `saveClientMergeGroupV2` · `deleteClientMergeGroup` · `clearClientMergeGroup` · `deleteClientRecord` · `updateClientRecord` · `deleteRoomFeeReceipt` · `extractRoomFeeReceiptSmart` · `getRoomFeeLedger`

### ملفات الوزارة (20)
`deleteMinistryFilesBatch` · `saveMinistryFilesBulk` · `setMinistryFileApproved` · `getMfIndividualFileCandidates` · `bulkSetMfFileType` · `saveMfExecPolicy` · `fetchSarSellRate` · `getMfHousingForSelectedPilgrims` · `deleteMinistryFile` · `getMinistryFileHistory` · `getMinistrySupervisorsOnly` · `bulkShareMinistrySupervisors` · `bulkSaveMinistrySupervisors` · `saveMinistrySupervisor` · `deleteMinistrySupervisor` · `suggestMinistrySupervisors` · `getMfIndividualQuotaStats` · `saveMfQuotaTransfer` · `deleteMfQuotaTransfer` · `importMinistryFilesBatch`

### التأشيرات والوكلاء (25)
`saveAgentPayment` · `saveAgentAccItem` · `deleteVisaFilesBatch` · `saveVisaFilesBulk` · `setVisaFileEntryNo` · `getVisaFileHistory` · `deleteVisaFile` · `applyAgentPriceToGroups` · `saveVisaAgentPrices` · `applyTransportPriceToRuns` · `saveVisaAgentTransportPrices` · `getAgentAccount` · `deleteAgentAccItemsBatch` · `deleteAgentPaymentsBatch` · `saveAgentPaymentsBatch` · `saveAgentAccItemsBatch` · `deleteAgentAccItem` · `deleteAgentPayment` · `getAgentAccRowHistory` · `getAgentCompanyAccounts` · `getTransportAgentCompanyPairs` · `saveAgentCompanyAccounts` · `importVisaFilesBatch` · `getAgentAcctVisaStats` · `postAgreementToAgentAccount`

### الإعاشة والاتفاقيات (11)
`saveCateringContracts` · `extractCateringContractText` · `extractCateringContract` · `uploadCateringAttachment` · `findDuplicateCateringContracts` · `getCateringContractHistory` · `getCateringContracts` · `deleteCateringContract` · `mergeCateringDuplicates` · `extractHousingAgreement` · `deleteHousingAgreement`

### الحسابات العامة (GL) والأستاذ والتسويات (29)
`glApMirrorResync` · `xcApply` · `audList2` · `audStatus` · `audSetup` · `audVerify` · `ccAccountsLite` · `ccQuickAccount` · `glMirFlush` · `glAttachList` · `glAttachData` · `hbBridgeBookingGet` · `hbBridgeBookingSave` · `ledgerPendingFor` · `ledgerCount` · `ledgerQueue` · `ledgerDecide` · `ledgerCancel` · `ledgerScrGet` · `ledgerScrSet` · `ledgerSetMode` · `glAutoKick` · `glClientLinks` · `glBotSave` · `glBotSetWebhook` · `glBotTest` · `glBotGet` · `getHbRecon` · `getHbReconDetail`

### الإشعارات (الجرس) (3)
`markNotificationRead` · `deleteNotification` · `markAllNotificationsRead`

### المساعد الذكي (8)
`aiChatList` · `aiChatOpen` · `aiChatDelete` · `aiChatSend` · `aiChatStep` · `aiGetSettings` · `aiSaveSettings` · `aiTestConnection`

### HB / الفنادق (1)
`hotelsHandoff`

### أخرى (1)
`deleteHousingAllocation`

## 3. خطة النقل (بالأولوية)
| # | المرحلة | الدوال | الأسلوب | ملاحظات |
|---|---|---|---|---|
| 1 | حفظ الحجز | saveBookingToServer، deleteBookingRecord، toggleApprovalStatus | `rw2_*` (عدّاد الأرقام + تحقق + إعادة كتابة التحركات + نقل بيانات الرحلة) + outbox للتدقيق | الأعلى أثراً (7.8–10.8 ث). يتطلب عدّاد أرقام ذرّي في Postgres |
| 2 | حسابات العملاء (كتابة) | saveAccItem/Payment (+Bulk)، delete/update/transfer، accGenerateDraft، transferAccItemsBulk | `rw2_*` فوق جداول GL الموجودة | الأرصدة تُحسب من جداول GL مسبقاً |
| 3 | كشف الرحلة | getTripAccountsSummary، getClientTripStats، getClientAccountHistory | `rx2_*` قراءة | تعتمد على نفس جداول 019 |
| 4 | الوكلاء/التأشيرات | getAgentAccount، save/delete AgentAccItem/Payment (+Batch)، saveVisaFilesBulk، import/delete | `rx2_getagentaccount` + `rw2_*` | كشف الوكيل ثقيل: بنود+دفعات+قيود+دورات نقل. حالياً عرض فوري من ذاكرة الجلسة (V4.385) |
| 5 | الوزارة | saveMinistryFilesBulk، import، supervisors، quota، room-fee | `rw2_*` | نفس نمط 016 |
| 6 | الرحلات والمعتمرون | saveTrip، deleteTrip، saveTripPilgrims، assign/move، saveGlobalPilgrim، التسكين | `rw2_*` | تغيّر dv ⇒ تحديث الشاشات تلقائياً |
| 7 | الإعاشة والاتفاقيات | get/save/delete CateringContracts، Housing agreements | جدول + `rw2_*` | |
| 8 | الجرس والإشعارات | mark/delete notifications | `rw2_*` بسيطة | القراءة نُقلت (022) |
| 9 | الإعدادات والمستخدمون | getRequiredFieldsConfig، saveSystemSettings، إدارة المستخدمين، saveUserUiPrefs | قراءة من app_config؛ المستخدمون بـ`app_users` (موجود) | كلمات المرور تبقى PBKDF2/SHA في Postgres |
| 10 | الخلفية | glAutoKick، glLinkConfig، appPulse (Apps Script)، perfReport، syncTripAccountsBg، mfAfterSaveBg/vzAfterSaveBg، xcheck | تنقل إلى pg_cron/outbox أو تبقى خلفية غير حاجبة | لا يحجب المستخدم |
| 11 | الملفات والذكاء | رفع/استخراج PDF/صور (OCR)، aiChat*، Drive | تبقى Apps Script/Edge Functions (Drive وAnthropic) | غير مرتبطة بالسرعة |
| 12 | HB | hbGetAppVersion، hbSsoLogin، getPartyRoleMap، getUnifiedPartyList، getDistinctHotels | `rx2_*` + SSO عبر JWT نفسه | بوابة العملاء بـHMAC منفصل تبقى |
| 13 | الواجهة | نقل الواجهة خارج Apps Script (Vercel/Cloudflare Pages) تستعمل Supabase JWT مباشرة | بعد اكتمال 1–10 | الدخول السريع (021) خطوة أولى |

## 4. تصوّر مزامنة الشيتات الخارجية دون تعطيل ما تم
**المبدأ:** Postgres هو المصدر الوحيد للحقيقة؛ الشيتات «مرايا» و«صناديق إدخال» ولا تُقرأ في مسار المستخدم أبداً.

1. **Postgres → Sheets (مرآة للقراءة/التقارير الخارجية):** كل كتابة بـ`rw2_*` تضيف صفاً في `app_outbox` (kind=`sheet_mirror`, payload={sheet, op, key, row}). مشغّل Apps Script (كل دقيقة، موجود: `_outboxDrain_`) يسحب الصفوف غير المنفّذة دفعات (batch) ويكتبها بالشيت المقابل بعملية `setValues` واحدة، ثم يضع `done_at`. فشل الكتابة بالشيت لا يؤثر على المستخدم ولا على Postgres؛ يُعاد لاحقاً (idempotent بمفتاح الصف).
2. **Sheets → Postgres (للشيتات التي يحرّرها بشر خارج البرنامج: العهدة/الخزينة/البنوك…):** `onEdit`/مشغّل دقيقة يقرأ **تغييرات فقط** (عمود إصدار/بصمة صف `_rowVer_` المستعمل أصلاً) ويرفعها إلى جدول staging `sheet_inbox` ثم دالة Postgres تطبّقها (تحقق + اعتماد maker-checker كما بالقيود المعلّقة الحالية). التعارض: الأحدث `updated_at` يفوز، ويُسجَّل التعارض في سجل التدقيق.
3. **منع الحلقات:** كل صف يحمل `src` (`pg` | `sheet`) و`ver`؛ المزامن لا يعيد كتابة صف مصدره الجهة الأخرى بنفس الإصدار.
4. **مراحل الأمان:** (أ) الوضع الحالي: Sheets مصدر، Postgres نسخة (تم). (ب) **كتابة مزدوجة**: Postgres أولاً ثم outbox للشيت مع تقرير فروقات يومي (`storeCompare`). (ج) Postgres مصدر وحيد والشيت مرآة. (د) إيقاف المرآة لما يمرّ شهر بلا فروقات.
5. **التراجع:** مفتاح `SUPA_WRITES=off` يعيد كل الكتابات إلى Apps Script فوراً (موجود نمطه: أي رفض ⇒ المسار القديم).