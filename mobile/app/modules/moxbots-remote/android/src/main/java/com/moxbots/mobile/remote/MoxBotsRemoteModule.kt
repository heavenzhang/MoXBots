package com.moxbots.mobile.remote

import android.content.pm.PackageManager
import android.app.Activity
import android.content.Intent
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
  @Volatile private var ownerActive = true
  private var speech: NativeSpeech? = null
  private data class Picker(val scope: String, val image: Boolean, val promise: Promise)
  private var picker: Picker? = null // main-thread owned
  private val pickerCode = 0x4d58
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
      } else if (intent != null && kind != null && kind.startsWith("attachment.")) {
        handleAttachmentIntent(intent, promise)
      } else owner.execute {
        try {
          promise.resolve(ensureConnection().request(input))
        } catch (_: Exception) { promise.resolve(failure("MOBILE_CONNECTION_UNAVAILABLE")) }
      }
    }
    OnActivityResult { _, result ->
      if (result.requestCode == pickerCode) {
        val pending = picker
        picker = null
        if (pending != null) {
          val uri = result.data?.data
          if (result.resultCode != Activity.RESULT_OK || uri == null) {
            pending.promise.resolve(failure("MOBILE_ATTACHMENT_CANCELLED"))
          } else if (!ownerActive || owner.isShutdown) pending.promise.resolve(failure("MOBILE_ATTACHMENT_CANCELLED"))
          else owner.execute {
            try {
              check(accountScope() == pending.scope) { "MOBILE_ACCOUNT_CHANGED" }
              val context = requireNotNull(appContext.reactContext)
              val files = NativeAttachments(context, pending.scope)
              val picked = files.importPicked(uri, pending.image)
              if (accountScope() != pending.scope) {
                files.remove(picked.getString("localId"))
                error("MOBILE_ACCOUNT_CHANGED")
              }
              pending.promise.resolve(picked.toString())
            } catch (error: Exception) { pending.promise.resolve(failure(attachmentError(error))) }
          }
        }
      }
    }
    OnActivityEntersBackground {
      main.post { speech?.cancel() }
      owner.execute { try { connection?.request("{\"version\":1,\"kind\":\"connection.suspend\"}") } catch (_: Exception) { } }
    }
    OnDestroy {
      ownerActive = false
      main.post {
        speech?.cancel(); speech = null
        picker?.promise?.resolve(failure("MOBILE_ATTACHMENT_CANCELLED")); picker = null
      }
      owner.execute { connection?.close(); connection = null }
      owner.shutdown()
    }
  }
  private fun ensureConnection(): NativeConnection {
    check(ownerActive) { "MOBILE_CONNECTION_UNAVAILABLE" }
    if (connection == null) {
      val context = requireNotNull(appContext.reactContext)
      val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      val origin = info.metaData?.getString("com.moxbots.mobile.SERVICE_ORIGIN") ?: "https://140.143.183.232"
      connection = NativeConnection(context, origin)
    }
    return requireNotNull(connection)
  }
  /** Scope comes from the authenticated native account, never caller JSON. */
  private fun accountScope(): String {
    val account = JSONObject(ensureConnection().request("{\"version\":1,\"kind\":\"account.status\"}"))
    check(account.optString("kind") == "account" && account.optString("state") == "signed-in") { "MOBILE_AUTHORIZATION_REQUIRED" }
    val principal = account.getString("principalId")
    check(principal.isNotBlank() && principal.length <= 256) { "MOBILE_AUTHORIZATION_REQUIRED" }
    val context = requireNotNull(appContext.reactContext)
    val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
    return (info.metaData?.getString("com.moxbots.mobile.SERVICE_ORIGIN") ?: "https://140.143.183.232") + "\u0000" + principal
  }
  private fun handleAttachmentIntent(intent: JSONObject, promise: Promise) {
    val kind = intent.optString("kind")
    val valid = intent.optInt("version") == 1 && when (kind) {
      "attachment.pick" -> intent.length() == 3 && intent.optString("source") in setOf("file", "image")
      "attachment.list" -> intent.length() == 2
      "attachment.remove" -> intent.length() == 3 && intent.optString("localId").length == 36
      else -> false
    }
    if (!valid) { promise.resolve(failure("MOBILE_INTENT_INVALID")); return }
    owner.execute {
      try {
        val scope = accountScope()
        val context = requireNotNull(appContext.reactContext)
        when (kind) {
          "attachment.list" -> promise.resolve(NativeAttachments(context, scope).list().toString())
          "attachment.remove" -> promise.resolve(NativeAttachments(context, scope).remove(intent.getString("localId")).toString())
          else -> main.post {
            val activity = appContext.currentActivity
            if (activity == null || activity.isFinishing || !activity.hasWindowFocus()) {
              promise.resolve(failure("MOBILE_ATTACHMENT_FOREGROUND_REQUIRED"))
            } else if (picker != null) promise.resolve(failure("MOBILE_ATTACHMENT_PICKER_BUSY"))
            else {
              val image = intent.getString("source") == "image"
              picker = Picker(scope, image, promise)
              try {
                @Suppress("DEPRECATION")
                activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                  addCategory(Intent.CATEGORY_OPENABLE)
                  type = if (image) "image/*" else "*/*"
                  putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
                  addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }, pickerCode)
              } catch (_: Exception) {
                picker = null; promise.resolve(failure("MOBILE_ATTACHMENT_PICKER_UNAVAILABLE"))
              }
            }
          }
        }
      } catch (error: Exception) { promise.resolve(failure(attachmentError(error))) }
    }
  }
  private fun attachmentError(error: Exception): String = error.message
    ?.takeIf { it.matches(Regex("MOBILE_[A-Z0-9_]{1,110}")) } ?: "MOBILE_ATTACHMENT_UNAVAILABLE"
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
