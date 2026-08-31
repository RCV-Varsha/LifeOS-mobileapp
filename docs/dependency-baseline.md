# Mobile dependency baseline

Date: 2026-08-31

## Starting point

The mobile app was generated from Expo's blank TypeScript
template targeting SDK 54.

Installed Expo version inspected: 54.0.37.

## Unresolved findings

npm audit reported 16 affected dependency entries:
7 moderate and 9 high.

Underlying packages identified:
- image-size 1.2.1 through Metro
- postcss 8.4.49 through Expo Metro configuration
- uuid 7.0.3 through xcode and Expo configuration plugins

An audit-fix dry run left all 16 findings unresolved.
No automatic remediation was applied.

The dependency paths suggest development/build tooling exposure.
Exploitability in this project has not been fully assessed.

## Decision

Perform a controlled Expo upgrade, then verify dependency
compatibility, TypeScript, security findings, and Android execution.

This checkpoint is not approved for production release.