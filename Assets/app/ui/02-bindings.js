/* Modularized from script.js lines 26702-27706 — event bindings / overview toggles. Load order must be preserved. */
function collapseMainOverview() {
  els.mainOverview.classList.remove("expanded");
  els.mainOverview.classList.add("collapsed");
  els.toggleMainOverviewBtn.textContent = "▶";
  setMainOverviewHeading(getActiveTabKey() === "goods" ? "inventory" : "loans");
}

function toggleMainOverview() {
  const isExpanded = els.mainOverview.classList.contains("expanded");
  if (isExpanded) {
    collapseMainOverview();
  } else {
    expandMainOverview();
  }
}

function attachEvents(){
  const closeAllMenus = () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-wrap.open").forEach(wrap => wrap.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  };

  document.addEventListener("click", handleGuestRestrictedClick, true);

  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    if (btn.dataset.tab) activate(btn.dataset.tab);
  }));
  document.querySelectorAll("[data-loan-mode]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const mode = btn.dataset.loanMode;
      if (mode === "given" || mode === "taken") activate(mode);
    });
  });
  document.querySelectorAll("[data-loan-tab]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      activate(btn.dataset.loanTab);
      closeAllMenus();
    });
  });

  document.querySelectorAll("[data-open-modal]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.openModal;
      const direction = btn.dataset.direction || "given";
      const installment = btn.dataset.installment === "1" || btn.dataset.installment === "true";
      if (installment) {
        activate("installments");
      } else if (mode === "principal") {
        activate(direction === "given" ? "given" : "taken");
      } else if (mode === "payment") {
        activate(direction === "given" ? "given" : "taken");
      }
      openEntryModal(mode, direction, { installment });
    });
  });
  if (els.openGoodsBoughtBtn) {
    els.openGoodsBoughtBtn.addEventListener("click", () => {
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
      activate("goods");
      if (typeof openInventoryAddItemWizard === "function") openInventoryAddItemWizard();
      else openGoodsModal("bought");
    });
  }
  if (els.openGoodsSoldBtn) {
    els.openGoodsSoldBtn.addEventListener("click", () => {
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
      activate("goods");
      openGoodsModal("sold");
    });
  }
  document.getElementById("openInventoryDraftBtn")?.addEventListener("click", () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
    activate("goods");
    openSaleDraftModal();
  });
  document.getElementById("openInventoryDraftsMenuBtn")?.addEventListener("click", () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
    activate("goods");
    setInventorySubView("drafts");
  });
  if (els.openInventoryDraftsBtn) {
    els.openInventoryDraftsBtn.addEventListener("click", () => {
      activate("goods");
      setInventorySubView("drafts");
    });
  }
  document.getElementById("inventoryNewDraftFromListBtn")?.addEventListener("click", async () => {
    await startNewSaleDraft({ askSave: true });
    openSaleDraftModal();
  });
  if (els.openInventoryCustomersBtn) {
    els.openInventoryCustomersBtn.addEventListener("click", () => {
      activate("goods");
      setInventorySubView("customers");
    });
  }
  if (els.openInventoryBarcodesBtn) {
    els.openInventoryBarcodesBtn.addEventListener("click", () => {
      activate("goods");
      setInventorySubView("barcodes");
    });
  }
  if (els.openInventoryScannerBtn) {
    els.openInventoryScannerBtn.addEventListener("click", () => {
      activate("goods");
      setInventorySubView("scanner");
    });
  }
  document.getElementById("inventoryScannerFromBarcodesBtn")?.addEventListener("click", () => {
    setInventorySubView("scanner");
  });
  document.getElementById("inventoryBarcodesFromScannerBtn")?.addEventListener("click", () => {
    setInventorySubView("barcodes");
  });
  document.getElementById("openInventoryScannerMenuBtn")?.addEventListener("click", () => {
    activate("goods");
    setInventorySubView("scanner");
  });
  document.getElementById("openInventoryBarcodesMenuBtn")?.addEventListener("click", () => {
    activate("goods");
    setInventorySubView("barcodes");
  });
  document.querySelectorAll(".inventoryBackToStockBtn").forEach(btn => {
    btn.addEventListener("click", () => setInventorySubView("stock"));
  });
  bindInventoryAddCustomerButtons();
  if (els.inventoryCustomerStatementBtn) {
    els.inventoryCustomerStatementBtn.addEventListener("click", () => downloadInventoryCustomerStatementPDF(state.inventoryDraft.customerRecordName));
  }
  if (els.openExpenseAccountBtn) {
    els.openExpenseAccountBtn.addEventListener("click", () => {
      activate("expenses");
      openExpenseModal("account");
    });
  }
  if (els.openExpenseTopupBtn) {
    els.openExpenseTopupBtn.addEventListener("click", () => {
      activate("expenses");
      openExpenseModal("topup");
    });
  }
  if (els.openExpenseEntryBtn) {
    els.openExpenseEntryBtn.addEventListener("click", () => {
      activate("expenses");
      openExpenseModal("expense");
    });
  }

  els.toggleWalletsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleWalletsOverview();
  });
  els.walletsBanner.addEventListener("click", toggleWalletsOverview);

  els.toggleMainOverviewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMainOverview();
  });
  els.mainOverviewBanner.addEventListener("click", toggleMainOverview);

  document.querySelectorAll("[data-entry-menu]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const key = btn.dataset.entryMenu;
      const panel = document.querySelector(`[data-entry-menu-panel="${key}"]`);
      if (!panel) return;
      document.querySelectorAll(".menu-dropdown.open").forEach(openPanel => {
        if (openPanel !== panel) openPanel.classList.remove("open");
      });
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => {
        if (trigger !== btn) trigger.setAttribute("aria-expanded", "false");
      });
      const nowOpen = panel.classList.toggle("open");
      btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");

      // Landing projects: CSS-absolute under .menu-wrap (nav backdrop-filter breaks fixed coords)
      if (key === "landing-projects") {
        panel.style.top = "";
        panel.style.left = "";
        panel.style.visibility = "";
        return;
      }

      // Position the dropdown using fixed positioning
      if (nowOpen) {
        // Force layout so width/height are measurable before placing
        panel.style.visibility = "hidden";
        panel.classList.add("open");
        if (typeof positionFixedMenuDropdown === "function") {
          positionFixedMenuDropdown(panel, btn, { minWidth: 180 });
        } else {
          const panelWidth = panel.offsetWidth || 320;
          const rect = btn.getBoundingClientRect();
          let left = rect.right - panelWidth;
          if (left < 10) left = Math.max(10, rect.left);
          if (left + panelWidth > window.innerWidth - 10) {
            left = Math.max(10, window.innerWidth - panelWidth - 10);
          }
          panel.style.top = `${rect.bottom + 6}px`;
          panel.style.left = `${left}px`;
        }
        panel.style.visibility = "";

        // Render recycle bin items if this is the recycle bin dropdown
        if (key === "recyclebin") {
          renderRecycleBinDropdown();
        }
        if (key === "page-currency") {
          renderPageCurrencySelector();
        }
        if (key === "admin-notify") {
          loadAdminNotificationsDropdown().catch(() => {});
        }
        if (key === "admin-messages") {
          loadAdminMessagesPreview().catch(() => {});
        }
      } else {
        panel.classList.remove("open");
      }
    });
  });

  document.addEventListener("click", e => {
    const trigger = e.target.closest(".menu-trigger");
    const insideOpenMenu = e.target.closest(".menu-dropdown.open");
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => {
      if (insideOpenMenu === panel) return;
      const wrap = panel.closest(".menu-wrap");
      if (trigger && wrap && wrap.contains(trigger)) return;
      panel.classList.remove("open");
      wrap?.classList.remove("open");
      const openTrigger = wrap?.querySelector(".menu-trigger");
      if (openTrigger) openTrigger.setAttribute("aria-expanded", "false");
    });
    if (!e.target.closest(".note-wrap")){
      document.querySelectorAll(".note-popover").forEach(pop => pop.classList.add("hide"));
      updateNoteBackdropVisibility();
    }
    if (!e.target.closest(".expense-history-download-wrap")){
      closeExpenseHistoryPdfMenus();
    }
  });
  window.addEventListener("scroll", () => {
    closeAllMenus();
    repositionOpenNotePopovers();
  }, { passive: true });
  window.addEventListener("resize", repositionOpenNotePopovers);
  
// Add resize listener for wallets layout
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    updateWalletsLayoutOnResize();
  }, 250); // Debounce to avoid excessive calls
});

  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", e => closeModal(e.target.dataset.closeModal || e.currentTarget.dataset.closeModal));
  });

  document.querySelectorAll(".sectionDetailsBtn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      openSectionDetailsOverlay(btn.dataset.sectionDetails);
    });
  });

  [els.entryModal, els.editModal, els.goodsModal, els.goodsSettlementModal, els.inventoryCustomerModal, els.inventoryEditItemModal, els.installmentPlanModal, els.installmentEditModal, document.getElementById("noteReminderModal"), document.getElementById("noteEditModal"), els.expenseModal, els.sectionDetailsModal].forEach(m => {
    if (!m) return;
    m.addEventListener("click", e => {
      if (e.target && e.target.matches(".modal-backdrop")) closeModal(m.id);
    });
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!els.entryModal.classList.contains("hide")) closeModal("entryModal");
      if (!els.editModal.classList.contains("hide")) closeModal("editModal");
      if (!els.goodsModal.classList.contains("hide")) closeModal("goodsModal");
      if (els.goodsSettlementModal && !els.goodsSettlementModal.classList.contains("hide")) closeModal("goodsSettlementModal");
      if (els.inventoryCustomerModal && !els.inventoryCustomerModal.classList.contains("hide")) closeModal("inventoryCustomerModal");
      if (els.inventoryEditItemModal && !els.inventoryEditItemModal.classList.contains("hide")) closeModal("inventoryEditItemModal");
      if (els.installmentPlanModal && !els.installmentPlanModal.classList.contains("hide")) closeModal("installmentPlanModal");
      if (els.installmentEditModal && !els.installmentEditModal.classList.contains("hide")) closeModal("installmentEditModal");
      const noteReminderModal = document.getElementById("noteReminderModal");
      if (noteReminderModal && !noteReminderModal.classList.contains("hide")) closeModal("noteReminderModal");
      const noteEditModal = document.getElementById("noteEditModal");
      if (noteEditModal && !noteEditModal.classList.contains("hide")) closeModal("noteEditModal");
      ["assetFormModal", "assetDetailModal", "assetTxModal", "assetSaleModal"].forEach(id => {
        const m = document.getElementById(id);
        if (m && !m.classList.contains("hide")) closeModal(id);
      });
      if (!els.expenseModal.classList.contains("hide")) closeModal("expenseModal");
      if (els.sectionDetailsModal && !els.sectionDetailsModal.classList.contains("hide")) closeModal("sectionDetailsModal");
      if (els.btcWifQrScannerModal && !els.btcWifQrScannerModal.classList.contains("hide")) closeModal("btcWifQrScannerModal");
      const inventoryBrandsModal = document.getElementById("inventoryBrandsModal");
      if (inventoryBrandsModal && !inventoryBrandsModal.classList.contains("hide")) closeModal("inventoryBrandsModal");
      const inventorySaleDraftModal = document.getElementById("inventorySaleDraftModal");
      if (inventorySaleDraftModal && !inventorySaleDraftModal.classList.contains("hide")) closeModal("inventorySaleDraftModal");
      const inventorySectionModal = document.getElementById("inventorySectionModal");
      if (inventorySectionModal && !inventorySectionModal.classList.contains("hide")) closeModal("inventorySectionModal");
    }
  });

  document.querySelectorAll(".currency-chip").forEach(btn => {
    btn.addEventListener("click", () => setCurrencyChoice(btn.closest('form'), btn.dataset.currency));
  });

  document.querySelectorAll(".filter-radio").forEach(r => {
    r.addEventListener("change", e => {
      if (!e.target.dataset.filter) return;
      const key = e.target.dataset.filter;
      state.statusFilter[key] = e.target.value;
      renderSearchResults(key);
    });
  });

  document.querySelectorAll(".status-filter-select").forEach(select => {
    const key = select.dataset.filter;
    if (key && state.statusFilter[key] != null) {
      select.value = state.statusFilter[key];
    }
    select.addEventListener("change", e => {
      const filterKey = e.target.dataset.filter;
      if (!filterKey) return;
      state.statusFilter[filterKey] = e.target.value;
      renderSearchResults(filterKey);
    });
  });

  document.querySelectorAll(".currency-radio").forEach(r => {
    r.addEventListener("change", e => {
      if (!isPageCurrencyAll()) {
        syncSectionCurrencyFiltersWithPage();
        return;
      }
      const key = e.target.dataset.currencyFilter;
      state.currencyFilter[key] = e.target.value;
      renderSearchResults(key);
    });
  });

  document.querySelectorAll(".currency-filter-select").forEach(select => {
    const key = select.dataset.currencyFilter;
    if (key && state.currencyFilter[key] != null) {
      select.value = state.currencyFilter[key];
    }
    select.addEventListener("change", e => {
      if (!isPageCurrencyAll()) {
        syncSectionCurrencyFiltersWithPage();
        return;
      }
      const filterKey = e.target.dataset.currencyFilter;
      if (!filterKey) return;
      state.currencyFilter[filterKey] = e.target.value;
      renderSearchResults(filterKey);
    });
  });

  els.multiEntryCount.addEventListener("input", e => {
    let cnt = parseInt(e.target.value) || 1;
    if(cnt < 1) cnt = 1;
    if(cnt > 10) cnt = 10;
    renderMultiEntries(cnt);
  });

  // When a loan is selected in the payment modal, update wallet selector currency
  els.modalLoanSelect.addEventListener("change", () => {
    const selectedGroupId = els.modalLoanSelect.value;
    if (!selectedGroupId) return;
    const principalEntry = state.entries.find(e => e.group_id === selectedGroupId && e.entry_kind === "principal");
    const currency = principalEntry?.currency || null;
    populateLoanWalletSelector(currency, document.getElementById("modalPaymentWalletSelect"));
    updateInstallmentPaymentPreview();
  });

  const installmentCountInput = document.getElementById("installmentCountInput");
  if (installmentCountInput) {
    ["input", "change"].forEach(evt => installmentCountInput.addEventListener(evt, updateInstallmentPlanPreview));
  }
  const installmentDownPaymentInput = document.getElementById("installmentDownPaymentInput");
  if (installmentDownPaymentInput) {
    ["input", "change"].forEach(evt => installmentDownPaymentInput.addEventListener(evt, updateInstallmentPlanPreview));
  }
  if (els.principalModalForm) {
    els.principalModalForm.querySelector('[name="principal_amount"]')?.addEventListener("input", updateInstallmentPlanPreview);
    document.getElementById("entryPrincipalDateInline")?.addEventListener("change", updateInstallmentPlanPreview);
    els.principalModalForm.querySelector('select[name="currency"]')?.addEventListener("change", () => {
      setCurrencyChoice(els.principalModalForm, els.principalModalForm.querySelector('select[name="currency"]').value);
      updateInstallmentPlanPreview();
    });
  }
  if (els.paymentModalForm) {
    els.paymentModalForm.addEventListener("input", e => {
      if (e.target?.name === "action_amount_0" || e.target?.name === "action_date_0") {
        updateInstallmentPaymentPreview();
      }
    });
  }
  if (els.installmentEditForm) {
    ["input", "change"].forEach(evt => {
      els.installmentEditForm.addEventListener(evt, e => {
        if (["principal_amount", "down_payment", "installment_count", "loan_date", "currency"].includes(e.target?.name) || e.target?.id === "installmentEditCount") {
          updateInstallmentEditPreview();
        }
      });
    });
    document.getElementById("installmentEditDateInline")?.addEventListener("change", updateInstallmentEditPreview);
    els.installmentEditForm.querySelector('select[name="currency"]')?.addEventListener("change", () => {
      setCurrencyChoice(els.installmentEditForm, els.installmentEditForm.querySelector('select[name="currency"]').value);
      updateInstallmentEditPreview();
    });
    els.installmentEditForm.addEventListener("submit", async e => {
      e.preventDefault();
      try { await submitInstallmentEdit(); } catch (err) { alert(err.message); }
    });
  }

  els.principalModalForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await createPrincipal(els.principalModalForm); } catch (err) { alert(err.message); }
  });

  els.paymentModalForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await createPayment(els.paymentModalForm); } catch (err) { alert(err.message); }
  });

  els.editForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await submitEdit(); } catch (err) { alert(err.message); }
  });
  if (els.inventoryEditItemForm) {
    els.inventoryEditItemForm.addEventListener("submit", async e => {
      e.preventDefault();
      try { await submitInventoryEditItem(); } catch (err) { alert(err.message); }
    });
    const editTypeSelect = els.inventoryEditItemForm.querySelector('[name="item_type"]');
    if (editTypeSelect) {
      editTypeSelect.addEventListener("change", () => {
        const customWrap = els.inventoryEditItemForm.querySelector("[data-inventory-custom-type-wrap]");
        const customInput = els.inventoryEditItemForm.querySelector('[name="item_type_custom"]');
        const isCustom = editTypeSelect.value === INVENTORY_CUSTOM_TYPE_VALUE;
        customWrap?.classList.toggle("hide", !isCustom);
        if (customInput) {
          customInput.required = isCustom;
          if (isCustom) customInput.focus();
          else customInput.value = "";
        }
      });
    }
    const editCategorySelect = els.inventoryEditItemForm.querySelector('[name="item_category"]');
    const editUnitSelect = els.inventoryEditItemForm.querySelector('[name="quantity_unit"]');
    const editPriceInput = els.inventoryEditItemForm.querySelector('[name="actual_price"]');
    const editQtyInput = els.inventoryEditItemForm.querySelector('[name="bought_qty"]');
    if (editCategorySelect) editCategorySelect.addEventListener("change", syncInventoryEditItemCategoryFields);
    if (editUnitSelect) editUnitSelect.addEventListener("change", updateInventoryEditItemTotals);
    if (editPriceInput) editPriceInput.addEventListener("input", updateInventoryEditItemTotals);
    if (editQtyInput) editQtyInput.addEventListener("input", updateInventoryEditItemTotals);
    ["inventoryEditTaxApplied", "inventoryEditTaxRate", "inventoryEditTaxMode"].forEach(controlId => {
      const control = document.getElementById(controlId);
      if (!control) return;
      control.addEventListener("input", updateInventoryEditItemTotals);
      control.addEventListener("change", updateInventoryEditItemTotals);
    });
  }
  els.goodsBoughtForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveGoodsBought(els.goodsBoughtForm); } catch (err) { alert(err.message); }
  });
  els.goodsSoldForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveGoodsSold(els.goodsSoldForm); } catch (err) { alert(err.message); }
  });
  if (els.goodsSettlementForm) {
    els.goodsSettlementForm.addEventListener("submit", async e => {
      e.preventDefault();
      try { await saveGoodsSettlement(els.goodsSettlementForm); } catch (err) { alert(err.message); }
    });
  }
  if (els.goodsSettlementInvoiceList) {
    els.goodsSettlementInvoiceList.addEventListener("change", e => {
      if (e.target?.matches(".goods-settlement-invoice-check")) updateGoodsSettlementSelectionTotals();
    });
  }
  if (els.taxSettingsBtn) {
    els.taxSettingsBtn.addEventListener("click", e => {
      e.preventDefault();
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      openTaxSettingsModal();
    });
  }
  els.expenseAccountForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveExpenseAccount(els.expenseAccountForm); } catch (err) { alert(err.message); }
  });
  els.expenseTopupForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveExpenseTopup(els.expenseTopupForm); } catch (err) { alert(err.message); }
  });
  els.expenseEntryForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveExpenseEntry(els.expenseEntryForm); } catch (err) { alert(err.message); }
  });

  els.transferForm.addEventListener("submit", async e => {
    e.preventDefault();
    try { await saveTransfer(els.transferForm); } catch (err) { alert(err.message); }
  });
  els.expenseCurrencySelect.addEventListener("change", () => {
    renderExpenseAccountSelectors();
    syncExpenseTaxDefaults();
    refreshExpenseItemIntentUi();
  });
  const expenseAccountCurrencySelect = document.getElementById("expenseAccountCurrencySelect");
  if (expenseAccountCurrencySelect) {
    expenseAccountCurrencySelect.addEventListener("change", () => {
      setCurrencyChoice(els.expenseAccountForm, expenseAccountCurrencySelect.value);
    });
  }
  const expenseBtcAddressInput = els.expenseAccountForm?.querySelector('input[name="btc_address"]');
  if (expenseBtcAddressInput) {
    expenseBtcAddressInput.addEventListener("blur", () => previewExpenseBtcBalance());
    expenseBtcAddressInput.addEventListener("input", () => {
      if (els.expenseBtcBalanceStatus) {
        els.expenseBtcBalanceStatus.className = "expense-btc-help";
        els.expenseBtcBalanceStatus.textContent = "Balance and transactions will be loaded directly from the blockchain.";
      }
    });
  }
  if (els.expenseItemNameInput){
    els.expenseItemNameInput.addEventListener("input", refreshExpenseItemIntentUi);
    els.expenseItemNameInput.addEventListener("blur", refreshExpenseItemIntentUi);
  }
  els.expenseSpendAccountSelect.addEventListener("change", refreshExpenseItemIntentUi);
  if (els.goodsNewItemToggleBtn && els.goodsNewItemFields) {
    els.goodsNewItemToggleBtn.addEventListener("click", () => {
      const open = els.goodsNewItemFields.classList.toggle("hide");
      els.goodsNewItemToggleBtn.textContent = open ? "+ Add New" : "- Use Existing";
      if (!open) defaultDateInputs(els.goodsSoldForm);
    });
  }
  const inventoryTypeFilter = document.getElementById("inventoryTypeFilter");
  if (inventoryTypeFilter) {
    inventoryTypeFilter.addEventListener("change", () => {
      state.inventoryItemTypeFilter = inventoryTypeFilter.value || "all";
      renderInventoryList();
    });
  }
  const inventoryBrandFilter = document.getElementById("inventoryBrandFilter");
  if (inventoryBrandFilter) {
    inventoryBrandFilter.addEventListener("change", () => {
      state.inventoryBrandFilter = inventoryBrandFilter.value || "all";
      renderInventoryList();
    });
  }
  document.getElementById("openInventoryBrandsBtn")?.addEventListener("click", () => {
    openInventoryBrandsModal().catch(err => alert(err?.message || "Could not open brands."));
  });
  const inventoryStatusFilter = document.getElementById("inventoryStatusFilter");
  if (inventoryStatusFilter) {
    inventoryStatusFilter.value = state.statusFilter.goods || "Open";
    inventoryStatusFilter.addEventListener("change", () => {
      state.statusFilter.goods = inventoryStatusFilter.value || "Open";
      renderInventoryList();
    });
  }
  document.querySelectorAll("[data-inventory-layout]").forEach(btn => {
    btn.addEventListener("click", () => {
      const next = String(btn.dataset.inventoryLayout || "category").trim() === "list" ? "list" : "category";
      if (state.inventoryStockLayout === next) return;
      state.inventoryStockLayout = next;
      document.querySelectorAll("[data-inventory-layout]").forEach(el => {
        const on = el.dataset.inventoryLayout === next;
        el.classList.toggle("active", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
      });
      const sortWrap = document.querySelector(".inventory-grid-sort");
      if (sortWrap) sortWrap.classList.toggle("hide", next === "list");
      renderInventoryList();
    });
  });
  const sortWrapInit = document.querySelector(".inventory-grid-sort");
  if (sortWrapInit) sortWrapInit.classList.toggle("hide", state.inventoryStockLayout === "list");
  document.querySelectorAll("[data-inventory-layout]").forEach(el => {
    const on = el.dataset.inventoryLayout === (state.inventoryStockLayout || "category");
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", on ? "true" : "false");
  });

  if (els.addGoodsPurchaseLineBtn) {
    els.addGoodsPurchaseLineBtn.addEventListener("click", () => {
      const seed = inventoryPurchaseLineSeedPrefill();
      addGoodsPurchaseLine({
        ...seed,
        currency: seed.currency || state.lastCurrency || "AED"
      });
    });
  }
  if (els.goodsPurchaseLines) {
    els.goodsPurchaseLines.addEventListener("input", e => {
      const line = e.target.closest(".inventory-purchase-line");
      if (line) updateGoodsPurchaseLine(line, e.target);
    });
    els.goodsPurchaseLines.addEventListener("change", e => {
      const line = e.target.closest(".inventory-purchase-line");
      if (line) updateGoodsPurchaseLine(line, e.target);
    });
    els.goodsPurchaseLines.addEventListener("click", e => {
      const btn = e.target.closest(".goods-buy-remove");
      if (!btn) return;
      const line = btn.closest(".inventory-purchase-line");
      if (!line || state.inventoryDraft.purchaseGroupId) return;
      if (String(line.dataset.restockGroupId || "").trim()) return;
      line.remove();
      if (!els.goodsPurchaseLines.children.length) {
        addGoodsPurchaseLine({
          ...inventoryPurchaseLineSeedPrefill(),
          currency: state.inventoryDraft.purchaseSeedCurrency || state.lastCurrency || "AED"
        });
      }
      toggleGoodsPurchaseRemoveButtons();
      updateGoodsBoughtTotal();
    });
  }
  [els.expenseTaxApplied, els.expenseTaxRate, els.expenseTaxMode, els.expenseEntryForm?.querySelector('[name="amount"]')].forEach(control => {
    if (!control) return;
    control.addEventListener("input", () => {
      if (control !== els.expenseEntryForm?.querySelector('[name="amount"]')) els.expenseEntryForm.dataset.taxManual = "true";
      updateExpenseTaxPreview();
    });
    control.addEventListener("change", () => {
      if (control !== els.expenseEntryForm?.querySelector('[name="amount"]')) els.expenseEntryForm.dataset.taxManual = "true";
      updateExpenseTaxPreview();
    });
  });
  ["editAmount", "editTaxApplied", "editTaxRate", "editTaxMode"].forEach(id => {
    const control = document.getElementById(id);
    if (!control) return;
    control.addEventListener("input", () => updateEditTaxPreview());
    control.addEventListener("change", () => updateEditTaxPreview());
  });
  if (els.goodsCustomerSelect) {
    els.goodsCustomerSelect.addEventListener("change", syncGoodsCustomerFields);
  }
  if (els.addGoodsSaleLineBtn) {
    els.addGoodsSaleLineBtn.addEventListener("click", () => addGoodsSaleLine(""));
  }
  if (els.goodsSalePaidAmount) {
    els.goodsSalePaidAmount.addEventListener("input", () => {
      els.goodsSalePaidAmount.dataset.autoPaid = "false";
      updateGoodsSalePaymentFields();
    });
  }
  if (els.goodsSaleLines) {
    els.goodsSaleLines.addEventListener("input", e => {
      const line = e.target.closest(".inventory-sale-line");
      if (line) updateGoodsSaleLine(line, e.target);
    });
    els.goodsSaleLines.addEventListener("change", e => {
      const line = e.target.closest(".inventory-sale-line");
      if (line) updateGoodsSaleLine(line, e.target);
    });
    els.goodsSaleLines.addEventListener("click", e => {
      const btn = e.target.closest(".goods-sale-remove");
      if (!btn) return;
      const line = btn.closest(".inventory-sale-line");
      if (!line) return;
      line.remove();
      if (!els.goodsSaleLines.children.length) addGoodsSaleLine("");
      else refreshGoodsSaleItemOptions();
      toggleGoodsSaleRemoveButtons();
      updateGoodsSaleGrandTotal();
    });
  }

  const closeOpenEntryMenus = () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  };
  const bindSectionPdfBtn = (btn, section) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      closeOpenEntryMenus();
      exportSectionPDF(section).catch(err => alert(err.message));
    });
  };
  bindSectionPdfBtn(els.downloadGivenPdfBtn, "given");
  bindSectionPdfBtn(els.downloadReceivedPdfBtn, "received");
  bindSectionPdfBtn(els.downloadTakenPdfBtn, "taken");
  bindSectionPdfBtn(els.downloadReturnedPdfBtn, "returned");
  if (els.downloadExpensesPdfBtn) {
    els.downloadExpensesPdfBtn.addEventListener("click", () => {
      closeOpenEntryMenus();
      exportSectionPDF("expenses").catch(err => alert(err.message));
    });
  }
  els.downloadAllSectionsPdfBtn.addEventListener("click", () => exportAllSectionsPDF().catch(err => alert(err.message)));
  els.downloadAllDataJsonBtn.addEventListener("click", () => downloadJsonBackup().catch(err => alert(err.message)));
  els.downloadAllDataCsvBtn.addEventListener("click", () => downloadCsvBackup().catch(err => alert(err.message)));
  els.uploadBackupBtn.addEventListener("click", () => uploadBackupToDatabase().catch(err => alert(err.message)));

  document.querySelectorAll("[data-section-csv-download]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
      downloadSectionCsv(btn.dataset.sectionCsvDownload).catch(err => alert(err.message));
    });
  });
  const downloadInventoryAuditReportBtn = document.getElementById("downloadInventoryAuditReportBtn");
  if (downloadInventoryAuditReportBtn) {
    downloadInventoryAuditReportBtn.addEventListener("click", () => {
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
      downloadInventoryAuditReportExcel().catch(err => alert(err.message || err));
    });
  }
  document.getElementById("downloadInventoryFullPdfBtn")?.addEventListener("click", () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
    const runner = typeof downloadInventoryFullReportPDF === "function"
      ? downloadInventoryFullReportPDF
      : downloadGoodsPDF;
    Promise.resolve(runner()).catch(err => alert(err?.message || err || "Could not create PDF."));
  });
  const closeAssetMenus = () => {
    document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
    document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  };
  document.getElementById("downloadAssetsSummaryPdfBtn")?.addEventListener("click", () => {
    closeAssetMenus();
    Promise.resolve(downloadAssetsSummaryPDF()).catch(err => alert(err?.message || err || "Could not create PDF."));
  });
  document.getElementById("downloadAssetsDetailsPdfBtn")?.addEventListener("click", () => {
    closeAssetMenus();
    Promise.resolve(downloadAssetsDetailsPDF()).catch(err => alert(err?.message || err || "Could not create PDF."));
  });
  document.querySelectorAll("[data-section-csv-upload]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
      openSectionCsvUpload(btn.dataset.sectionCsvUpload);
    });
  });
  const sectionCsvInput = document.getElementById("sectionCsvInput");
  if (sectionCsvInput) {
    sectionCsvInput.addEventListener("change", async e => {
      const file = e.target.files && e.target.files[0];
      const section = e.target.dataset.section || "";
      if (!file || !section) return;
      try {
        await importSectionCsv(file, section);
      } catch (err) {
        alert(err.message);
      } finally {
        e.target.value = "";
      }
    });
  }

  if (els.importJsonInput) els.importJsonInput.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      await importBackupFile(file);
    }catch(err){
      alert(err.message);
    }finally{
      e.target.value = "";
    }
  });
  if (els.importCsvInput) els.importCsvInput.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      await importBackupFile(file);
    }catch(err){
      alert(err.message);
    }finally{
      e.target.value = "";
    }
  });
  const expDateFrom = document.getElementById("expenseDateFrom");
  const expDateTo = document.getElementById("expenseDateTo");
  const clearExpDateBtn = document.getElementById("clearExpenseDateBtn");
  const reloadExpenseActivityIfNeeded = async () => {
    if (typeof isExpenseLazyMode === "function" && isExpenseLazyMode()
      && typeof loadExpenseActivityForCurrentQuery === "function") {
      try { await loadExpenseActivityForCurrentQuery({ force: true }); }
      catch (err) { console.warn("Expense activity reload failed:", err); }
    }
  };
  if (expDateFrom) expDateFrom.addEventListener("change", async e => {
    state.expenseDateFrom = e.target.value;
    if (String(state.search.expenses || "").trim()) await reloadExpenseActivityIfNeeded();
    renderAll();
  });
  if (expDateTo) expDateTo.addEventListener("change", async e => {
    state.expenseDateTo = e.target.value;
    if (String(state.search.expenses || "").trim()) await reloadExpenseActivityIfNeeded();
    renderAll();
  });
  if (clearExpDateBtn) clearExpDateBtn.addEventListener("click", async () => {
    state.expenseDateFrom = "";
    state.expenseDateTo = "";
    if (expDateFrom) expDateFrom.value = "";
    if (expDateTo) expDateTo.value = "";
    state.search.expenses = "";
    const searchEl = document.getElementById("searchExpenses");
    if (searchEl) searchEl.value = "";
    await reloadExpenseActivityIfNeeded();
    renderAll();
  });
  els.connectSupabaseBtn.addEventListener("click", () => {
    els.lockScreen.classList.remove("hide");
    focusUnlockForm();
  });

  if (els.logoutBtn){
    els.logoutBtn.addEventListener("click", () => doLogout());
  }
  if (els.secretPinBtn){
    els.secretPinBtn.addEventListener("click", () => handleSecretPinMenuAction());
  }
  if (els.deleteSmartPinBtn){
    els.deleteSmartPinBtn.addEventListener("click", () => handleDeleteSmartPinAction());
  }
  if (els.companyTeamBtn){
    els.companyTeamBtn.addEventListener("click", () => {
      document.querySelectorAll(".menu-dropdown.open").forEach(panel => panel.classList.remove("open"));
      document.querySelectorAll(".menu-trigger[aria-expanded='true']").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
      openCompanyTeamModal();
    });
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && isCompanyTeamModalOpen()) closeCompanyTeamModal();
  });
  if (els.refreshBtn){
    els.refreshBtn.addEventListener("click", () => {
      (async () => {
        if (isGuestMode()) {
          loadEntries();
          return;
        }
        if (state.dataSource === "supabase" || databaseSessionCanLoad()) {
          resetLazyDataState({ clearEntries: true });
          await loadPageCurrencyPreferenceFromDatabase();
          await loadTaxSettingsPreferenceFromDatabase();
          updateCurrencyFiltersFromConfig();
          await loadEntriesFromSupabase({ force: true });
        } else {
          loadEntries();
        }
        if (getActiveTabKey() === "notes" || state.notesLoaded) {
          await loadNotesFromDatabase({ force: true }).catch(err => console.error("Notes refresh failed:", err));
        }
        if (getActiveTabKey() === "bitcoin" || state.bitcoinWalletsLoaded) {
          await loadBitcoinWalletsFromDatabase({ force: true }).catch(err => console.error("Bitcoin refresh failed:", err));
        }
      })().catch(err => alert(err.message || err));
    });
  }

  document.getElementById("appAboutInfoBtn")?.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll(".menu-dropdown.open").forEach(p => p.classList.remove("open"));
    if (typeof openLandingContentOverlay === "function") openLandingContentOverlay("about");
    else showStandaloneAbout();
  });

  if (els.zipUsernameInput){
    els.zipUsernameInput.addEventListener("keydown", e => { if (e.key === "Enter") attemptUnlock(); });
  }
  els.zipPasswordInput.addEventListener("keydown", e => { if (e.key === "Enter") attemptUnlock(); });
  els.unlockBtn.addEventListener("click", attemptUnlock);
  const zipPwToggle = document.getElementById("zipPasswordToggle");
  if (zipPwToggle && els.zipPasswordInput) {
    zipPwToggle.addEventListener("click", () => {
      const show = els.zipPasswordInput.type === "password";
      els.zipPasswordInput.type = show ? "text" : "password";
      setPasswordEyeState(zipPwToggle, show);
    });
  }
  if (els.guestLoginBtn){
    els.guestLoginBtn.addEventListener("click", () => openTrialSignupModal());
  }
  if (els.trialSignupBtn && els.trialSignupBtn !== els.guestLoginBtn){
    els.trialSignupBtn.addEventListener("click", () => openTrialSignupModal());
  }
  if (els.trialExpiredLogoutBtn){
    els.trialExpiredLogoutBtn.addEventListener("click", () => {
      hideTrialExpiredOverlay();
      doLogout();
    });
  }

  const trialExpiredPeriod = document.getElementById("trialExpiredPeriod");
  const trialExpiredDays = document.getElementById("trialExpiredDays");
  const trialExpiredUntil = document.getElementById("trialExpiredUntil");
  const syncTrialRenewFields = () => {
    const p = trialExpiredPeriod?.value || "month";
    if (trialExpiredDays) trialExpiredDays.classList.toggle("hide", p !== "custom");
    if (trialExpiredUntil) {
      trialExpiredUntil.classList.toggle("hide", p !== "date");
      if (p === "date") {
        trialExpiredUntil.min = minExtendDateValue();
        if (!trialExpiredUntil.value) trialExpiredUntil.value = minExtendDateValue();
      }
    }
  };
  if (trialExpiredPeriod) {
    trialExpiredPeriod.addEventListener("change", syncTrialRenewFields);
    syncTrialRenewFields();
  }
  document.getElementById("trialExpiredRenewBtn")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("trialExpiredRenewStatus");
    const btn = document.getElementById("trialExpiredRenewBtn");
    try {
      if (btn) { btn.disabled = true; btn.textContent = "…"; }
      if (statusEl) statusEl.textContent = "";
      await submitPlanRenewalRequest({
        period: trialExpiredPeriod?.value || "month",
        days: trialExpiredDays?.value,
        untilDate: trialExpiredUntil?.value || null,
        message: document.getElementById("trialExpiredNote")?.value || "",
        statusEl
      });
    } catch (ex) {
      if (statusEl) statusEl.textContent = ex.message || "Could not send request.";
      else alert(ex.message || "Could not send request.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Request";
      }
    }
  });
  document.getElementById("trialExpiredSettingsBtn")?.addEventListener("click", () => {
    hideTrialExpiredOverlay();
    openAccountSettingsModal();
  });
  
  // Learn More and standalone about section event listeners
  if (els.learnMoreBtn) {
    els.learnMoreBtn.addEventListener("click", showStandaloneAbout);
  }
  if (els.closeStandaloneAboutBtn) {
    els.closeStandaloneAboutBtn.addEventListener("click", hideStandaloneAbout);
  }
  if (els.backToLoginBtn) {
    els.backToLoginBtn.addEventListener("click", hideStandaloneAbout);
  }

  // Pricing section event listeners
  if (els.pricingBtn) {
    els.pricingBtn.addEventListener("click", showStandalonePricing);
  }
  if (els.closeStandalonePricingBtn) {
    els.closeStandalonePricingBtn.addEventListener("click", hideStandalonePricing);
  }
  if (els.backToLoginFromPricingBtn) {
    els.backToLoginFromPricingBtn.addEventListener("click", hideStandalonePricing);
  }

  [["searchGiven","given"],["searchReceived","received"],["searchTaken","taken"],["searchReturned","returned"],["searchInstallments","installments"],["searchGoods","goods"],["searchExpenses","expenses"]].forEach(([id,key]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const run = debounce(async () => {
      if (key === "expenses" && isExpenseLazyMode()) {
        try {
          await loadExpenseActivityForCurrentQuery({ force: true });
        } catch (err) {
          console.warn("Expense search reload failed:", err);
        }
      }
      renderSearchResults(key);
    }, key === "expenses" ? 250 : 160);
    input.addEventListener("input", e => {
      state.search[key] = e.target.value;
      run();
    });
  });
}

function focusUnlockForm(){
  if (typeof openSignInOverlay === "function") {
    try { openSignInOverlay(); } catch (_) {}
  }
  if (els.lockError) els.lockError.textContent = "";
  try { applyRememberMeCheckboxFromPreference(); } catch {}
  const savedUser = sessionStorage.getItem(SESSION_USERNAME_KEY);
  if (els.zipUsernameInput && savedUser && !els.zipUsernameInput.value.trim()){
    els.zipUsernameInput.value = savedUser;
  }
  const focusEl = els.zipUsernameInput && !els.zipUsernameInput.value.trim()
    ? els.zipUsernameInput
    : (els.zipPasswordInput || null);
  if (!focusEl) return;
  // Wait a tick so the overlay is visible before focusing (mobile keyboards / a11y).
  requestAnimationFrame(() => {
    try {
      focusEl.focus({ preventScroll: true });
    } catch {
      try { focusEl.focus(); } catch (_) {}
    }
  });
}

function showStandaloneAbout() {
  // Prefer the shared content overlay (sign-in + in-app About icon)
  if (document.getElementById("landingContentOverlay") && typeof openLandingContentOverlay === "function") {
    openLandingContentOverlay("about");
    return;
  }
  if (els.lockScreen) els.lockScreen.classList.add("hide");
  if (els.standaloneAboutSection) els.standaloneAboutSection.classList.remove("hide");
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.add("hidden-tabs");
  window.location.hash = "#about";
}

function hideStandaloneAbout() {
  if (isLandingContentOverlayOpen()) {
    closeLandingContentOverlay({ clearHash: true });
    return;
  }
  if (els.standaloneAboutSection) els.standaloneAboutSection.classList.add("hide");
  if (els.lockScreen) els.lockScreen.classList.remove("hide");
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.remove("hidden-tabs");
  if (window.location.hash === "#about") {
    history.replaceState(null, null, window.location.pathname);
  }
}

function showStandalonePricing() {
  if (document.getElementById("landingContentOverlay") && typeof openLandingContentOverlay === "function") {
    openLandingContentOverlay("pricing");
    return;
  }
  if (els.lockScreen) els.lockScreen.classList.add("hide");
  if (els.standalonePricingSection) els.standalonePricingSection.classList.remove("hide");
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.add("hidden-tabs");
  window.location.hash = "#pricing";
}

function hideStandalonePricing() {
  if (isLandingContentOverlayOpen()) {
    closeLandingContentOverlay({ clearHash: true });
    return;
  }
  if (els.standalonePricingSection) els.standalonePricingSection.classList.add("hide");
  if (els.lockScreen) els.lockScreen.classList.remove("hide");
  const tabsSection = document.querySelector(".tabs");
  if (tabsSection) tabsSection.classList.remove("hidden-tabs");
  if (window.location.hash === "#pricing") {
    history.replaceState(null, null, window.location.pathname);
  }
}

// Handle URL hash for landing content tabs / login focus
function handleUrlHash() {
  if (!window.location.hash || state.unlocked) return;
  const raw = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
  if (!raw || raw === "top" || raw === "login") {
    closeLandingContentOverlay({ clearHash: raw === "top" || raw === "login", focusLogin: false });
    if (raw === "login") focusUnlockForm();
    else if (typeof closeSignInOverlay === "function") closeSignInOverlay();
    return;
  }
  const section = resolveLandingSection(raw);
  if (section) {
    openLandingContentOverlay(section, { fromHash: true });
    return;
  }
  if (raw === "contact" || raw === "request-access" || raw === "inquiry") {
    document.getElementById("sendInquiryBtn")?.click();
  }
}

const LANDING_SECTION_META = {
  about: { title: "About", kicker: "Brand", hash: "about" },
  features: { title: "Features", kicker: "Product", hash: "features" },
  services: { title: "Services", kicker: "Included", hash: "services" },
  security: { title: "Security", kicker: "Trust", hash: "security" },
  pricing: { title: "Pricing", kicker: "Plans", hash: "pricing" },
  faq: { title: "FAQs", kicker: "Help", hash: "faq" },
  policies: { title: "Policy", kicker: "Terms", hash: "policies" }
};

const LANDING_SECTION_ALIASES = {
  about: "about",
  overview: "about",
  story: "about",
  features: "features",
  protection: "features",
  services: "services",
  security: "security",
  credentials: "security",
  pricing: "pricing",
  faq: "faq",
  faqs: "faq",
  policies: "policies",
  policy: "policies",
  terms: "policies",
  privacy: "policies"
};
