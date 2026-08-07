// Merge into android/app/src/main/java/.../MainActivity.java after `npx cap add android`.
// Extends the Capacitor-generated BridgeActivity with:
//   1. A DownloadListener that hands file downloads (APK/EXE/DMG/.deb links
//      from the /download page) off to Android's DownloadManager — WebView
//      does not handle file downloads on its own.
//   2. A WebViewClient override that blocks navigation outside the official
//      domain (defense in depth alongside allowNavigation + network security config).
//   3. Swap-to-offline.html on load failure, with a ConnectivityManager
//      callback that reloads the production URL the instant the network
//      comes back.
//   4. Deep link validation on onNewIntent, so a malformed or spoofed link
//      never gets forwarded into the WebView.

package com.jedidamarketplace.app;

import android.app.DownloadManager;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  private static final String OFFICIAL_HOST_SUFFIX = "jedidamarketplace.com";
  private String lastKnownGoodUrl = "https://jedidamarketplace.com";
  private boolean isShowingOffline = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = this.bridge.getWebView();

    // WebView has no built-in file-download handling — an <a href download>
    // tap (e.g. the APK/EXE/DMG/.deb links on the /download page) is
    // otherwise silently swallowed. Hand it off to the system DownloadManager
    // so it lands in the real Downloads folder with a progress notification,
    // same as it would in a regular browser.
    webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
      try {
        String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.addRequestHeader("User-Agent", userAgent);
        request.setMimeType(mimetype);
        request.setTitle(filename);
        request.setDescription("Downloading " + filename);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
        request.allowScanningByMediaScanner();

        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        dm.enqueue(request);
        Toast.makeText(getApplicationContext(), "Downloading " + filename + "…", Toast.LENGTH_LONG).show();
      } catch (Exception e) {
        Toast.makeText(getApplicationContext(),
            "Couldn't start the download — try again from a browser.", Toast.LENGTH_LONG).show();
      }
    });

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        String host = request.getUrl().getHost();
        if (host != null && (host.equals(OFFICIAL_HOST_SUFFIX) || host.endsWith("." + OFFICIAL_HOST_SUFFIX))) {
          return false; // let the shell's WebView handle it
        }
        // Anything off-domain (external marketplace partner links, payment
        // provider redirects the site itself opens, etc.) opens in the
        // system browser instead of inside the shell.
        Intent intent = new Intent(Intent.ACTION_VIEW, request.getUrl());
        startActivity(intent);
        return true;
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        if (url != null && url.startsWith("https://" + OFFICIAL_HOST_SUFFIX)) {
          lastKnownGoodUrl = url;
        }
      }

      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame() && !isShowingOffline) {
          isShowingOffline = true;
          view.loadUrl("file:///android_asset/public/offline.html");
        }
      }
    });

    ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
    cm.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
      @Override
      public void onAvailable(Network network) {
        if (isShowingOffline) {
          runOnUiThread(() -> {
            isShowingOffline = false;
            webView.loadUrl(lastKnownGoodUrl);
          });
        }
      }
    });
  }

  @Override
  public void onNewIntent(Intent intent) {
    Uri data = intent.getData();
    if (data != null) {
      String host = data.getHost();
      boolean isValidHost = host != null &&
          (host.equals(OFFICIAL_HOST_SUFFIX) || host.endsWith("." + OFFICIAL_HOST_SUFFIX));
      boolean isValidScheme = "jedidamarketplace".equals(data.getScheme()) || "https".equals(data.getScheme());
      if (!isValidHost && !"jedidamarketplace".equals(data.getScheme())) {
        // Drop anything that doesn't match the official host/scheme —
        // never forward an unvalidated deep link into the WebView.
        return;
      }
    }
    super.onNewIntent(intent);
  }
}
