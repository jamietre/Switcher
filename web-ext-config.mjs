// Shared configuration for web-ext (build / lint / sign).
//
// Use web-ext >= 10. Version 8.3.0 fails against Node 24+ with AMO rejecting
// the upload as "unsupported_filetype" -- it does not send a filename in the
// multipart upload, so addons.mozilla.org cannot see the .zip extension.
//
//   npx web-ext@10.8.0 lint  --source-dir .
//   npx web-ext@10.8.0 build --source-dir .
//   npx web-ext@10.8.0 sign  --channel=unlisted --source-dir .
//
// Signing needs AMO API credentials in the environment as WEB_EXT_API_KEY and
// WEB_EXT_API_SECRET (generate at
// https://addons.mozilla.org/en-US/developers/addon/api/key/).
// Keeps development-only files out of the packaged extension.
export default {
  ignoreFiles: [
    "test/**",
    "switcher-images/**",
    "web-ext-artifacts/**",
    "web-ext-config.mjs",
    "README.md",
  ],
};
