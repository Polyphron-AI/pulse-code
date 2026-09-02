# Import browser logins

In the desktop app, open **Settings → Integrations → Browser profiles → Add profile**
and choose a browser under **Import from**. The import copies cookies into a Pulse Code browser
profile so you can use existing logins in the preview browser. Changes made afterward stay
separate from the source browser.

Linux discovery includes Helium and both native and Snap installations of Firefox. Windows
discovery includes Firefox and Helium builds that still use Windows' standard profile
encryption. Other Chromium-based browsers on Windows use app-bound cookie encryption and cannot
be imported. A browser appears once it has a profile with a cookie database. Close the source
browser before importing; the import wizard will prompt you if it is still running.

On Linux, Chromium-based browsers use your desktop keyring to protect their cookies. Pulse Code
includes the keyring reader; no separate command-line tool is needed. Allow the desktop unlock
prompt if one appears. If the keyring cannot be accessed, Pulse Code reports that failure when no
cookies can be imported. Some sites may still require you to sign in again.

On macOS, Safari is also available. Safari protects its cookies with Full Disk Access rather than
a keychain, so the import wizard asks you to grant it: **Open System Settings** takes you to the
right pane, and macOS may ask you to quit and reopen Pulse Code before the grant applies. You can
revoke Full Disk Access after the import is done. Only Safari's primary profile is imported; cookies
kept by additional Safari profiles are not.

Partitioned cookies are skipped on all platforms.
