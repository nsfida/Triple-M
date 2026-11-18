/* Triplem VIP · one rule for closing menus (2026-11-18)
 *
 * Every dropdown closes when you tap or click anywhere outside it, press Escape, or open another
 * menu. Section menus have their own open/close code; some row menus stopped the click from
 * reaching the page, so they stayed open. This runs in the capture phase (before any section code)
 * and only closes menus: it never opens one and never changes what a menu item does.
 * The look of the menus is in Assets/style/76-menu-system.css.
 */
(function initTriplemMenuSystem(doc){
  "use strict";
  if (!doc || doc.__tmMenuSystem) return;
  doc.__tmMenuSystem = true;

  // [open-menu selector, close(menu)]
  const KINDS = [
    [".menu-dropdown.open", m => m.classList.remove("open")],
    [".expense-tx-menu.is-open, .loan-tx-menu.is-open", m => m.classList.remove("is-open", "is-portal")],
    [".loan-detail-pdf-menu.is-open", m => m.classList.remove("is-open")],
    [".exh-menu:not([hidden]), .inv2-menu-pop:not([hidden]), .assets-pdf-menu:not([hidden]), .tm-lang-menu:not([hidden])", m => { m.hidden = true; }],
    [".expense-history-pdf-menu:not(.hide)", m => m.classList.add("hide")],
    [".financial-audit-export-menu.is-open", m => m.classList.remove("is-open")]
  ];
  const TRIGGER = ".menu-trigger,[aria-haspopup='menu'],[aria-haspopup='true'],[data-entry-menu],[data-expense-tx-menu],[data-expense-record-menu],.loan-tx-menu-btn,.exh-kebab,[data-exh-pdf-menu],[data-more],[data-lang-toggle],.financial-audit-export-trigger";

  const isOpenMenu = (el, sel) => el.matches(sel) && (el.offsetParent !== null || getComputedStyle(el).position === "fixed");
  function resetTrigger(menu){
    const wrap = menu.parentElement;
    wrap?.querySelectorAll?.(":scope > [aria-expanded='true']").forEach(t => t.setAttribute("aria-expanded", "false"));
    wrap?.classList?.remove("open");
    // portalled menus remember their trigger through the id they were opened for
    const key = menu.dataset.expenseTxMenuPanel || menu.dataset.expenseRecordMenuPanel || menu.dataset.personMenuPanel;
    if (key) doc.querySelectorAll(`[aria-expanded='true'][data-expense-tx-menu="${CSS.escape(key)}"],[aria-expanded='true'][data-expense-record-menu="${CSS.escape(key)}"],[aria-expanded='true'][data-person-menu="${CSS.escape(key)}"]`).forEach(t => t.setAttribute("aria-expanded", "false"));
  }
  function closeAll(target){
    const trigger = target?.closest?.(TRIGGER) || null;
    for (const [sel, close] of KINDS) {
      doc.querySelectorAll(sel).forEach(menu => {
        if (!isOpenMenu(menu, sel)) return;
        if (target && menu.contains(target)) return;
        // the menu's own button toggles it; leave that to the section's code
        if (trigger && (menu.parentElement?.contains(trigger) || trigger.getAttribute("aria-expanded") === "true")) return;
        close(menu);
        resetTrigger(menu);
      });
    }
  }

  doc.addEventListener("pointerdown", e => { if (e.button === 0 || e.pointerType !== "mouse") closeAll(e.target); }, true);
  doc.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(null); }, true);
  window.addEventListener("blur", () => closeAll(null));

  window.TriplemMenus = Object.freeze({ closeAll: () => closeAll(null) });
})(document);
