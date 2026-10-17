package com.moxbots.mobile.remote

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Read-only local speech readiness probe; never starts listening or requests permissions. */
@RunWith(AndroidJUnit4::class)
class NativeSpeechReadinessInstrumentedTest {
  private val context = ApplicationProvider.getApplicationContext<Context>()

  @Test fun reportsOnDeviceChineseReadinessAndPermissionDeniedStartWithoutRecording() {
    val sdk = Build.VERSION.SDK_INT
    val onDeviceAvailable = if (sdk >= Build.VERSION_CODES.S) {
      SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    } else {
      null
    }
    val micPermission = if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      "GRANTED"
    } else {
      "DENIED"
    }

    val support = if (sdk >= 33 && onDeviceAvailable == true) queryChineseSupport() else SupportResult(
      status = if (sdk < 33) "unknown" else "unavailable",
      detail = if (sdk < 33) "API_BELOW_33" else "ON_DEVICE_RECOGNIZER_UNAVAILABLE",
    )
    val installedChinese = support.installed.any(::isChineseLocale)
    val pendingChinese = support.pending.any(::isChineseLocale)
    val supportedChinese = support.supported.any(::isChineseLocale)
    val readiness = when {
      sdk < 31 -> "unknown"
      onDeviceAvailable != true -> "unavailable"
      sdk < 33 -> "unknown"
      support.status != "ok" -> "unknown"
      installedChinese -> "ready"
      pendingChinese || supportedChinese -> "unavailable"
      else -> "unavailable"
    }

    val negativeStart = if (micPermission == "DENIED") verifyNativeSpeechPermissionDenial() else null
    val report = """{"device":"${Build.MODEL}","sdk":$sdk,"locale":"zh-CN","onDeviceRecognitionAvailable":$onDeviceAvailable,"recordAudioPermission":"$micPermission","supportStatus":"${support.status}","supportDetail":"${escape(support.detail)}","installedOnDeviceLanguages":${jsonArray(support.installed)},"pendingOnDeviceLanguages":${jsonArray(support.pending)},"supportedOnDeviceLanguages":${jsonArray(support.supported)},"readiness":"$readiness","negativeStart":${negativeStart?.toString() ?: "null"},"modelDownloadTriggered":false}"""
    Log.i(TAG, report)
    println("MOXBOTS_SPEECH_READINESS $report")

    if (micPermission == "DENIED") assertEquals("permission_denied_closed", negativeStart?.getString("status"))
  }

  private fun queryChineseSupport(): SupportResult {
    val callbackResult = AtomicReference<SupportResult>()
    val latch = CountDownLatch(1)
    var recognizer: SpeechRecognizer? = null
    try {
      InstrumentationRegistry.getInstrumentation().runOnMainSync {
        recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "zh-CN")
          putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        if (Build.VERSION.SDK_INT >= 33) {
          recognizer!!.checkRecognitionSupport(intent, context.mainExecutor, object : RecognitionSupportCallback {
            override fun onSupportResult(result: RecognitionSupport) {
              callbackResult.set(SupportResult(
                status = "ok",
                detail = "callback_success",
                installed = result.installedOnDeviceLanguages,
                pending = result.pendingOnDeviceLanguages,
                supported = result.supportedOnDeviceLanguages,
              ))
              latch.countDown()
            }

            override fun onError(error: Int) {
              callbackResult.set(SupportResult(status = "error", detail = "recognition_support_error_$error"))
              latch.countDown()
            }
          })
        }
      }
      if (!latch.await(SUPPORT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
        return SupportResult(status = "unknown", detail = "callback_timeout_${SUPPORT_TIMEOUT_SECONDS}s")
      }
      return callbackResult.get() ?: SupportResult(status = "unknown", detail = "callback_missing_result")
    } catch (error: Exception) {
      return SupportResult(status = "unknown", detail = "${error.javaClass.simpleName}:${error.message ?: "no_message"}")
    } finally {
      InstrumentationRegistry.getInstrumentation().runOnMainSync { recognizer?.destroy() }
    }
  }

  private fun verifyNativeSpeechPermissionDenial(): org.json.JSONObject {
    val events = mutableListOf<SpeechEvent>()
    val speech = AtomicReference<NativeSpeech>()
    val callbackCount = AtomicInteger()
    val callbackCode = AtomicReference<String>()
    InstrumentationRegistry.getInstrumentation().runOnMainSync {
      speech.set(NativeSpeech(context, "zh-CN") { events += it })
      assertEquals("idle", speech.get().current.state)
      speech.get().start { result ->
        callbackCount.incrementAndGet()
        assertTrue("NativeSpeech.start must fail without RECORD_AUDIO", result.isFailure)
        callbackCode.set((result.exceptionOrNull() as? SpeechFailure)?.code)
        assertEquals("MOBILE_SPEECH_PERMISSION_REQUIRED", callbackCode.get())
      }
      assertEquals("idle", speech.get().current.state)
    }
    val recordingEventObserved = events.any { it.state == "recording" }
    val transcriptEventObserved = events.any { it.text.isNotEmpty() || it.final }
    assertEquals("start completion must fire exactly once", 1, callbackCount.get())
    assertTrue("permission denial must not emit recording, partial or final transcript events", events.none {
      it.state == "recording" || it.text.isNotEmpty() || it.final
    })
    assertEquals("idle", speech.get().current.state)
    assertFalse("permission denial must not enter recording", recordingEventObserved)
    assertFalse("permission denial must not emit a transcript", transcriptEventObserved)
    return org.json.JSONObject()
      .put("status", "permission_denied_closed")
      .put("errorCode", callbackCode.get())
      .put("startCallbackCount", callbackCount.get())
      .put("stateAfterStart", speech.get().current.state)
      .put("emittedEventCount", events.size)
      .put("recordingEventObserved", recordingEventObserved)
      .put("transcriptEventObserved", transcriptEventObserved)
  }

  private fun isChineseLocale(value: String): Boolean = value.equals("zh-CN", ignoreCase = true) ||
    value.equals("zh-Hans-CN", ignoreCase = true) || value.equals("cmn-Hans-CN", ignoreCase = true) ||
    value.equals("zh", ignoreCase = true)

  private fun jsonArray(values: List<String>): String = JSONArray(values).toString()

  private fun escape(value: String): String = value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")

  private data class SupportResult(
    val status: String,
    val detail: String,
    val installed: List<String> = emptyList(),
    val pending: List<String> = emptyList(),
    val supported: List<String> = emptyList(),
  )

  companion object {
    private const val TAG = "MoxSpeechReady"
    private const val SUPPORT_TIMEOUT_SECONDS = 8L
  }
}
