#!/usr/bin/env node
/**
 * sign-gcs.js
 *
 * Purpose
 * - Generate Google Cloud Storage V4 signed URLs for PUT (upload) and GET (download)
 *   so you can test the "Edge mints PUT → Actor uploads → Node records" flow
 *   without wiring Hono yet.
 *
 * Usage
 *   # Prereqs: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with:
 *   #   roles/storage.objectCreator, roles/iam.serviceAccountTokenCreator (for signing)
 *
 *   node scripts/sign-gcs.js <bucket> <objectPath> [contentType] [putTtlSecs]
 *
 *   Examples
 *     node scripts/sign-gcs.js babelback-dev downloads/dev-001.m4a audio/mp4 1800 > urls.json
 *     node scripts/sign-gcs.js babelback-dev downloads/dev-002.mp3 audio/mpeg 1200 > urls.json
 *
 * Output
 *   Prints a JSON blob with { bucket, object, contentType, uploadUrl, getUrl } to stdout.
 */

const { Storage } = require('@google-cloud/storage')

async function main() {
  const [bucketName, objectPath, contentType = 'audio/mp4', putTtlSecs = '1800'] = process.argv.slice(2)

  if (!bucketName || !objectPath) {
    console.error('Usage: node scripts/sign-gcs.js <bucket> <objectPath> [contentType] [putTtlSecs]')
    process.exit(1)
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('[warn] GOOGLE_APPLICATION_CREDENTIALS is not set; relying on ADC. Make sure your identity can sign URLs.')
  }

  const storage = new Storage()
  const file = storage.bucket(bucketName).file(objectPath)

  const putExpires = Date.now() + Number(putTtlSecs) * 1000
  const getExpires = Date.now() + 2 * 60 * 60 * 1000 // 2h GET by default

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: putExpires,
    contentType,
  })

  const [getUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: getExpires,
  })

  const result = { bucket: bucketName, object: objectPath, contentType, uploadUrl, getUrl }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

main().catch((err) => {
  console.error('[error] failed to sign URLs:', err && err.stack ? err.stack : String(err))
  process.exit(1)
})

