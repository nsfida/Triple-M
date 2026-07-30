/* Modularized from script.js lines 767-1854 — DOM element map (els). Load order must be preserved. */
const els = {
  lockScreen: document.getElementById("lockScreen"),
  zipUsernameInput: document.getElementById("zipUsernameInput"),
  zipPasswordInput: document.getElementById("zipPasswordInput"),
  rememberMeCheckbox: document.getElementById("rememberMeCheckbox"),
  unlockBtn: document.getElementById("unlockBtn"),
  guestLoginBtn: document.getElementById("trialSignupBtn") || document.getElementById("guestLoginBtn"),
  trialSignupBtn: document.getElementById("trialSignupBtn"),
  trialExpiredOverlay: document.getElementById("trialExpiredOverlay"),
  trialExpiredLogoutBtn: document.getElementById("trialExpiredLogoutBtn"),
  accessBannerTitle: document.getElementById("accessBannerTitle"),
  accessBannerMessage: document.getElementById("accessBannerMessage"),
  accessBannerContact: document.getElementById("accessBannerContact"),
  lockError: document.getElementById("lockError"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  welcomeName: document.getElementById("welcomeName"),
  lockScreenSubtitle: document.getElementById("lockScreenSubtitle"),
  standaloneAboutSubtitle: document.getElementById("standaloneAboutSubtitle"),
  mainAppSubtitle: document.getElementById("mainAppSubtitle"),
  app: document.getElementById("app"),
  guestModeBanner: document.getElementById("guestModeBanner"),
  weakPasswordBanner: document.getElementById("weakPasswordBanner"),
  weakPasswordBannerBtn: document.getElementById("weakPasswordBannerBtn"),
  accountMenuBtn: document.getElementById("accountMenuBtn"),
  accountMenuUserName: document.getElementById("accountMenuUserName"),
  secretPinBtn: document.getElementById("secretPinBtn"),
  deleteSmartPinBtn: document.getElementById("deleteSmartPinBtn"),
  companyTeamBtn: document.getElementById("companyTeamBtn"),
  learnMoreBtn: document.getElementById("learnMoreBtn"),
  pricingBtn: document.getElementById("pricingBtn"),
  standaloneAboutSection: document.getElementById("standaloneAboutSection"),
  closeStandaloneAboutBtn: document.getElementById("closeStandaloneAboutBtn"),
  backToLoginBtn: document.getElementById("backToLoginBtn"),
  standalonePricingSection: document.getElementById("standalonePricingSection"),
  closeStandalonePricingBtn: document.getElementById("closeStandalonePricingBtn"),
  backToLoginFromPricingBtn: document.getElementById("backToLoginFromPricingBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  mainOverview: document.getElementById("mainOverview"),
  statsGrid: document.getElementById("statsGrid"),
  givenList: document.getElementById("givenList"),
  receivedList: document.getElementById("receivedList"),
  takenList: document.getElementById("takenList"),
  returnedList: document.getElementById("returnedList"),
  installmentsList: document.getElementById("installmentsList"),
  goodsList: document.getElementById("goodsList"),
  inventoryStockView: document.getElementById("inventoryStockView"),
  inventoryDraftsView: document.getElementById("inventoryDraftsView"),
  inventoryCustomersView: document.getElementById("inventoryCustomersView"),
  inventoryBarcodesView: document.getElementById("inventoryBarcodesView"),
  inventoryScannerView: document.getElementById("inventoryScannerView"),
  inventoryOutstandingList: document.getElementById("inventoryOutstandingList"),
  inventoryBarcodesList: document.getElementById("inventoryBarcodesList"),
  inventoryScannerHost: document.getElementById("inventoryScannerHost"),
  inventoryDraftsList: document.getElementById("inventoryDraftsList"),
  inventorySectionDesc: document.getElementById("inventorySectionDesc"),
  openInventoryCustomersBtn: document.getElementById("openInventoryCustomersBtn"),
  openInventoryBarcodesBtn: document.getElementById("openInventoryBarcodesBtn"),
  openInventoryScannerBtn: document.getElementById("openInventoryScannerBtn"),
  openInventoryDraftsBtn: document.getElementById("openInventoryDraftsBtn"),
  expensesList: document.getElementById("expensesList"),
  connectSupabaseBtn: document.getElementById("connectSupabaseBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  importCsvInput: document.getElementById("importCsvInput"),
  downloadAllDataJsonBtn: document.getElementById("downloadAllDataJsonBtn"),
  downloadAllDataCsvBtn: document.getElementById("downloadAllDataCsvBtn"),
  uploadBackupBtn: document.getElementById("uploadBackupBtn"),
  downloadAllSectionsPdfBtn: document.getElementById("downloadAllSectionsPdfBtn"),
  taxSettingsBtn: document.getElementById("taxSettingsBtn"),
  downloadGivenPdfBtn: document.getElementById("downloadGivenPdfBtn"),
  downloadReceivedPdfBtn: document.getElementById("downloadReceivedPdfBtn"),
  downloadTakenPdfBtn: document.getElementById("downloadTakenPdfBtn"),
  downloadReturnedPdfBtn: document.getElementById("downloadReturnedPdfBtn"),
  downloadExpensesPdfBtn: document.getElementById("downloadExpensesPdfBtn"),
  entryModal: document.getElementById("entryModal"),
  editModal: document.getElementById("editModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalDesc: document.getElementById("modalDesc"),
  principalModalForm: document.getElementById("principalModalForm"),
  paymentModalForm: document.getElementById("paymentModalForm"),
  editForm: document.getElementById("editForm"),
  modalLoanSelect: document.getElementById("modalLoanSelect"),
  principalSubmitBtn: document.getElementById("principalSubmitBtn"),
  paymentSubmitBtn: document.getElementById("paymentSubmitBtn"),
  multiEntryCount: document.getElementById("multiEntryCount"),
  multiEntryContainer: document.getElementById("multiEntryContainer"),
  goodsModal: document.getElementById("goodsModal"),
  goodsModalTitle: document.getElementById("goodsModalTitle"),
  goodsModalDesc: document.getElementById("goodsModalDesc"),
  goodsBoughtForm: document.getElementById("goodsBoughtForm"),
  goodsSoldForm: document.getElementById("goodsSoldForm"),
  goodsItemSelect: document.getElementById("goodsItemSelect"),
  goodsNewItemToggleBtn: document.getElementById("goodsNewItemToggleBtn"),
  goodsNewItemFields: document.getElementById("goodsNewItemFields"),
  openGoodsBoughtBtn: document.getElementById("openGoodsBoughtBtn"),
  openGoodsSoldBtn: document.getElementById("openGoodsSoldBtn"),
  goodsBoughtTotalAmount: document.getElementById("goodsBoughtTotalAmount"),
  goodsPurchaseWalletSelect: document.getElementById("goodsPurchaseWalletSelect"),
  goodsPurchaseLines: document.getElementById("goodsPurchaseLines"),
  addGoodsPurchaseLineBtn: document.getElementById("addGoodsPurchaseLineBtn"),
  goodsBoughtDateInline: document.getElementById("goodsBoughtDateInline"),
  goodsReceiptNumber: document.getElementById("goodsReceiptNumber"),
  goodsCustomerSelect: document.getElementById("goodsCustomerSelect"),
  goodsNewCustomerField: document.getElementById("goodsNewCustomerField"),
  goodsNewCustomerName: document.getElementById("goodsNewCustomerName"),
  goodsNewCustomerPhoneField: document.getElementById("goodsNewCustomerPhoneField"),
  goodsNewCustomerPhone: document.getElementById("goodsNewCustomerPhone"),
  goodsNewCustomerAddressField: document.getElementById("goodsNewCustomerAddressField"),
  goodsNewCustomerAddress: document.getElementById("goodsNewCustomerAddress"),
  goodsSaleLines: document.getElementById("goodsSaleLines"),
  addGoodsSaleLineBtn: document.getElementById("addGoodsSaleLineBtn"),
  goodsSaleGrandTotal: document.getElementById("goodsSaleGrandTotal"),
  goodsSalePaidAmount: document.getElementById("goodsSalePaidAmount"),
  goodsSaleBalanceAmount: document.getElementById("goodsSaleBalanceAmount"),
  goodsSaleWalletSelect: document.getElementById("goodsSaleWalletSelect"),
  goodsSettlementModal: document.getElementById("goodsSettlementModal"),
  goodsSettlementForm: document.getElementById("goodsSettlementForm"),
  goodsSettlementReceipt: document.getElementById("goodsSettlementReceipt"),
  goodsSettlementCustomer: document.getElementById("goodsSettlementCustomer"),
  goodsSettlementBalance: document.getElementById("goodsSettlementBalance"),
  goodsSettlementAmount: document.getElementById("goodsSettlementAmount"),
  goodsSettlementDate: document.getElementById("goodsSettlementDate"),
  goodsSettlementWalletSelect: document.getElementById("goodsSettlementWalletSelect"),
  goodsSettlementInvoiceListField: document.getElementById("goodsSettlementInvoiceListField"),
  goodsSettlementInvoiceList: document.getElementById("goodsSettlementInvoiceList"),
  inventoryCustomerModal: document.getElementById("inventoryCustomerModal"),
  inventoryCustomerTitle: document.getElementById("inventoryCustomerTitle"),
  inventoryCustomerDesc: document.getElementById("inventoryCustomerDesc"),
  inventoryCustomerBody: document.getElementById("inventoryCustomerBody"),
  inventoryCustomerStatementBtn: document.getElementById("inventoryCustomerStatementBtn"),
  inventoryEditItemModal: document.getElementById("inventoryEditItemModal"),
  inventoryEditItemForm: document.getElementById("inventoryEditItemForm"),
  inventoryEditItemSummary: document.getElementById("inventoryEditItemSummary"),
  installmentEditModal: document.getElementById("installmentEditModal"),
  installmentEditForm: document.getElementById("installmentEditForm"),
  installmentEditSummary: document.getElementById("installmentEditSummary"),
  installmentPlanModal: document.getElementById("installmentPlanModal"),
  installmentPlanBody: document.getElementById("installmentPlanBody"),
  installmentPlanTitle: document.getElementById("installmentPlanTitle"),
  installmentPlanDesc: document.getElementById("installmentPlanDesc"),
  sectionDetailsModal: document.getElementById("sectionDetailsModal"),
  sectionDetailsTitle: document.getElementById("sectionDetailsTitle"),
  sectionDetailsDesc: document.getElementById("sectionDetailsDesc"),
  sectionDetailsBody: document.getElementById("sectionDetailsBody"),
  sectionDetailsActions: document.getElementById("sectionDetailsActions"),
  expenseModal: document.getElementById("expenseModal"),
  expenseModalTitle: document.getElementById("expenseModalTitle"),
  expenseModalDesc: document.getElementById("expenseModalDesc"),
  expenseAccountForm: document.getElementById("expenseAccountForm"),
  expenseTopupForm: document.getElementById("expenseTopupForm"),
  expenseEntryForm: document.getElementById("expenseEntryForm"),
  expenseTopupAccountSelect: document.getElementById("expenseTopupAccountSelect"),
  expenseSpendAccountSelect: document.getElementById("expenseSpendAccountSelect"),
  expenseCurrencySelect: document.getElementById("expenseCurrencySelect"),
  expenseTypeSelect: document.getElementById("expenseTypeSelect"),
  expenseTaxApplied: document.getElementById("expenseTaxApplied"),
  expenseTaxRate: document.getElementById("expenseTaxRate"),
  expenseTaxMode: document.getElementById("expenseTaxMode"),
  expenseTaxPreview: document.getElementById("expenseTaxPreview"),
  openExpenseAccountBtn: document.getElementById("openExpenseAccountBtn"),
  openExpenseTopupBtn: document.getElementById("openExpenseTopupBtn"),
  openExpenseEntryBtn: document.getElementById("openExpenseEntryBtn"),
  expenseWalletFilters: document.getElementById("expenseWalletFilters"),
  expenseItemNameInput: document.getElementById("expenseItemNameInput"),
  expenseItemIntentWrap: document.getElementById("expenseItemIntentWrap"),
  expenseBtcAddressField: document.getElementById("expenseBtcAddressField"),
  expenseBtcBalanceStatus: document.getElementById("expenseBtcBalanceStatus"),
  pageCurrencyBtn: document.getElementById("pageCurrencyBtn"),
  pageCurrencyLabel: document.getElementById("pageCurrencyLabel"),
  pageCurrencyDropdown: document.getElementById("pageCurrencyDropdown"),
  emptyRecycleBinBtn: document.getElementById("emptyRecycleBinBtn"),
  transferModal: document.getElementById("transferModal"),
  transferModalTitle: document.getElementById("transferModalTitle"),
  transferModalDesc: document.getElementById("transferModalDesc"),
  transferForm: document.getElementById("transferForm"),
  transferFromWallet: document.getElementById("transferFromWallet"),
  transferToWallet: document.getElementById("transferToWallet"),
  conversionRateInput: document.getElementById("conversionRateInput"),
  conversionHelp: document.getElementById("conversionHelp"),
  fromCurrencyIndicator: document.getElementById("fromCurrencyIndicator"),
  toCurrencyIndicator: document.getElementById("toCurrencyIndicator"),
  toggleWalletsBtn: document.getElementById("toggleWalletsBtn"),
  walletsOverviewSection: document.getElementById("walletsOverviewSection"),
  walletsBanner: document.getElementById("walletsBanner"),
  walletsContent: document.getElementById("walletsContent"),
  toggleMainOverviewBtn: document.getElementById("toggleMainOverviewBtn"),
  mainOverviewBanner: document.getElementById("mainOverviewBanner"),
  mainOverviewContent: document.getElementById("mainOverviewContent"),
  btcWifInput: document.getElementById("btcWifInput"),
  btcImportBtn: document.getElementById("btcImportBtn"),
  btcGenerateBtn: document.getElementById("btcGenerateBtn"),
  btcDownloadWalletPdfBtn: document.getElementById("btcDownloadWalletPdfBtn"),
  btcClearBtn: document.getElementById("btcClearBtn"),
  btcWalletStatus: document.getElementById("btcWalletStatus"),
  btcWalletDetails: document.getElementById("btcWalletDetails"),
  btcPrivateHexValue: document.getElementById("btcPrivateHexValue"),
  btcWifCompressedValue: document.getElementById("btcWifCompressedValue"),
  btcWifUncompressedValue: document.getElementById("btcWifUncompressedValue"),
  btcLegacyCompressedValue: document.getElementById("btcLegacyCompressedValue"),
  btcLegacyUncompressedValue: document.getElementById("btcLegacyUncompressedValue"),
  btcAddressTypeList: document.getElementById("btcAddressTypeList"),
  btcSelectedAddressHelp: document.getElementById("btcSelectedAddressHelp"),
  btcMaskedWif: document.getElementById("btcMaskedWif"),
  btcCopyWifBtn: document.getElementById("btcCopyWifBtn"),
  btcWalletAddress: document.getElementById("btcWalletAddress"),
  btcCopyAddressInfoBtn: document.getElementById("btcCopyAddressInfoBtn"),
  btcSaveAddressBtn: document.getElementById("btcSaveAddressBtn"),
  btcBalanceValue: document.getElementById("btcBalanceValue"),
  btcReceivedValue: document.getElementById("btcReceivedValue"),
  btcSentValue: document.getElementById("btcSentValue"),
  btcTxCountValue: document.getElementById("btcTxCountValue"),
  btcSendBtn: document.getElementById("btcSendBtn"),
  btcReceiveBtn: document.getElementById("btcReceiveBtn"),
  btcRefreshBtn: document.getElementById("btcRefreshBtn"),
  btcLoginSection: document.getElementById("btcLoginSection"),
  btcWalletInfoSection: document.getElementById("btcWalletInfoSection"),
  btcHistorySection: document.getElementById("btcHistorySection"),
  btcHistoryList: document.getElementById("btcHistoryList"),
  btcDownloadPdfBtn: document.getElementById("btcDownloadPdfBtn"),
  btcSendModal: document.getElementById("btcSendModal"),
  btcReceiveModal: document.getElementById("btcReceiveModal"),
  btcSendForm: document.getElementById("btcSendForm"),
  btcRecipientsList: document.getElementById("btcRecipientsList"),
  btcAddRecipientBtn: document.getElementById("btcAddRecipientBtn"),
  btcToAddress: document.getElementById("btcToAddress"),
  btcSendAmount: document.getElementById("btcSendAmount"),
  btcSendUsd: document.getElementById("btcSendUsd"),
  btcFeeRate: document.getElementById("btcFeeRate"),
  btcMaxBtn: document.getElementById("btcMaxBtn"),
  btcGuestFeeNotice: document.getElementById("btcGuestFeeNotice"),
  btcGuestFeeBtc: document.getElementById("btcGuestFeeBtc"),
  btcGuestFeeAddress: document.getElementById("btcGuestFeeAddress"),
  btcGuestSaveNotice: document.getElementById("btcGuestSaveNotice"),
  btcSendTotalPreview: document.getElementById("btcSendTotalPreview"),
  btcSendStatus: document.getElementById("btcSendStatus"),
  btcBroadcastBtn: document.getElementById("btcBroadcastBtn"),
  btcQrBox: document.getElementById("btcQrBox"),
  btcReceiveAddressList: document.getElementById("btcReceiveAddressList"),
  btcReceiveAddressLabel: document.getElementById("btcReceiveAddressLabel"),
  btcReceiveAddress: document.getElementById("btcReceiveAddress"),
  btcCopyAddressBtn: document.getElementById("btcCopyAddressBtn"),
  btcTransactionSuccessOverlay: document.getElementById("btcTransactionSuccessOverlay"),
  btcTransactionSuccessAmount: document.getElementById("btcTransactionSuccessAmount"),
  btcTransactionSuccessFromWallet: document.getElementById("btcTransactionSuccessFromWallet"),
  btcTransactionSuccessToWallet: document.getElementById("btcTransactionSuccessToWallet"),
  btcTransactionSuccessTxid: document.getElementById("btcTransactionSuccessTxid"),
  moneyAddedSuccessOverlay: document.getElementById("moneyAddedSuccessOverlay"),
  moneyAddedSuccessAmount: document.getElementById("moneyAddedSuccessAmount"),
  moneyAddedSuccessWallet: document.getElementById("moneyAddedSuccessWallet"),
  // Watch wallet elements
  btcFullWalletBtn: document.getElementById("btcFullWalletBtn"),
  btcWatchWalletBtn: document.getElementById("btcWatchWalletBtn"),
  btcSeedWalletBtn: document.getElementById("btcSeedWalletBtn"),
  btcBrainWalletBtn: document.getElementById("btcBrainWalletBtn"),
  btcBulkWalletBtn: document.getElementById("btcBulkWalletBtn"),
  btcHexWalletBtn: document.getElementById("btcHexWalletBtn"),
  btcBulkWalletFileInput: document.getElementById("btcBulkWalletFileInput"),
  btcBulkWalletsSection: document.getElementById("btcBulkWalletsSection"),
  btcBulkWalletsList: document.getElementById("btcBulkWalletsList"),
  btcBulkImportStatus: document.getElementById("btcBulkImportStatus"),
  btcFullWalletSection: document.getElementById("btcFullWalletSection"),
  btcWatchWalletSection: document.getElementById("btcWatchWalletSection"),
  btcSeedWalletSection: document.getElementById("btcSeedWalletSection"),
  btcBrainWalletSection: document.getElementById("btcBrainWalletSection"),
  btcHexWalletSection: document.getElementById("btcHexWalletSection"),
  btcAddressInput: document.getElementById("btcAddressInput"),
  btcWatchAddressBtn: document.getElementById("btcWatchAddressBtn"),
  btcSeedPhraseInput: document.getElementById("btcSeedPhraseInput"),
  btcSeedImportBtn: document.getElementById("btcSeedImportBtn"),
  btcSeedCreate12Btn: document.getElementById("btcSeedCreate12Btn"),
  btcSeedCreate24Btn: document.getElementById("btcSeedCreate24Btn"),
  btcBrainWalletInput: document.getElementById("btcBrainWalletInput"),
  btcBrainWalletImportBtn: document.getElementById("btcBrainWalletImportBtn"),
  btcHexInput: document.getElementById("btcHexInput"),
  btcHexImportBtn: document.getElementById("btcHexImportBtn"),
  btcSendWifSection: document.getElementById("btcSendWifSection"),
  btcSendWifInput: document.getElementById("btcSendWifInput"),
  btcSendFromAddress: document.getElementById("btcSendFromAddress"),
  btcScanImportWifQrBtn: document.getElementById("btcScanImportWifQrBtn"),
  btcScanWatchAddressQrBtn: document.getElementById("btcScanWatchAddressQrBtn"),
  btcScanWifQrBtn: document.getElementById("btcScanWifQrBtn"),
  btcWifQrScannerModal: document.getElementById("btcWifQrScannerModal"),
  btcWifQrVideo: document.getElementById("btcWifQrVideo"),
  btcWifQrCanvas: document.getElementById("btcWifQrCanvas"),
  btcWifQrStatus: document.getElementById("btcWifQrStatus"),
  btcWifQrStopBtn: document.getElementById("btcWifQrStopBtn"),
  // USD price display elements
  btcBalanceUsd: document.getElementById("btcBalanceUsd"),
  btcReceivedUsd: document.getElementById("btcReceivedUsd"),
  btcSentUsd: document.getElementById("btcSentUsd"),
  btcPriceDisplay: document.getElementById("btcPriceDisplay"),
  // Saved Bitcoin wallets elements
  btcSavedWalletsSection: document.getElementById("btcSavedWalletsSection"),
  btcSavedWalletsList: document.getElementById("btcSavedWalletsList"),
  btcRefreshSavedBtn: document.getElementById("btcRefreshSavedBtn"),
  // Existing addresses dropdown elements
  btcExistingAddressesBtn: document.getElementById("btcExistingAddressesBtn"),
  btcExistingAddressesDropdown: document.getElementById("btcExistingAddressesDropdown"),
  btcExistingAddressesList: document.getElementById("btcExistingAddressesList"),
  btcExistingAddressesLabel: document.getElementById("btcExistingAddressesLabel"),
  notesPanel: document.getElementById("notesPanel"),
  noteInput: document.getElementById("noteInput"),
  saveNoteBtn: document.getElementById("saveNoteBtn"),
  searchNotes: document.getElementById("searchNotes"),
  notesList: document.getElementById("notesList")
};

const INSTALLMENT_TAG = "[INSTALLMENT]";
const GOODS_TAG = "[GOODS]";
const EXPENSE_ACCOUNT_TAG = "[EXPENSE_ACCOUNT]";
const DELETED_TAG = "[DELETED]";
const INVENTORY_CATEGORY_COUNT = "count";
const INVENTORY_CATEGORY_WEIGHT = "weight";
const INVENTORY_CATEGORY_LENGTH = "length";
const INVENTORY_CATEGORY_VOLUME = "volume";
const INVENTORY_UNIT_ITEM = "item";
const INVENTORY_UNIT_KG = "kg";
const INVENTORY_UNIT_GRAM = "g";
const INVENTORY_UNIT_M = "m";
const INVENTORY_UNIT_CM = "cm";
const INVENTORY_UNIT_L = "l";
const INVENTORY_UNIT_ML = "ml";
const INVENTORY_UNIT_BOTTLE = "bottle";
const INVENTORY_NEW_CUSTOMER_VALUE = "__new_customer__";
const INVENTORY_CUSTOM_TYPE_VALUE = "__custom_type__";
const INVENTORY_CUSTOM_BRAND_VALUE = "__custom_brand__";
const INVENTORY_CUSTOM_VARIANT_VALUE = "__custom_variant__";
const INVENTORY_DEFAULT_ITEM_TYPES = [
  "Electronics",
  "Perfumes",
  "Liquids",
  "Food & Grocery",
  "Clothing",
  "Hardware",
  "Tools",
  "Stationery",
  "Furniture",
  "Cables & Pipes",
  "Books",
  "General"
];
const INVENTORY_TX_PURCHASE = "PURCHASE";
const INVENTORY_TX_SALE = "SALE";
const INVENTORY_TX_SETTLEMENT = "SETTLEMENT";
const INVENTORY_TX_CUSTOMER = "CUSTOMER";
const BACKUP_STORAGE_KEY = "loanledger-json-backup-v1";
const GUEST_BACKUP_STORAGE_KEY = "loanledger-guest-json-backup-v1";
const RECYCLE_BIN_STORAGE_KEY = "loanledger-recycle-bin-v1";
const GUEST_RECYCLE_BIN_STORAGE_KEY = "loanledger-guest-recycle-bin-v1";
const GUEST_NOTES_STORAGE_KEY = "loanledger-guest-notes-v1";
const GUEST_BITCOIN_WALLETS_STORAGE_KEY = "loanledger-guest-bitcoin-wallets-v1";
const TAX_SETTINGS_STORAGE_KEY = "loanledger-tax-settings-v1";
const IMPORT_SESSION_KEY = "loanledger-imported-file-v1";
const FLOAT_CURRENCY_PATHS = ["currency-float-path-1", "currency-float-path-2", "currency-float-path-3", "currency-float-path-4"];
const GUEST_STORAGE_KEYS = [
  GUEST_BACKUP_STORAGE_KEY,
  GUEST_RECYCLE_BIN_STORAGE_KEY,
  GUEST_NOTES_STORAGE_KEY,
  GUEST_BITCOIN_WALLETS_STORAGE_KEY
];
const LEDGER_SCOPE_EXPENSES = "expenses";
const LEDGER_SCOPE_GOODS = "goods";
const LEDGER_SCOPE_INSTALLMENTS = "installments";
const LEDGER_SCOPE_LOANS_GIVEN = "loans-given";
const LEDGER_SCOPE_LOANS_TAKEN = "loans-taken";
const LEDGER_DATA_SCOPES = [
  LEDGER_SCOPE_EXPENSES,
  LEDGER_SCOPE_GOODS,
  LEDGER_SCOPE_INSTALLMENTS,
  LEDGER_SCOPE_LOANS_GIVEN,
  LEDGER_SCOPE_LOANS_TAKEN
];

function resetLazyDataState({ clearEntries = false } = {}){
  state.loadedLedgerScopes = new Set();
  state.loadingLedgerScopes = new Set();
  state.ledgerLoadPromises = new Map();
  state.notesLoaded = false;
  state.notesLoading = false;
  state.assetsLoaded = false;
  state.assetsLoading = false;
  state.assets = [];
  state.assetTransactions = [];
  state.bitcoinWalletsLoaded = false;
  state.bitcoinWalletsLoading = false;
  resetExpenseLazyState();
  resetInventoryLazyState();
  if (clearEntries) {
    state.entries = [];
    state.recycleBin = [];
    updateDbSnapshot([]);
    renderRecycleBinDropdown();
  }
}

function resetInventoryLazyState(){
  state.inventoryLazy = {
    enabled: false,
    rpcAvailable: state.inventoryLazy?.rpcAvailable ?? null,
    summaries: [],
    queryKey: "",
    loading: false,
    detailLoaded: new Set(),
    lastError: ""
  };
  state.inventoryBrandsLoaded = false;
  state.inventorySalesLoaded = false;
  state.inventoryCategoriesLoaded = false;
  state.inventoryActiveSection = "";
}

function isInventoryLazyMode(){
  return !!(state.inventoryLazy && state.inventoryLazy.enabled && state.inventoryLazy.rpcAvailable !== false);
}

function resetExpenseLazyState(){
  state.expenseLazy = {
    enabled: false,
    rpcAvailable: state.expenseLazy?.rpcAvailable ?? null,
    summaries: [],
    summaryByGroupId: new Map(),
    activityQueryKey: "",
    loadingSummaries: false,
    loadingActivity: false,
    historyPreferOpen: true,
    detailCache: new Map(),
    lastError: ""
  };
}

function isExpenseLazyMode(){
  return !!(state.expenseLazy && state.expenseLazy.enabled && state.expenseLazy.rpcAvailable !== false);
}

function expenseLazyActivityQueryKey(){
  const bounds = expenseHistoryRangeBounds();
  const search = String(state.search.expenses || "").trim().toLowerCase();
  const groupId = state.expenseWalletFilter && state.expenseWalletFilter !== "all"
    ? String(state.expenseWalletFilter)
    : "";
  return [
    state.expenseHistoryRange || "today",
    bounds.from || "",
    bounds.to || "",
    search,
    groupId
  ].join("|");
}

function isGuestMode(){
  return state.guestMode === true;
}

function getUserAccessFlags(user = state.sessionUser){
  if (!user) {
    return {
      access_plan: "full",
      is_trial: false,
      trial_active: false,
      trial_expired: false,
      period_active: false,
      period_expired: false,
      trial_days_remaining: null,
      has_access_period: false,
      unlimited_access: true,
      days_past_expiry: 0,
      grace_active: false,
      grace_days_left: null,
      lock_active: false,
      lock_days_left: null,
      lock_starts_at: null,
      should_auto_disable: false,
      access_disable_at: null,
      data_access_allowed: true
    };
  }
  // Prefer server-computed flags when present on the profile
  if (user.period_expired != null || user.grace_active != null || user.has_access_period != null || user.lock_active != null) {
    const plan = String(user.access_plan || "full").toLowerCase();
    const isTrial = plan === "trial" || user.is_trial === true;
    const periodExpired = user.period_expired === true || user.trial_expired === true;
    const periodActive = user.period_active === true || user.trial_active === true;
    const graceActive = user.grace_active === true;
    const lockActive = user.lock_active === true;
    return {
      access_plan: plan || "full",
      is_trial: isTrial,
      trial_active: isTrial && periodActive,
      trial_expired: isTrial && periodExpired,
      period_active: periodActive,
      period_expired: periodExpired,
      trial_days_remaining: user.trial_days_remaining ?? null,
      trial_expires_at: user.trial_expires_at || null,
      has_access_period: user.has_access_period === true || !!user.trial_expires_at,
      unlimited_access: user.unlimited_access === true || (!user.trial_expires_at && plan === "full"),
      days_past_expiry: Number(user.days_past_expiry) || 0,
      grace_active: graceActive,
      grace_days_left: user.grace_days_left ?? null,
      lock_active: lockActive,
      lock_days_left: user.lock_days_left ?? null,
      lock_starts_at: user.lock_starts_at || null,
      should_auto_disable: user.should_auto_disable === true,
      access_disable_at: user.access_disable_at || null,
      access_last_extended_at: user.access_last_extended_at || null,
      access_last_extended_until: user.access_last_extended_until || null,
      // Grace always allows workspace use, even if an older API still sent data_access_allowed=false
      data_access_allowed: graceActive
        || periodActive
        || user.unlimited_access === true
        || (typeof user.data_access_allowed === "boolean" ? user.data_access_allowed : !periodExpired)
    };
  }

  const plan = String(user.access_plan || "full").toLowerCase();
  const expiresAt = user.trial_expires_at ? new Date(user.trial_expires_at) : null;
  const now = Date.now();
  const isTrial = plan === "trial";
  const isProtected = user.is_protected === true;
  const hasPeriod = !isProtected && (isTrial || (expiresAt && !Number.isNaN(expiresAt.getTime())));
  const unlimited = isProtected || (plan === "full" && !hasPeriod);
  const GRACE_DAYS = 3;
  const LOCK_DAYS = 1;
  let periodExpired = false;
  let periodActive = false;
  let daysRemaining = user.trial_days_remaining;
  let daysPast = 0;
  let graceActive = false;
  let graceDaysLeft = null;
  let lockActive = false;
  let lockDaysLeft = null;
  let lockStartsAt = null;
  let shouldDisable = false;
  let disableAt = null;

  if (hasPeriod) {
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
      periodExpired = true;
      if (expiresAt && !Number.isNaN(expiresAt.getTime())) {
        daysPast = Math.max(0, Math.ceil((now - expiresAt.getTime()) / 86400000));
        lockStartsAt = new Date(expiresAt.getTime() + GRACE_DAYS * 86400000).toISOString();
        disableAt = new Date(expiresAt.getTime() + (GRACE_DAYS + LOCK_DAYS) * 86400000).toISOString();
        graceActive = daysPast < GRACE_DAYS;
        if (graceActive) graceDaysLeft = Math.max(0, GRACE_DAYS - daysPast);
        lockActive = !graceActive && daysPast < (GRACE_DAYS + LOCK_DAYS);
        if (lockActive) lockDaysLeft = Math.max(0, (GRACE_DAYS + LOCK_DAYS) - daysPast);
        shouldDisable = daysPast >= (GRACE_DAYS + LOCK_DAYS);
      } else {
        daysPast = GRACE_DAYS + LOCK_DAYS;
        shouldDisable = true;
      }
    } else {
      periodActive = true;
      if (daysRemaining == null || daysRemaining === "") {
        daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now) / 86400000));
      }
      lockStartsAt = new Date(expiresAt.getTime() + GRACE_DAYS * 86400000).toISOString();
      disableAt = new Date(expiresAt.getTime() + (GRACE_DAYS + LOCK_DAYS) * 86400000).toISOString();
    }
  }

  return {
    access_plan: plan || "full",
    is_trial: isTrial,
    trial_active: isTrial && periodActive,
    trial_expired: isTrial && periodExpired,
    period_active: periodActive,
    period_expired: periodExpired,
    trial_days_remaining: daysRemaining,
    trial_expires_at: user.trial_expires_at || null,
    has_access_period: !!hasPeriod,
    unlimited_access: unlimited,
    days_past_expiry: daysPast,
    grace_active: graceActive,
    grace_days_left: graceDaysLeft,
    lock_active: lockActive,
    lock_days_left: lockDaysLeft,
    lock_starts_at: lockStartsAt,
    should_auto_disable: shouldDisable,
    access_disable_at: disableAt,
    access_last_extended_at: user.access_last_extended_at || null,
    access_last_extended_until: user.access_last_extended_until || null,
    data_access_allowed: unlimited || periodActive || graceActive || user.data_access_allowed === true
  };
}

function accessPeriodDaysFromUi(period, customDays){
  const p = String(period || "custom").toLowerCase();
  if (p === "week") return 7;
  if (p === "month") return 30;
  if (p === "year") return 365;
  const n = Math.floor(Number(customDays) || 0);
  return Math.max(1, Math.min(3650, n || 0));
}

function accessPeriodLabel(period, days, untilDate){
  const p = String(period || "custom").toLowerCase();
  if (p === "week") return "1 week (7 days)";
  if (p === "month") return "1 month (30 days)";
  if (p === "year") return "1 year (365 days)";
  if (p === "date" || untilDate) return `Until ${untilDate || "selected date"}`;
  const n = Math.max(1, Math.floor(Number(days) || 0));
  return `${n} day${n === 1 ? "" : "s"}`;
}

function toInputDateValue(value){
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function minExtendDateValue(){
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toInputDateValue(d.toISOString());
}

function addCalendarDaysToDateValue(value, days){
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) {
    return minExtendDateValue();
  }
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + Number(days || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatAccessDateShort(value){
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function formatAccessDateTimeShort(value){
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

function adminAccessActionLabel(action){
  const a = String(action || "").toLowerCase();
  if (a === "extend") return "Extended";
  if (a === "reduce") return "Reduced";
  if (a === "clear") return "Cleared (unlimited)";
  return "Set";
}

function adminPlanStatusMeta(user){
  const flags = getUserAccessFlags(user);
  if (user.is_protected) {
    return { flags, status: "Protected", statusClass: "ok", expiresLabel: "Never (unlimited)" };
  }
  if (flags.unlimited_access) {
    return { flags, status: "Unlimited", statusClass: "ok", expiresLabel: "Never (unlimited)" };
  }
  if (flags.grace_active) {
    return { flags, status: "Expired · grace", statusClass: "warn", expiresLabel: formatAccessDateShort(flags.trial_expires_at) };
  }
  if (flags.lock_active) {
    return { flags, status: "Expired · locked", statusClass: "warn", expiresLabel: formatAccessDateShort(flags.trial_expires_at) };
  }
  if (flags.period_expired) {
    return { flags, status: "Expired", statusClass: "warn", expiresLabel: formatAccessDateShort(flags.trial_expires_at) };
  }
  if (flags.period_active) {
    return { flags, status: "Active", statusClass: "ok", expiresLabel: formatAccessDateShort(flags.trial_expires_at) };
  }
  return { flags, status: "No period", statusClass: "warn", expiresLabel: "—" };
}

function buildManagePlanBody(user){
  const meta = adminPlanStatusMeta(user);
  const flags = meta.flags;
  const started = formatAccessDateShort(user.trial_started_at || flags.trial_started_at);
  const currentExpiryVal = flags.trial_expires_at ? toInputDateValue(flags.trial_expires_at) : "";
  const lastAt = user.access_last_extended_at || flags.access_last_extended_at || null;
  const lastUntil = user.access_last_extended_until || flags.access_last_extended_until || flags.trial_expires_at || null;
  const canEditLast = !user.is_protected && !!flags.trial_expires_at && !flags.unlimited_access;
  const canExtend = !user.is_protected;
  const extendMin = flags.trial_expires_at && !flags.period_expired
    ? addCalendarDaysToDateValue(flags.trial_expires_at, 1)
    : minExtendDateValue();
  const reduceMax = currentExpiryVal
    ? addCalendarDaysToDateValue(currentExpiryVal, -1)
    : "";
  const reduceDefault = reduceMax || currentExpiryVal || "";

  if (user.is_protected) {
    return `
      <div class="manage-plan-status">
        <div class="manage-plan-status-top">
          <span class="admin-access-pill ok">Protected</span>
          <strong>@${escapeHtml(user.username)}</strong>
        </div>
        <p class="admin-access-muted">Protected administrator access cannot be changed.</p>
      </div>`;
  }

  return `
    <div class="manage-plan-status">
      <div class="manage-plan-status-top">
        <span class="admin-access-pill ${meta.statusClass}">${escapeHtml(meta.status)}</span>
        <strong>${escapeHtml(flags.access_plan || "full")}</strong>
      </div>
      <div class="admin-access-grid manage-plan-grid">
        <div class="admin-access-kv"><span>Started</span><strong>${escapeHtml(started)}</strong></div>
        <div class="admin-access-kv"><span>Expires</span><strong>${escapeHtml(meta.expiresLabel)}</strong></div>
        <div class="admin-access-kv"><span>Last extension</span><strong>${escapeHtml(lastUntil ? formatAccessDateShort(lastUntil) : "None")}</strong></div>
        <div class="admin-access-kv"><span>Last edit</span><strong>${escapeHtml(lastAt ? formatAccessDateShort(lastAt) : "—")}</strong></div>
      </div>
    </div>

    <section class="manage-plan-block">
      <div class="manage-plan-block-head">
        <span>Extend plan</span>
        <span class="manage-plan-block-note">From current expiry</span>
      </div>
      <p class="admin-access-hint">${flags.unlimited_access
        ? "Set a first expiry date for this user."
        : `New end date must be after ${escapeHtml(meta.expiresLabel)}.`}</p>
      <div class="manage-plan-row">
        <label class="admin-access-field">
          <span>Until date</span>
          <input type="date" class="input admin-access-date" id="managePlanExtendDate" min="${escapeHtml(extendMin)}" value="${escapeHtml(extendMin)}" ${canExtend ? "" : "disabled"} />
        </label>
        <button type="button" class="btn primary tiny" id="managePlanExtendBtn" ${canExtend ? "" : "disabled"}>Extend</button>
      </div>
    </section>

    <section class="manage-plan-block">
      <div class="manage-plan-block-head">
        <span>Reduce last extension</span>
        <span class="manage-plan-block-note">Edit current expiry only</span>
      </div>
      <p class="admin-access-hint">${canEditLast
        ? `Only the current expiry (${escapeHtml(meta.expiresLabel)}) can be moved earlier.`
        : "No dated plan to reduce. Extend first, then you can edit that expiry."}</p>
      <div class="manage-plan-row">
        <label class="admin-access-field">
          <span>New expiry</span>
          <input type="date" class="input admin-access-date" id="managePlanReduceDate" ${canEditLast ? `max="${escapeHtml(reduceMax)}" value="${escapeHtml(reduceDefault)}"` : "disabled"} />
        </label>
        <button type="button" class="btn soft tiny" id="managePlanReduceBtn" ${canEditLast ? "" : "disabled"}>Reduce</button>
      </div>
    </section>

    <div class="manage-plan-history" id="managePlanHistory">
      <p class="admin-access-muted">Loading history…</p>
    </div>

    <div class="manage-plan-extra">
      <button type="button" class="btn ghost tiny" id="managePlanUnlimitedBtn">Make unlimited</button>
    </div>`;
}

async function loadAdminAccessHistory(userId, container){
  if (!container || !userId) return;
  container.innerHTML = `<p class="admin-access-muted">Loading history…</p>`;
  try {
    const result = await supabaseRpc("app_admin_list_access_extensions", {
      p_user_id: userId,
      p_limit: 5
    });
    const items = Array.isArray(result?.items) ? result.items : [];
    if (!items.length) {
      container.innerHTML = `<p class="admin-access-muted">No extension history yet.</p>`;
      return;
    }
    container.innerHTML = `
      <div class="manage-plan-history-title">Recent edits</div>
      <ul class="admin-access-history-list">
        ${items.map(item => {
          const who = item.admin_display_name || item.admin_username || "Admin";
          const until = item.new_expires_at
            ? formatAccessDateShort(item.new_expires_at)
            : "Unlimited";
          const prev = item.previous_expires_at
            ? formatAccessDateShort(item.previous_expires_at)
            : "—";
          return `<li>
            <span class="admin-access-history-action">${escapeHtml(adminAccessActionLabel(item.action))}</span>
            <span>${escapeHtml(prev)} → <strong>${escapeHtml(until)}</strong></span>
            <span class="admin-access-muted">${escapeHtml(formatAccessDateShort(item.created_at))} · ${escapeHtml(who)}</span>
          </li>`;
        }).join("")}
      </ul>`;
  } catch (err) {
    container.innerHTML = `<p class="admin-access-muted">${escapeHtml(err.message || "Could not load history")}</p>`;
  }
}

function closeAdminManagePlanModal(){
  const modal = document.getElementById("adminManagePlanModal");
  if (!modal) return;
  modal.classList.add("hide");
  modal.setAttribute("aria-hidden", "true");
}

function mergeAdminUserCache(updated){
  if (!updated?.id) return updated;
  const list = Array.isArray(state.adminUsersCache) ? state.adminUsersCache : [];
  const idx = list.findIndex(u => u.id === updated.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...updated };
  else list.push(updated);
  state.adminUsersCache = list;
  return list[idx >= 0 ? idx : list.length - 1];
}

function openAdminManagePlanModal(user){
  if (!user) return;
  let modal = document.getElementById("adminManagePlanModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminManagePlanModal";
    modal.className = "modal hide";
    document.body.appendChild(modal);
  }

  const render = (currentUser) => {
    const name = currentUser.display_name || currentUser.username;
    modal.innerHTML = `
      <div class="modal-backdrop" data-manage-plan-close></div>
      <div class="modal-dialog settings-sheet manage-plan-sheet" role="dialog" aria-modal="true" aria-labelledby="managePlanTitle">
        <div class="settings-sheet-head">
          <div>
            <h3 id="managePlanTitle">Manage plan</h3>
            <p>${escapeHtml(name)} · @${escapeHtml(currentUser.username)}</p>
          </div>
          <button type="button" class="btn ghost tiny" data-manage-plan-close aria-label="Close">✕</button>
        </div>
        <div class="modal-body settings-sheet-body manage-plan-body" id="managePlanBody">
          ${buildManagePlanBody(currentUser)}
        </div>
        <div id="managePlanError" class="lock-error manage-plan-error"></div>
      </div>`;

    modal.querySelectorAll("[data-manage-plan-close]").forEach(el => {
      el.onclick = () => closeAdminManagePlanModal();
    });

    const err = modal.querySelector("#managePlanError");
    const showErr = (msg) => {
      if (!err) return;
      err.textContent = msg || "";
      err.classList.toggle("show", !!msg);
    };
    showErr("");

    const history = modal.querySelector("#managePlanHistory");
    if (history) loadAdminAccessHistory(currentUser.id, history);

    const afterSave = async (updated) => {
      const merged = mergeAdminUserCache(updated || currentUser);
      await loadAdminUsers();
      const fresh = (state.adminUsersCache || []).find(u => u.id === currentUser.id) || merged;
      render(fresh);
    };

    modal.querySelector("#managePlanExtendBtn")?.addEventListener("click", async () => {
      showErr("");
      const untilDate = modal.querySelector("#managePlanExtendDate")?.value || "";
      if (!untilDate) return showErr("Choose an until date to extend.");
      const flags = getUserAccessFlags(currentUser);
      if (flags.trial_expires_at && !flags.unlimited_access) {
        const currentVal = toInputDateValue(flags.trial_expires_at);
        if (untilDate <= currentVal) {
          return showErr("Extend date must be after the current expiry. Use Reduce to move it earlier.");
        }
      }
      try {
        const updated = await supabaseRpc("app_admin_set_access_expiry", {
          p_user_id: currentUser.id,
          p_until_date: untilDate,
          p_clear_unlimited: false,
          p_note: "Extended plan until date"
        });
        await afterSave(updated);
      } catch (ex) {
        showErr(ex.message || "Could not extend plan.");
      }
    });

    modal.querySelector("#managePlanReduceBtn")?.addEventListener("click", async () => {
      showErr("");
      const untilDate = modal.querySelector("#managePlanReduceDate")?.value || "";
      if (!untilDate) return showErr("Choose a reduced expiry date.");
      const flags = getUserAccessFlags(currentUser);
      if (!flags.trial_expires_at) return showErr("No current expiry to reduce.");
      const currentVal = toInputDateValue(flags.trial_expires_at);
      if (untilDate >= currentVal) {
        return showErr("Reduce date must be earlier than the current expiry. Use Extend for a later date.");
      }
      try {
        const updated = await supabaseRpc("app_admin_set_access_expiry", {
          p_user_id: currentUser.id,
          p_until_date: untilDate,
          p_clear_unlimited: false,
          p_note: "Reduced last extension expiry"
        });
        await afterSave(updated);
      } catch (ex) {
        showErr(ex.message || "Could not reduce plan.");
      }
    });

    modal.querySelector("#managePlanUnlimitedBtn")?.addEventListener("click", async () => {
      showErr("");
      if (currentUser.is_protected) return;
      if (!confirm(`Remove expiry for "${currentUser.username}" and grant unlimited access?`)) return;
      try {
        const updated = await supabaseRpc("app_admin_set_access_expiry", {
          p_user_id: currentUser.id,
          p_until_date: null,
          p_clear_unlimited: true,
          p_note: "Cleared expiry · unlimited"
        });
        await afterSave(updated);
      } catch (ex) {
        showErr(ex.message || "Could not clear expiry.");
      }
    });
  };

  render(user);
  modal.classList.remove("hide");
  modal.setAttribute("aria-hidden", "false");
}

async function submitPlanRenewalRequest({ period, days, untilDate, message, statusEl } = {}){
  const p = String(period || "month").toLowerCase();
  const payload = {
    p_period: p === "date" ? "date" : p,
    p_message: message || null
  };
  if (p === "date") {
    if (!untilDate) throw new Error("Choose an until date for the renewal request.");
    payload.p_until_date = untilDate;
    payload.p_days = null;
  } else if (p === "custom") {
    const resolvedDays = accessPeriodDaysFromUi(p, days);
    if (!resolvedDays) throw new Error("Choose a valid number of days.");
    payload.p_days = resolvedDays;
    payload.p_until_date = null;
  } else {
    payload.p_days = null;
    payload.p_until_date = null;
  }
  const result = await supabaseRpc("app_request_plan_renewal", payload);
  if (statusEl) {
    statusEl.textContent = `Request sent: ${accessPeriodLabel(p, days, untilDate)}. An administrator will review it.`;
  }
  return result;
}

function isTrialExpired(user = state.sessionUser){
  const flags = getUserAccessFlags(user);
  return flags.lock_active === true
    || ((flags.period_expired === true || flags.trial_expired === true) && flags.grace_active !== true && flags.data_access_allowed !== true);
}

function isAccessWorkspaceLocked(user = state.sessionUser){
  const flags = getUserAccessFlags(user);
  if (user?.is_protected === true) return false;
  return flags.lock_active === true;
}

function isDataAccessAllowed(user = state.sessionUser){
  if (isGuestMode()) return true;
  if (state.trialLocked) return false;
  if (user?.is_protected === true) return true;
  const flags = getUserAccessFlags(user);
  // Grace keeps normal edits; lock/disable revoke workspace data access
  if (flags.unlimited_access || flags.period_active || flags.grace_active) return true;
  if (flags.lock_active || flags.should_auto_disable) return false;
  if (typeof user?.data_access_allowed === "boolean") return user.data_access_allowed;
  return flags.data_access_allowed;
}

function formatTrialExpiry(value){
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function hideTrialExpiredOverlay(){
  if (!els.trialExpiredOverlay) return;
  els.trialExpiredOverlay.classList.add("hide");
  els.trialExpiredOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("trial-locked", "access-locked");
  document.body.style.overflow = "";
}

function showTrialExpiredOverlay(){
  if (!els.trialExpiredOverlay) return;
  const flags = getUserAccessFlags();
  const title = document.getElementById("trialExpiredTitle");
  const message = document.getElementById("trialExpiredMessage");
  const past = Math.floor(Number(flags.days_past_expiry) || 0);
  const lockLeft = flags.lock_days_left != null
    ? Math.floor(Number(flags.lock_days_left))
    : Math.max(0, 4 - past);
  if (title) {
    title.textContent = flags.lock_active
      ? `Workspace locked — ${lockLeft} day${lockLeft === 1 ? "" : "s"} before auto-disable`
      : "Your access period has ended";
  }
  if (message) {
    message.textContent = flags.lock_active
      ? `Grace ended after ${formatTrialExpiry(flags.trial_expires_at)}. The workspace is locked for one day. Request a renewal below — auto-disable is on ${formatTrialExpiry(flags.access_disable_at)}.`
      : `Expired on ${formatTrialExpiry(flags.trial_expires_at)}. Your workspace is locked. Send a renewal request so an administrator can extend your plan.`;
  }
  els.trialExpiredOverlay.classList.remove("hide");
  els.trialExpiredOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("trial-locked", "access-locked");
  document.body.style.overflow = "hidden";
}

const PASSWORD_POLICY_HELP =
  "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.";

function passwordMeetsPolicy(password){
  const pw = String(password ?? "");
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

function assertPasswordPolicy(password, label = "Password"){
  if (!passwordMeetsPolicy(password)) {
    throw new Error(`${label} must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.`);
  }
}

function sessionHasWeakPassword(){
  return !!(
    state.unlocked
    && !isGuestMode()
    && state.sessionUser
    && (state.sessionUser.password_is_weak === true || state.sessionUser.password_is_weak === "true")
  );
}

function updateWeakPasswordBanner(){
  const banner = els.weakPasswordBanner || document.getElementById("weakPasswordBanner");
  if (!banner) return;
  const show = sessionHasWeakPassword();
  banner.classList.toggle("hide", !show);
}

function updateAccessBanner(){
  if (!els.guestModeBanner) return;
  const flags = getUserAccessFlags();
  const showGuest = isGuestMode();
  // Front banner: guest demo, OR active plan with ≤14 days remaining only.
  // Expired / grace warnings stay in Account Settings — not on the main page.
  const daysLeft = Number(flags.trial_days_remaining);
  const showApproaching = !showGuest
    && state.unlocked
    && flags.period_active
    && flags.has_access_period
    && Number.isFinite(daysLeft)
    && daysLeft >= 0
    && daysLeft <= 14;

  els.guestModeBanner.classList.toggle("hide", !(showGuest || showApproaching));
  els.guestModeBanner.classList.toggle("trial-expired-banner", false);
  els.guestModeBanner.classList.toggle("trial-grace-banner", false);
  els.guestModeBanner.classList.toggle("trial-active-banner", !!showApproaching);

  if (showGuest) {
    if (els.accessBannerTitle) els.accessBannerTitle.textContent = "Demo Login";
    if (els.accessBannerMessage) {
      els.accessBannerMessage.textContent = "Demo data will not be stored. It will be cleared when the page is closed or refreshed.";
    }
    updateWeakPasswordBanner();
    return;
  }

  if (showApproaching) {
    const daysLabel = `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`;
    if (els.accessBannerTitle) els.accessBannerTitle.textContent = "Plan ending soon";
    if (els.accessBannerMessage) {
      els.accessBannerMessage.textContent = `${daysLabel}. Expires ${formatTrialExpiry(flags.trial_expires_at)}. Renew from Account Settings.`;
    }
  }
  updateWeakPasswordBanner();
}

function backupStorageKey(){
  if (isGuestMode()) return GUEST_BACKUP_STORAGE_KEY;
  const uid = state.sessionUser?.id || state.currentUsername || "signed-out";
  return `${BACKUP_STORAGE_KEY}:${uid}`;
}

function recycleBinStorageKey(){
  if (isGuestMode()) return GUEST_RECYCLE_BIN_STORAGE_KEY;
  const uid = state.sessionUser?.id || state.currentUsername || "signed-out";
  return `${RECYCLE_BIN_STORAGE_KEY}:${uid}`;
}

function readStoredArray(key){
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredArray(key, rows){
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(rows) ? rows : []));
  } catch (err) {
    console.warn("Local guest data could not be saved.", err);
  }
}
