# Original Host image admission boundary

The original product image limit is `USER_IMAGE_ATTACHMENT_MAX_BYTES=10MiB` in `src/shared/fileTypes.ts`; the desktop mobile owner, original Host worker and iOS/Android native image pickers use it. Headless main independently hardcoded5MiB, rejecting otherwise supported images before receipt admission. Main now imports the original file/image constants and keeps their existing checks; it does not change the public wire, provider limits, image bytes or execution permissions.

Reproduce explicitly from the root:

```sh
source /tmp/moxbots-mobile-toolchain-002.zsh && /Applications/MoXBots.app/Contents/Resources/nodejs/bin/node --import tsx scripts/verify-mobile-original-host-loopback.ts --image-boundary
```

The optional fixture mode creates a valid1400×1400 RGB PNG with5883258 bytes (random synthetic pixels,5MiB<size<10MiB), uploads it through real24KiB begin/chunk/finish staging, sends through original main/worker/SDK/native to a controlled127 supplier, checks the actual image request, exact original attachment readback, same-operation receipt deduplication and genuine Host restart. Default invocation still verifies the40-byte text-file path. No large fixture image is committed.

Actual red before repair: `/tmp/moxbots-mobile-image-boundary-red.log`, private `.mox-original-host-W8w7aE`;4906ms, `REMOTE_MOBILE_ASSET_SIZE_LIMIT`, supplierCalls1 (only prior text turn). The staged image was not replaced with a smaller one to pass.

After repair: `/tmp/moxbots-mobile-image-boundary-green.log`, private `.mox-original-host-P3K0pl`;PASS9554ms, supplierCalls2. Original Session `5d4ab850-0b52-4175-b595-0ef16884da54` accepted the real image, identical operation returned original receipt,2 original terminal sources persisted, and new supervisor20398 recovered original source/receipts without another SDK call. Independent raw-file verification checked all IHDR/IDAT/IEND CRCs, exact1400×1400 RGB scanline decompression, and SHA256 `e0a0c40cdabf471d8a467b3adb3837893474c1de832cc80371ed293cc8ee17c9`. All five recorded PIDs20301/20303/20326/20336/20398 were absent after cleanup. Default40-byte file regression then passed3451ms.

Full root typecheck, dedicated script typecheck and focused lint passed. This proves the original Host image-admission/SDK path against a controlled supplier and synthetic management authority. It does not prove a physical picker, native upload scheduler/E2EE/WSS, real provider image-size policy, camera fidelity or mobile preview. Large-image boundary uses the existing product contract, not a claim that every provider accepts10MiB images.
