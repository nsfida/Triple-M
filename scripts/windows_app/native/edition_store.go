//go:build store

package main

// Microsoft Store edition (the MSIX packages). Built with `-tags store`:
//   * no self-updater: the Microsoft Store installs every update;
//   * no uninstaller or registry autostart: Windows manages both for packaged apps;
//   * the page is told it runs in the Store edition, which has its own feature set
//     (see Assets/app/core/00-store-edition.js) and its own pages (/windows-store/).
const appEdition = "store"
