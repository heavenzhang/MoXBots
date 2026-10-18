package com.moxbots.mobile.remote

import android.content.Context
import android.content.ContextWrapper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileDescriptor
import java.io.FileOutputStream
import java.net.URI
import java.net.URL
import java.security.KeyStore
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import javax.net.ssl.HttpsURLConnection

/** Explicit public TLS/start/cancel probe. Default offline tests never connect. */
@RunWith(AndroidJUnit4::class)
class NativeLiveLoginInstrumentedTest {
  @Test
  fun cleartextIsLimitedToPublicIssuerRevocationLists() {
    val policy = android.security.NetworkSecurityPolicy.getInstance()
    assertFalse(policy.isCleartextTrafficPermitted())
    for (host in arrayOf("140.143.183.232", "example.com", "c.lencr.org.example.com")) {
      assertFalse(host, policy.isCleartextTrafficPermitted(host))
    }
    assertTrue(policy.isCleartextTrafficPermitted("ye1.c.lencr.org"))
  }

  @Test
  fun originalAndroidClientStartsAndCancelsLoginWithoutAuthenticating() {
    val arguments = InstrumentationRegistry.getArguments()
    assumeTrue(arguments.getString("moxLiveLoginProbe") == "1")
    val origin = arguments.getString("moxLiveOrigin") ?: error("Explicit origin required")
    val uri = URI(origin)
    require(uri.scheme == "https" && uri.host != null && uri.userInfo == null &&
      uri.query == null && uri.fragment == null && uri.path.isNullOrEmpty())

    val policy = android.security.NetworkSecurityPolicy.getInstance()
    assertFalse(policy.isCleartextTrafficPermitted(uri.host))
    assertFalse(policy.isCleartextTrafficPermitted("example.com"))
    assertTrue(policy.isCleartextTrafficPermitted("ye1.c.lencr.org"))
    val base = InstrumentationRegistry.getInstrumentation().targetContext
    val token = UUID.randomUUID().toString()
    val directory = File(base.cacheDir, "native-login-probe-$token")
    var ownsDirectory = false
    var primaryFailure: Throwable? = null
    val testPackage = base.packageName + ".loginprobe." + token
    val context = object : ContextWrapper(base) {
      override fun getNoBackupFilesDir(): File = directory
      override fun getPackageName(): String = testPackage
      override fun getApplicationContext(): Context = base.applicationContext
    }
    var connection: NativeConnection? = null
    try {
      check(directory.mkdir())
      ownsDirectory = true
      android.system.Os.chmod(directory.absolutePath, 448) // 0700
      val owner = NativeConnection(context, origin).also { connection = it }
      val before = JSONObject(owner.request("""{"version":1,"kind":"account.status"}"""))
      assertEquals("account", before.getString("kind"))
      assertEquals("signed-out", before.getString("state"))
      val diagnosticFile = File(directory, "native-diagnostic.log")
      val stderr = android.system.Os.dup(FileDescriptor.err)
      val start = FileOutputStream(diagnosticFile).use { output ->
        android.system.Os.dup2(output.fd, 2)
        try { JSONObject(owner.request("""{"version":1,"kind":"account.login.start"}""")) }
        finally {
          android.system.Os.dup2(stderr, 2)
          android.system.Os.close(stderr)
          output.fd.sync()
        }
      }
      val nativeDiagnostic = diagnosticFile.readText().take(8192).lineSequence()
        .filter { it.startsWith("[network] service=") }.take(4).joinToString("; ")
      // Assertion messages deliberately omit the authorization URL/verifier.
      val platformHttps = if (start.optString("kind") == "login") "not-needed" else {
        var probe: HttpsURLConnection? = null
        try {
          probe = URL("$origin/api/agent-network/instance").openConnection() as HttpsURLConnection
          probe.connectTimeout = 10000
          probe.readTimeout = 10000
          val status = probe.responseCode
          val verifier = Class.forName("org.rustls.platformverifier.CertificateVerifier")
          val method = verifier.declaredMethods.single { it.name == "verifyCertificateChain" }
          method.isAccessible = true
          val result = method.invoke(null, base.applicationContext, uri.host, "RSA",
            arrayOf("1.3.6.1.5.5.7.3.1"), null, System.currentTimeMillis(),
            probe.serverCertificates.map { it.encoded }.toTypedArray())
          val code = result.javaClass.getDeclaredField("code").apply { isAccessible = true }
            .getInt(result)
          val message = result.javaClass.getDeclaredField("message").apply { isAccessible = true }
            .get(result)?.toString().orEmpty().replace(Regex("https?://[^\\s]+"), "[url]")
            .take(400)
          "HTTP-$status; javaVerifierCode=$code; certificateDiagnostic=$message"
        } catch (failure: Exception) { failure.javaClass.simpleName }
        finally { probe?.disconnect() }
      }
      assertEquals("Native start code=" + start.optString("code", "none") +
        "; platformHttps=" + platformHttps + "; nativeDiagnostic=" + nativeDiagnostic,
        "login", start.getString("kind"))
      assertEquals("https", URI(start.getString("authorizationUrl")).scheme)
      assertTrue(start.getLong("expiresAt") > System.currentTimeMillis() / 1000)
      val cancelled = JSONObject(owner.request("""{"version":1,"kind":"account.logout"}"""))
      assertEquals("Original pending-login cancellation code=" + cancelled.optString("code", "none"),
        "account", cancelled.getString("kind"))
      assertEquals("signed-out", cancelled.getString("state"))
      assertTrue(cancelled.isNull("principalId"))
    } catch (failure: Throwable) {
      primaryFailure = failure
      throw failure
    } finally {
      var cleanupFailure: Throwable? = null
      fun clean(action: () -> Unit) {
        try { action() } catch (failure: Throwable) {
          val original = primaryFailure ?: cleanupFailure
          if (original != null) original.addSuppressed(failure) else cleanupFailure = failure
        }
      }
      clean { connection?.request("""{"version":1,"kind":"account.logout"}""") }
      clean { connection?.close() }
      if (ownsDirectory) clean { check(directory.deleteRecursively()) { "Probe directory cleanup failed" } }
      clean {
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
          .deleteEntry("$testPackage.remote.records.v1")
      }
      cleanupFailure?.let { throw it }
    }
  }
}
