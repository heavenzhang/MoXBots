package com.moxbots.mobile.remote

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.util.concurrent.Executors
import org.json.JSONObject

class MoxBotsRemoteModule : Module() {
  private val owner = Executors.newSingleThreadExecutor()
  private var connection: NativeConnection? = null
  override fun definition() = ModuleDefinition {
    Name("MoxBotsRemote")
    Events("snapshotChanged")
    AsyncFunction("request") { input: String, promise: Promise ->
      owner.execute {
        try {
          if (connection == null) {
            val context = requireNotNull(appContext.reactContext) { "MOBILE_CONNECTION_UNAVAILABLE" }
            val info = context.packageManager.getApplicationInfo(context.packageName, android.content.pm.PackageManager.GET_META_DATA)
            val origin = info.metaData?.getString("com.moxbots.mobile.SERVICE_ORIGIN") ?: "https://140.143.183.232"
            connection = NativeConnection(context, origin)
          }
          promise.resolve(connection!!.request(input))
        } catch (_: Exception) { promise.resolve(failure("MOBILE_CONNECTION_UNAVAILABLE")) }
      }
    }
    OnActivityEntersBackground {
      owner.execute { try { connection?.request("{\"version\":1,\"kind\":\"connection.suspend\"}") } catch (_: Exception) { } }
    }
    OnDestroy {
      owner.execute { connection?.close(); connection = null }
      owner.shutdown()
    }
  }
  private fun failure(code: String) = JSONObject().put("kind", "error").put("code", code).toString()
}
