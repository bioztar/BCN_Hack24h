# HANDOVER — BCN_Hack24h/ios — 2026-10-09 21:05
## State: phase 1 (no-server) complete; simulator build + 3 tests green.
## Done this session
- `ios/` SwiftUI app via XcodeGen (`cd ios && xcodegen generate`), bundle com.pro7ocol.eurocrat, display name Eurocrat, team H6MBTUJ4TQ.
- SceneKit box + CoreMotion gravity + shake→REFUSÉ + Core Haptics + idle sleep + dictate/text → roast stream → verdict card/share.
- Mock vs live backend behind `RoastBackend` (`ROAST_BACKEND` in project.yml, or launch arg `-RoastBackend live`).
## In flight / partially done
- Nothing half-done. Placeholder capsule officer (`Scene/BoxScene.swift` buildOfficer).
## Next steps (ordered)
1. Plug in/unlock iPhone, run from Xcode, tune `MotionService.shakeThreshold` and `BoxScene.gravityScale`.
2. When eurocrat.pro7ocol.com is live: set ROAST_BACKEND=live, run dictate→roast→audio→share. Check `/api/stt` accepts audio/mp4 (m4a).
3. Convert assets/generated/3d/<id>.glb → USDZ, replace placeholder officer; use stills for portraits.
## Blockers / needs human
- iPhone unavailable; live API not up.
## Key files touched
- ios/project.yml, ios/PocketEurocrat/{PocketModel.swift,Backend/*,Scene/BoxScene.swift,Services/*,Views/*}
