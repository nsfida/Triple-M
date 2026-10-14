# Triplem VIP Theme System

Triplem VIP uses one centralized authenticated-workspace theme registry.

## Single source of truth

All theme metadata and semantic design tokens live in:

`Assets/config/themes.js`

Component styles must not contain per-theme palettes. Components consume semantic CSS custom properties such as `--surface`, `--text`, `--primary`, `--overlay-scrim`, `--loader-surface`, and the `--chart-*` series tokens.

`Assets/app/core/07-theme.js` is responsible for selecting a registry entry, applying its tokens, persisting the user's preference, and notifying open charts or overlays when the theme changes.

`Assets/style/31-unified-theme-system.css` is the shared authenticated-workspace component contract. It contains no palette values. It maps cards, forms, buttons, filters, overlays, loading states, menus, tables, charts and Liquid Glass surfaces to semantic tokens.

## Theme IDs

The current registry contains eleven themes:

`default`, `navy`, `neon`, `pink`, `red`, `green`, `ocean`, `sunset`, `purple`, `mono`, `contrast`.

The user-facing names are Default, Dark Navy Blue, Neon, Pink, Red, Dark Green, Ocean Blue, Sunset Amber, Royal Purple, Monochrome and High Contrast.

## Token groups

Every theme must provide the complete `TRIPLEM_THEME_REQUIRED_TOKENS` contract. The contract covers page and component surfaces, text, borders, interactive states, semantic states, Liquid Glass blur/highlights, modal scrims, loading states, tags and filters, scrollbars, chart colors and decorative workspace accents.

Important groups include:

`--bg`, `--page-bg`, `--surface*`, `--control-*`

`--text`, `--text-strong`, `--muted`

`--line`, `--line-strong`, `--glass-border`

`--primary*`, `--secondary*`, `--success*`, `--warning*`, `--danger*`, `--info*`

`--overlay-scrim`, `--overlay-blur`, `--modal-bg`

`--loader-backdrop`, `--loader-surface`, `--loader-spinner`, `--loader-track`

`--glass-blur`, `--glass-saturate`, `--glass-highlight`

`--chart-grid`, `--chart-axis`, `--chart-tooltip-*`, `--chart-series-1` through `--chart-series-8`

## Liquid Glass

Glass surfaces use standard browser CSS:

```css
backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
-webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
```

The translucent background, glass border, blur intensity, highlight and shadow all come from the active theme. The Default theme intentionally uses the strongest reference glass profile.

## Overlay separation

Modal and overlay content must always use `--modal-bg` or another semantic raised-surface token. Its backdrop must use `--overlay-scrim`. Do not create a new modal with a fixed white, black or theme-specific background.

Loading overlays follow the same rule. The Assets pre-chart loader uses the shared `asset-detail-loading` component and the loader token group.

## Charts

Runtime charts must obtain their palette from the active `--chart-*` CSS custom properties. Do not define a separate theme palette in chart component code. When a theme changes, open chart views are rerendered by the theme manager so no previous-theme colors remain on canvas elements.

## Adding a future theme

Add one new entry to `Assets/config/themes.js` with metadata and every required token. Do not add a new per-theme CSS selector and do not modify component code merely to support the new palette.

Choose `mode: "light"` or `mode: "dark"` so native form controls receive the correct browser color scheme. Verify the registry with `window.validateTriplemThemeRegistry()` and run `npm test` before deployment.

Text/background and button contrast must meet WCAG AA. Existing automated tests validate the core text, muted text and primary-button contrast for every registry entry three times, along with token completeness and runtime switching.

## Files involved

`Assets/config/themes.js` defines all theme values.

`Assets/app/core/07-theme.js` applies and persists themes.

`Assets/style/20-themes-performance.css` contains older shared structural theme adaptations but no named theme palettes.

`Assets/style/31-unified-theme-system.css` is the final shared semantic component layer.

`Assets/style/app.bundle.css` is the production stylesheet bundle and includes the unified layer.

`Assets/app/ui/01-render-navigation.js`, `Assets/app/assets/01-assets.js`, `Assets/app/admin/01-admin.js`, and `Assets/app/landing/01-landing.js` read chart tokens where charts are rendered.

## Do not

Do not add a color because one theme looks wrong. Fix the semantic token or the shared component mapping.

Do not identify a theme by a symbol, text color or component-specific CSS exception.

Do not create selectors such as `[data-triplem-theme="pink"]` in component styles. Theme identity belongs in the registry.

Do not use translucent foreground surfaces without an explicit backdrop/scrim when the component overlays other content.
