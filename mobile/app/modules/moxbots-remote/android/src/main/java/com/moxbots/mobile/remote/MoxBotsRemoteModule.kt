package com.moxbots.mobile.remote

import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.interfaces.permissions.PermissionsResponseListener
import java.util.concurrent.Executors
import org.json.JSONObject

class MoxBotsRemoteModule : Module() {
  private val owner = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private var connection: NativeConnection? = null
  private var speech: NativeSpeech? = null
  override fun definition() = ModuleDefinition {
    Name("MoxBotsRemote")
    Events("snapshotChanged", "speechChanged")
    AsyncFunction("request") { input: String, promise: Promise ->
      val intent = try { if (input.toByteArray(Charsets.UTF_8).size <= 64 * 1024) JSONObject(input) else null } catch (_: Exception) { null }
      val kind = intent?.optString("kind")
      if (intent != null && kind != null && kind.startsWith("speech.")) {
        if (intent.length() != 2 || intent.optInt("version") != 1) {
          promise.resolve(failure("MOBILE_INTENT_INVALID"))
        } else main.post { handleSpeech(kind, promise) }
      } else owner.execute {
        try {
          if (connection == null) {
            val context = requireNotNull(appContext.reactContext) { "MOBILE_CONNECTION_UNAVAILABLE" }
            val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
            val origin = info.metaData?.getString("com.moxbots.mobile.SERVICE_ORIGIN") ?: "https://140.143.183.232"
            connection = NativeConnection(context, origin)
          }
          promise.resolve(connection!!.request(input))
        } catch (_: Exception) { promise.resolve(failure("MOBILE_CONNECTION_UNAVAILABLE")) }
      }
    }
    OnActivityEntersBackground {
      main.post { speech?.cancel() }
      owner.execute { try { connection?.request("{\"version\":1,\"kind\":\"connection.suspend\"}") } catch (_: Exception) { } }
    }
    OnDestroy {
      main.post { speech?.cancel(); speech = null }
      owner.execute { connection?.close(); connection = null }
      owner.shutdown()
    }
  }
  private fun handleSpeech(kind: String, promise: Promise) {
    val context = appContext.reactContext ?: run { promise.resolve(failure("MOBILE_SPEECH_SERVICE_UNAVAILABLE")); return }
    if (kind == "speech.start" && appContext.currentActivity?.hasWindowFocus() != true) {
      promise.resolve(failure("MOBILE_SPEECH_FOREGROUND_REQUIRED")); return
    }
    if (speech == null) speech = NativeSpeech(context) { event -> sendEvent("speechChanged", event.projection()) }
    val engine = speech ?: run { promise.resolve(failure("MOBILE_SPEECH_SERVICE_UNAVAILABLE")); return }
    val settle: (Result<Unit>) -> Unit = { result ->
      result.fold(
        onSuccess = { promise.resolve(JSONObject(engine.current.projection()).toString()) },
        onFailure = { error -> promise.resolve(failure((error as? SpeechFailure)?.code ?: "MOBILE_SPEECH_RECOGNITION_FAILED")) }
      )
    }
    when (kind) {
      "speech.start" -> {
        if (context.checkSelfPermission(NativeSpeech.RECORD_AUDIO_PERMISSION) == PackageManager.PERMISSION_GRANTED) engine.start(settle)
        else {
          val permissions = appContext.permissions
          if (permissions == null) promise.resolve(failure("MOBILE_SPEECH_PERMISSION_REQUIRED"))
          else permissions.askForPermissions(PermissionsResponseListener {
            main.post {
              if (appContext.currentActivity == null || appContext.currentActivity?.isFinishing == true) promise.resolve(failure("MOBILE_SPEECH_FOREGROUND_REQUIRED"))
              else if (context.checkSelfPermission(NativeSpeech.RECORD_AUDIO_PERMISSION) == PackageManager.PERMISSION_GRANTED) engine.start(settle)
              else promise.resolve(failure("MOBILE_SPEECH_PERMISSION_DENIED"))
            }
          }, NativeSpeech.RECORD_AUDIO_PERMISSION)
        }
      }
      "speech.stop" -> engine.stop(settle)
      "speech.cancel" -> { engine.cancel(); settle(Result.success(Unit)) }
      else -> promise.resolve(failure("MOBILE_INTENT_UNSUPPORTED"))
    }
  }
  private fun failure(code: String) = JSONObject().put("kind", "error").put("code", code).toString()
}
