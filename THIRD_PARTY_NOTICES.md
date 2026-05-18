# Third Party Notices

This project includes original project code and redistributed localization resources. The notices below are intended to preserve upstream attribution and clarify licensing boundaries for public redistribution.

## Project code and Cursor hardcoded UI patch data

- Files: `extension.js`, `workbenchPatcher.js`, `scripts/`, `cursor-hardcoded-patches.json`, project metadata and documentation.
- Copyright: Cursor Zh Hans Language Pack contributors.
- License: MIT License, see `LICENSE`.

`cursor-hardcoded-patches.json` contains replacement pairs and UI text translations authored for this project. It does not include Cursor source files or bundled Cursor application code.

## Microsoft Visual Studio Code Chinese (Simplified) language pack resources

- Files: `translations/main.i18n.json` and `translations/extensions/*.i18n.json` entries whose file header states `Copyright (c) Microsoft Corporation. All rights reserved.` and `Licensed under the MIT License`.
- Upstream: Microsoft Visual Studio Code Chinese (Simplified) language pack and related VS Code built-in extension localization resources.
- License: MIT License, as stated in the generated translation files.

These files are redistributed with their upstream copyright and license notice preserved in the file headers.

## Build-time npm dependencies

- File: `package-lock.json` records the exact dependency tree used for packaging.
- Main direct development dependency: `@vscode/vsce`.
- Licenses: dependency licenses are recorded in `package-lock.json` and are not bundled into the published VSIX because `node_modules/` is excluded by `.vscodeignore`.

## Cursor and Visual Studio Code trademarks

This is an unofficial community project. Cursor, Anysphere, Visual Studio Code, VS Code, and related names or marks belong to their respective owners and are used only to describe compatibility and upstream resource sources.

## Optional local extension NLS synchronization

The sync script can optionally include local third-party extension `package.nls.zh-cn.json` files when `CURSOR_ZH_HANS_INCLUDE_EXTERNAL_NLS=1` is set. That mode is disabled by default for public releases. If enabled, verify each source extension license before redistributing generated files.