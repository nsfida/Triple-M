# Triplem VIP for Windows — release workflow (3.10.2, 2026-11-17)

Every Windows release follows these steps. The goal: the source folder, GitHub and the update feed always
hold the **same, latest** installer, and no outdated installer stays anywhere.

## Identity (must match the Microsoft Store listing)

| Field | Value |
|---|---|
| Package name | `TriplemVIP.TriplemVIP` |
| Publisher | `CN=D58541F4-18AA-431F-869F-990A8A8D60CE` |
| Publisher display name | Triplem VIP |
| Package family name | `TriplemVIP.TriplemVIP_5xa2pdgfswx0g` |
| Store ID | `9MV028GH5NPX` — <https://apps.microsoft.com/detail/9MV028GH5NPX> |

These values are in:

- `scripts/windows_app/msix/AppxManifest.xml` (the package identity; Partner Center checks it);
- `scripts/windows_app/build_resources.py`:
  - the version information of `TriplemVIP_Setup.exe` (company, product, comments, Store ID, package family);
  - the application manifest identity;
- `scripts/windows_app/installer/main.go`: the uninstall entry under Apps & features (publisher, help
  link, update link pointing to the Store, Store ID).

## Steps

1. **Version:** raise it in four places, which must be identical. `tests/windows-release-sync.test.js` fails
   otherwise.
   - `scripts/windows_app/build_windows_app.sh` (`VERSION`);
   - `scripts/windows_app/native/logic.go` (`appVersionNative`);
   - `scripts/windows_app/installer/main.go` (`appVersion`);
   - `scripts/windows_app/msix/AppxManifest.xml` (`Version="x.y.z.0"`).
2. **Store packages first:** `bash scripts/windows_app/msix/build_msix.sh` builds `TriplemVIP-x64.msix` and
   `TriplemVIP-arm64.msix`. It writes its own temporary installer and never touches the published one.
3. **Direct-download installer last:**

   ```
   TRIPLEM_UPDATE_KEY_FILE=<path outside the project> bash scripts/windows_app/build_windows_app.sh
   ```

   This writes:
   - `Assets/mobile_app/Windows/TriplemVIP_Setup.exe`;
   - `latest.json`, which holds the version, size, SHA-256 and release notes, and is signed with the update
     key.

   The update key never goes into the project, the ZIP or GitHub.
4. **Check:** `node --test tests/windows-release-sync.test.js tests/windows-installer-glass.test.js`. This
   confirms that:
   - the four versions match;
   - `latest.json` matches the exe's size and SHA-256;
   - the exe carries the Store identity.
5. **Publish together:**
   - Upload `TriplemVIP_Setup.exe` and `latest.json` in the **same** commit (GitHub upload folder) and to
     the website. The old installer is replaced, not kept next to it.
   - Upload the `.msix` files in Partner Center (Store packages folder of the delivery ZIP).

## What users see

- **Microsoft Store install:** Microsoft re-signs the package, so there is no SmartScreen warning. The app
  updates through the Store.
- **Direct download (`TriplemVIP_Setup.exe`):**
  - File > Properties > Details shows Triplem VIP, the version and the Store ID.
  - Apps & features shows the publisher Triplem VIP with a link to the Store listing.
  - The file is **not Authenticode-signed**, so SmartScreen can still show "Unknown publisher". Only a
    code-signing certificate can change that (see `WINDOWS-APP-SIGNING.md`). Metadata cannot, and nothing
    in the app tries to bypass or imitate a signature.
  - The app's built-in updater accepts only installers whose SHA-256 matches a `latest.json` signed with
    the update key.
