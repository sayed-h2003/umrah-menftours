# حصر وظائف Apps Script المتبقية (مُولَّد آلياً من الكود — V4.442)

- وظائف خادم تستدعيها واجهة البرنامج الرئيسي: **449**
- لها مسار Postgres: **103**
- **تعمل من Apps Script وحده: 346**
- برنامج حجوزات الفنادق (HB_App/HB_Portal) منفصل: **121** وظيفة خادم كلها Apps Script، ومصدر بياناته شيتا «حجوزات مكة/المدينة» الخارجيان.

## الدخول والجلسات والمستخدمين والإعدادات — 43

`appBatch` · `appHandoffIssue` · `appPulse` · `audList2` · `audSetup` · `audStatus` · `audUndo` · `audVerify` · `deleteTempFile` · `disableTempCleanupSchedule` · `driveRootAudit` · `driveRootFix` · `getAlertCenter` · `getBackupStatus` · `getFolderSettingsForAdmin` · `getServicesStatus` · `getStatsData` · `getTempCleanupStatus` · `getWebAppUrl` · `ledgerScrGet` · `ledgerScrSet` · `ledgerSetMode` · `lfFetch` · `lfPoll` · `loginUser` · `logoutUserSession` · `perfDiag` · `perfReport` · `perfSetOn` · `perfTop` · `resumeSession` · `runAdminSetupAction` · `runAllTestsForUI` · `saveAlertCenter` · `saveBookingsSortDefault` · `saveRequiredFieldsConfig` · `saveSessionDurationConfig` · `saveSystemSettings` · `setTempCleanupScheduleAuth` · `settingsScreenBootstrap` · `setupUsersSystemFromUI` · `supaIssueToken` · `updateFolderSettingFromUI`

## التنبيهات وبوتات تيليجرام — 23

`deleteNotification` · `getTgAlertGroups` · `getTgCateringConfig` · `getTgNoticeConfig` · `glBotGet` · `glBotLinkCode` · `glBotLinkList` · `glBotLinkPend` · `glBotLinkPendDel` · `glBotLinkSet` · `glBotSave` · `glBotSetWebhook` · `glBotTest` · `linkTripNotification` · `markAllNotificationsRead` · `markNotificationRead` · `saveTgAlertGroups` · `saveTgCateringConfig` · `saveTgNoticeConfig` · `setTgCateringWebhook` · `testTgAlertGroups` · `testTgCateringBot` · `testTgNoticeBot`

## الملفات والطباعة وPDF والذكاء الاصطناعي (Storage/Edge) — 54

`accStatementPdf` · `aiChatDelete` · `aiChatList` · `aiChatOpen` · `aiChatSend` · `aiChatStep` · `aiGetSettings` · `aiSaveSettings` · `aiTestConnection` · `analyzeTicketTextServer` · `createBookingPdfFromHtml` · `deleteBookingAttachmentFile` · `deleteMinistryFile` · `deleteSharedBookingFile` · `deleteTicketFile` · `deleteTicketFromBooking` · `deleteVisaFile` · `exportMovementExcel` · `exportToProfessionalExcelV4` · `exportTransportAccountsExcel` · `extractCateringContract` · `extractCateringContractText` · `extractHousingAgreement` · `extractPassportData` · `extractPassportDataManual` · `extractPassportFromText` · `extractRoomFeeReceiptSmart` · `fetchSarSellRate` · `flightCmpPdf` · `flightPrintExtract` · `flightPrintOcr` · `generateBookingPdfForShare` · `generateHousingPdf` · `generatePilgrimsTemplate` · `generatePilgrimsTemplateSafa` · `generatePrintAccessToken` · `getBookingNoticeHtmlForImage` · `getDriveFileBase64` · `glAttachUpload` · `glFxDaily` · `glFxDailyCronSet` · `glFxDailySave` · `glFxFetchNow` · `glFxRateAt` · `glStmtPdf` · `glVchCoLogoUpload` · `glVchLogo` · `glVoucherPrint` · `parsePilgrimsExcel` · `uploadAndAnalyzeTicket` · `uploadAndParseTicketManual` · `uploadBookingAttachment` · `uploadCateringAttachment` · `uploadCompanyLogo`

## الحسابات العامة (GL) والمحرك التلقائي والعهد والتسويات — 105

`accCounterAccounts` · `accGlPullPayments` · `accPayCounterSet` · `glAccountDelete` · `glAccountDeletePreview` · `glAging` · `glApMirrorResync` · `glAttachData` · `glAttachDelete` · `glAttachList` · `glAutoKick` · `glAutoOvrRelease` · `glAutoPreview` · `glAutoReconcile` · `glAutoSettings` · `glAutoSync` · `glBalLayoutSave` · `glBalUserCustSet` · `glBalanceSheet` · `glCacheReset` · `glCashDupResolve` · `glCashDupScan` · `glCashFlow` · `glClientLinks` · `glCloseYear` · `glCpApply` · `glCpDelete` · `glCpList` · `glCpMirrorResync` · `glCpSrcLostFix` · `glCpSrcLostScan` · `glCsApproveAll` · `glCsAutoSuspSet` · `glCsConnStatus` · `glCsConnectorOff` · `glCsConnectorSetup` · `glCsDupResolve` · `glCsDupScan` · `glCsPendAccounts` · `glCsPendOne` · `glCustSheetApprove` · `glCustSheetGet` · `glCustSheetSave` · `glCustSheetSync` · `glDeleteAccount` · `glDupCrossDismiss` · `glDupCrossResolve` · `glDupOffsetCp` · `glDupScan` · `glEntryHistory` · `glFindDupEntryIds` · `glFindOrphanEntries` · `glGetEntry` · `glHbCharterSettle` · `glHbCharters` · `glHbDeleteCharter` · `glHbDeletePays` · `glHbGlOnlySet` · `glHbKeepList` · `glHbKeepUndo` · `glHbLinkPays` · `glHbMirrorList` · `glHbMirrorResync` · `glHbPartyCode` · `glHbReconcile` · `glHbSaveCharter` · `glHbSaveMap` · `glHbSavePay` · `glHbSaveTrip` · `glHbSeasonClose` · `glHbSeasonPreview` · `glHbSetup` · `glHbState` · `glHbTripHousing` · `glHbUnlinkPay` · `glImportCommit` · `glImportPreview` · `glIncomeStatement` · `glListBatches` · `glMergeAccounts` · `glMirFlush` · `glMoveAccount` · `glOpeningInfo` · `glOutboxKick` · `glProfitability` · `glReconAct` · `glReconRun` · `glReopenYear` · `glRepairDupEntryIds` · `glRepairOrphanEntries` · `glRowDelete` · `glRowHistory` · `glSaveAccount` · `glSaveSettings` · `glSetLockDate` · `glSetupCreate` · `glSetupLink` · `glStatements` · `glStmtIssue` · `glStmtLog` · `glSyncParties` · `glTripRebuild` · `glUndoBatch` · `glUnlinkedPost` · `glUnlinkedRun`

## حسابات العملاء — 26

`accAfterMovedBg` · `accFixOrphanLines` · `accHbSyncAll` · `accSyncBg` · `ccAccountsLite` · `ccQuickAccount` · `clearClientMergeGroup` · `clientAccountBg` · `deleteClientMergeGroup` · `getAccPricing` · `getClientAccountHistory` · `getClientPricing` · `getClientTripStats` · `getClientUnlinkedFees` · `getClientsWithAlerts` · `getTripsPilgrimsMap` · `insertClientUnlinkedFees` · `saveAccItemsBulk` · `saveAccPricing` · `saveClientMergeGroupV2` · `saveClientPricing` · `saveGeneralPaymentsBulk` · `setAccDisplayName` · `setAccMode` · `syncTripAccountsBg` · `updateAccItemsBulk`

## حسابات الوكلاء والنقل — 21

`applyAgentPriceToGroups` · `applyTransportPriceToRuns` · `deleteAgentAccItem` · `deleteAgentAccItemsBatch` · `deleteAgentPayment` · `deleteAgentPaymentsBatch` · `deleteTransportRowEdit` · `getAgentAccRowHistory` · `getAgentAccountExtras` · `getAgentAcctVisaStats` · `getAgentByCompany` · `getAgentCompanyAccounts` · `getTransportAccountsData` · `getTransportAgentCompanyPairs` · `postAgreementToAgentAccount` · `saveAgentAccItem` · `saveAgentAccItemsBatch` · `saveAgentCompanyAccounts` · `saveTransportRowEdit` · `saveVisaAgentPrices` · `saveVisaAgentTransportPrices`

## ملفات الوزارة — 21

`bulkSaveMinistrySupervisors` · `bulkSetMfFileType` · `bulkShareMinistrySupervisors` · `deleteMfQuotaTransfer` · `deleteMinistryFilesBatch` · `deleteMinistrySupervisor` · `deleteRoomFeeReceipt` · `getMfHousingForSelectedPilgrims` · `getMfIndividualFileCandidates` · `getMfIndividualQuotaStats` · `getMinistryFileHistory` · `getMinistrySupervisorsOnly` · `getRoomFeeLedger` · `importMinistryFilesBatch` · `saveMfExecPolicy` · `saveMfQuotaTransfer` · `saveMinistryFilesBulk` · `saveMinistrySupervisor` · `saveRoomFeeReceipt` · `setMinistryFileApproved` · `suggestMinistrySupervisors`

## التأشيرات والسكن والإعاشة — 22

`deleteCateringContract` · `deleteHousingAgreement` · `deleteHousingAllocation` · `deleteVisaFilesBatch` · `findDuplicateCateringContracts` · `getCateringContractHistory` · `getCateringContracts` · `getHousingAgreements` · `getHousingCateringByGroup` · `getHousingShareSuggestions` · `getMergedHousing` · `getPilgrimsForMergedHousing` · `getVisaFileHistory` · `importVisaFilesBatch` · `mergeCateringDuplicates` · `saveCateringContracts` · `saveHousingAgreement` · `saveHousingAllocation` · `saveVisaFilesBulk` · `setVisaFileEntryNo` · `vzCacheClearBg` · `xcApply`

## الرحلات والمعتمرين والإشعارات — 31

`addClientRecord` · `adoptBookingGroupToTrip` · `applyTripPricing` · `bookingAfterSaveBg` · `bookingCacheBustBg` · `cacheBustBg` · `checkBusPriceColumnsExist` · `createTripClientLink` · `deleteClientRecord` · `deleteCompanySetting` · `getBookingLinkSuggestions` · `getBookingPilgrimNames` · `getCompaniesSettings` · `getRule70Bookings` · `getTripAccommodationLevels` · `getTripBookingCompare` · `getTripByName` · `getTripChangeLog` · `getTripClientLinksInfo` · `getTripSnapshots` · `hbBridgeBookingGet` · `hbBridgeBookingSave` · `hbUserSaveFromMain` · `kashfAfterSaveBg` · `revokeTripClientLink` · `runOneTimeReconciliation` · `saveCompanySetting` · `saveGlobalPilgrim` · `saveTripDraft` · `syncTripBookingByName` · `updateClientRecord`

