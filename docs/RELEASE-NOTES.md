FakeIDM 1.2.0 — Windows and Linux installers

- Windows x64: download `FakeIDM-1.2.0-Windows-x64-Setup.exe` and run it. Installs for the current user, adds Start menu/Desktop shortcuts and an uninstaller. Close FakeIDM before installing an update. The installer is not code-signed.
- Debian/Ubuntu amd64: download `FakeIDM-1.2.0-Linux-amd64.deb`, then run `sudo apt install ./FakeIDM-1.2.0-Linux-amd64.deb`. Launch FakeIDM from the applications menu or run `fakeidm`. Chromium sandbox stays enabled.
- Includes the browser extension in the installation folder under `extension`. Browser pairing is still required.
- User settings and downloaded files are preserved when uninstalling.
- SHA-256 checksums are included. Both packages are installed, launched with a desktop smoke test, and uninstalled on GitHub-hosted Windows/Ubuntu runners before publication.

Google Drive share pages requiring login/confirmation are not automatically resolved. Use the browser extension to pass a direct download URL and applicable cookies.
