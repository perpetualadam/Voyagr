# Converting Voyagr PWA to Trusted Web Activity (TWA)

This guide explains how to package the Voyagr PWA as an Android app using Trusted Web Activity (TWA) for distribution on the Google Play Store.

## What is TWA?

A Trusted Web Activity (TWA) allows you to display your PWA in a full-screen Chrome browser without any browser UI. It provides:
- Native app experience from your web app
- Distribution via Google Play Store
- Access to native Android features (via Web APIs)
- Automatic updates through your website

## Prerequisites

1. **Node.js** (v14 or higher)
2. **Java JDK 11+** (required for Android builds)
3. **Android SDK** (installed via Android Studio)
4. **Your PWA** deployed on HTTPS domain

## Method 1: Bubblewrap CLI (Recommended)

Bubblewrap is Google's official CLI tool for generating TWA projects.

### Step 1: Install Bubblewrap

```bash
npm install -g @anthropic/bubblewrap-cli
```

### Step 2: Initialize Project

```bash
bubblewrap init --manifest=https://your-voyagr-domain.com/manifest.json
```

You'll be prompted for:
- Package name (e.g., `com.voyagr.app`)
- App name
- Signing key details

### Step 3: Build the APK

```bash
bubblewrap build
```

This generates:
- `app-release-unsigned.apk` - Unsigned APK
- `app-release-signed.apk` - Signed APK (if key provided)

### Step 4: Generate Signed AAB for Play Store

```bash
bubblewrap build --aaBundle
```

## Method 2: Android Studio

1. Create new Android project
2. Add TWA dependency in `build.gradle`:
   ```gradle
   implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.4.0'
   ```
3. Configure launcher activity in `AndroidManifest.xml`

## Digital Asset Links (assetlinks.json)

This file verifies ownership between your web domain and Android app.

### Step 1: Get Your SHA-256 Fingerprint

```bash
keytool -list -v -keystore your-keystore.jks -alias your-alias
```

Look for the SHA-256 fingerprint in the output.

### Step 2: Create assetlinks.json

Create this file at `https://your-domain.com/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.voyagr.app",
    "sha256_cert_fingerprints": [
      "YOUR:SHA256:FINGERPRINT:HERE"
    ]
  }
}]
```

### Step 3: Deploy assetlinks.json

The file must be:
- Accessible via HTTPS
- Content-Type: `application/json`
- Return HTTP 200

For Voyagr, place at: `/static/.well-known/assetlinks.json`

## Google Play Store Submission

### Step 1: Create Developer Account
- Go to [Google Play Console](https://play.google.com/console)
- Pay one-time $25 registration fee

### Step 2: Create New App
1. Click "Create app"
2. Fill in app details
3. Complete store listing with:
   - App icon (512x512 PNG)
   - Screenshots (phone + tablet)
   - Feature graphic (1024x500)
   - Description

### Step 3: Upload AAB
1. Go to **Release** > **Production**
2. Create new release
3. Upload your `.aab` file
4. Add release notes
5. Review and roll out

## Testing

### Local Testing
```bash
bubblewrap install
```

### Asset Links Verification
Visit: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://your-domain.com`

## Troubleshooting

### Browser Bar Still Showing
- Verify assetlinks.json is accessible
- Check SHA-256 fingerprint matches
- Clear Chrome data on test device

### App Crashes on Launch
- Check manifest.json is valid
- Ensure start_url is accessible
- Verify HTTPS certificate

## Resources

- [Bubblewrap Documentation](https://github.com/AgoraIO-Community/AgoraAppBuilder/blob/main/docs/bubblewrap.md)
- [TWA Developer Guide](https://developer.chrome.com/docs/android/trusted-web-activity/)
- [Play Console Help](https://support.google.com/googleplay/android-developer/)
