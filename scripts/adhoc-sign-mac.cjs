/**
 * electron-builder `afterSign` hook for the unsigned pre-release: an ad-hoc signature over
 * the whole bundle.
 *
 * Without a Developer ID the app ships unsigned, but "unsigned" on Apple Silicon still
 * leaves Electron's own linker signature on the main binary, sealed against resources that
 * no longer match. Downloaded through a browser, a bundle in that state is "damaged and
 * can't be opened", and macOS offers only Move to Trash. An ad-hoc seal over the finished
 * bundle gets the ordinary unidentified-developer prompt instead, which
 * System Settings → Privacy & Security → Open Anyway gets past.
 *
 * electron-builder 25 has no switch for this (`identity: "-"` is looked up as a keychain
 * name and skipped), so electron-builder.yml names this file as its afterSign hook. It runs
 * before the DMG and zip are made, so both carry the signed bundle. It does nothing unless
 * BANDREADY_ADHOC_SIGN=1, which only the pre-release workflow sets, so a real release with
 * a Developer ID and notarization is untouched.
 */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.BANDREADY_ADHOC_SIGN !== '1') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
    stdio: 'inherit',
  })
}
