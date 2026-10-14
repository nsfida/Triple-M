/**
 * Pure permission / role gate helpers (browser + Node).
 * Callers supply session context; no DOM or global state.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.TripleMPermissions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VIEW_GATED_MODULES = new Set([
    "dashboard",
    "expenses",
    "wallets",
    "inventory",
    "customers",
    "loans",
    "installments",
    "notes",
    "bitcoin",
    "assets",
    "accounting",
    "reports",
    "pdf_export",
    "currency_settings",
    "settings",
    "admin_panel",
  ]);

  function normalizeAssignedModules(rawTabs) {
    const set = new Set();
    (Array.isArray(rawTabs) ? rawTabs : []).forEach((raw) => {
      const t = String(raw || "").trim().toLowerCase();
      if (!t) return;
      if (t === "goods" || t === "inventory") set.add("inventory");
      else if (t === "expense" || t === "expenses" || t === "wallets") set.add("expenses");
      else if (t === "loan" || t === "loans") set.add("loans");
      else if (t === "installment" || t === "installments") set.add("installments");
      else if (t === "note" || t === "notes") set.add("notes");
      else if (t === "btc" || t === "bitcoin") set.add("bitcoin");
      else if (t === "asset" || t === "assets") set.add("assets");
      else if (["account", "accounts", "accounting", "books", "bookkeeping"].includes(t)) set.add("accounting");
      else if (t === "report" || t === "reports" || t === "pdf" || t === "pdf_export")
        set.add("reports");
      else if (t === "currency" || t === "currency_settings") set.add("currency_settings");
      else if (t === "setting" || t === "settings") set.add("settings");
      else if (t === "admin" || t === "admin_panel") set.add("admin_panel");
      else if (t === "dashboard" || t === "overview") set.add("dashboard");
      else if (t === "customers" || t === "customer") set.add("customers");
      else set.add(t);
    });
    if (set.has("expenses")) set.add("wallets");
    if (set.has("inventory")) set.add("customers");
    if (set.has("reports")) set.add("pdf_export");
    if (set.has("currency_settings")) set.add("settings");
    return set;
  }

  function isTeamMemberAccount(user) {
    return !!(user && user.team_owner_id);
  }

  function isTeamOwnerAccount(user) {
    return !!(user && user.allow_team_members && !user.team_owner_id);
  }

  function canManageCompanyTeam(user) {
    if (!user) return false;
    if (isTeamOwnerAccount(user)) return true;
    return isTeamMemberAccount(user) && !!user.team_permissions?.can_manage_team;
  }

  function teamCapability(key, user) {
    if (!isTeamMemberAccount(user)) return true;
    return !!user?.team_permissions?.[key];
  }

  /**
   * Pure permission check matching SPA userHasPermission behavior.
   * @param {{
   *   moduleName: string,
   *   action?: string,
   *   isGuest?: boolean,
   *   sessionUser?: object|null,
   *   trialLocked?: boolean,
   *   isTrial?: boolean,
   *   assignedModules?: Set<string>|null,
   *   permissions?: Array<{module:string, action:string, allowed?:boolean}>
   * }} ctx
   */
  function evaluateUserPermission(ctx) {
    const moduleName = ctx.moduleName;
    const action = ctx.action || "view";
    if (ctx.isGuest) {
      return !["admin_panel", "pdf_export", "assets"].includes(moduleName);
    }
    if (!ctx.sessionUser) return false;
    if (moduleName === "admin_panel" && ctx.isTrial) return false;
    if (ctx.trialLocked) return false;
    if (ctx.sessionUser.is_protected && ctx.sessionUser.role === "admin") return true;

    const permissions = Array.isArray(ctx.permissions) ? ctx.permissions : [];
    const explicitAllowed = permissions.some(
      (p) => p.module === moduleName && p.action === action && p.allowed === true
    );

    const assigned = ctx.assignedModules;
    if (assigned && action === "view" && VIEW_GATED_MODULES.has(moduleName)) {
      if (assigned.has(moduleName)) return true;
      // Accounting was introduced after legacy Tabs arrays were persisted. Its
      // explicit server permission is therefore authoritative for established
      // users, without rewriting their existing settings payload.
      if (moduleName === "accounting") return explicitAllowed;
      return false;
    }

    return explicitAllowed;
  }

  return {
    VIEW_GATED_MODULES,
    normalizeAssignedModules,
    isTeamMemberAccount,
    isTeamOwnerAccount,
    canManageCompanyTeam,
    teamCapability,
    evaluateUserPermission,
  };
});
