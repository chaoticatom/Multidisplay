// Driver contract every LED output backend implements. Plain JS, not
// enforced by a type system - kept as a single documented shape so
// mockDriver.js (works anywhere, no hardware) and rgbMatrixDriver.js (real
// panels, Pi-only) are interchangeable from the caller's point of view.
//
//   class SomeDriver {
//     renderFrame(core)  // core: a CubeCore instance (see ../core.js).
//                         // Reads core.colBuf/core.faceMap/core.SIZE and
//                         // pushes the current frame to its output. Called
//                         // once per animation tick.
//     close()             // release any hardware/resources. Optional.
//   }
module.exports = {};
