package com.moxbots.mobile.remote

/** Main-thread owner of a single pending microphone permission request. */
internal class NativeSpeechPermissionGate {
  private data class Attempt(val token: Long, val failure: (String) -> Unit)
  private var serial = 0L
  private var pending: Attempt? = null

  fun begin(failure: (String) -> Unit): Long? {
    if (pending != null) {
      failure("MOBILE_SPEECH_ALREADY_ACTIVE")
      return null
    }
    val token = ++serial
    pending = Attempt(token, failure)
    return token
  }

  fun resolve(token: Long, permitted: Boolean, allowed: () -> Boolean, start: () -> Unit) {
    val attempt = pending?.takeIf { it.token == token } ?: return
    pending = null
    when {
      !allowed() -> attempt.failure("MOBILE_SPEECH_FOREGROUND_REQUIRED")
      !permitted -> attempt.failure("MOBILE_SPEECH_PERMISSION_DENIED")
      else -> start()
    }
  }

  fun reject(token: Long, code: String) {
    val attempt = pending?.takeIf { it.token == token } ?: return
    pending = null
    attempt.failure(code)
  }

  fun cancel(): Boolean {
    val attempt = pending ?: return false
    pending = null
    attempt.failure("MOBILE_SPEECH_CANCELLED")
    return true
  }
}
