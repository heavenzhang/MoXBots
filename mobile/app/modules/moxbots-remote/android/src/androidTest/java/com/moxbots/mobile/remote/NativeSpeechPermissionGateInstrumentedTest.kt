package com.moxbots.mobile.remote

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** No permissions or microphone: exercise the real deferred-start owner. */
@RunWith(AndroidJUnit4::class)
class NativeSpeechPermissionGateInstrumentedTest {
  @Test fun cancelledPermissionCallbackCannotStartOrCancelANewerAttempt() = onMain {
    val gate = NativeSpeechPermissionGate()
    val errors = mutableListOf<String>()
    var starts = 0
    val old = requireNotNull(gate.begin { errors += it })
    assertTrue(gate.cancel()) // stop can settle idle instead of calling engine.stop before capture.
    assertFalse(gate.cancel())
    val fresh = requireNotNull(gate.begin { errors += it })
    gate.resolve(old, true, { true }) { starts++ }
    gate.resolve(fresh, true, { true }) { starts++ }
    gate.resolve(fresh, true, { true }) { starts++ }
    assertEquals(listOf("MOBILE_SPEECH_CANCELLED"), errors)
    assertEquals(1, starts)
  }

  @Test fun backgroundOrChangedOwnerRefusesAnOtherwiseGrantedPermission() = onMain {
    val gate = NativeSpeechPermissionGate()
    val errors = mutableListOf<String>()
    var starts = 0
    val token = requireNotNull(gate.begin { errors += it })
    // Same predicate is checked by the module after the asynchronous OS reply.
    gate.resolve(token, true, { false }) { starts++ }
    gate.resolve(token, true, { true }) { starts++ }
    assertEquals(listOf("MOBILE_SPEECH_FOREGROUND_REQUIRED"), errors)
    assertEquals(0, starts)
  }

  @Test fun permissionDenialAndMissingPermissionOwnerSettleOnceWithoutStarting() = onMain {
    val gate = NativeSpeechPermissionGate()
    val errors = mutableListOf<String>()
    var starts = 0
    val denied = requireNotNull(gate.begin { errors += it })
    gate.resolve(denied, false, { true }) { starts++ }
    gate.resolve(denied, true, { true }) { starts++ }
    val missing = requireNotNull(gate.begin { errors += it })
    gate.reject(missing, "MOBILE_SPEECH_PERMISSION_REQUIRED")
    gate.resolve(missing, true, { true }) { starts++ }
    assertEquals(listOf("MOBILE_SPEECH_PERMISSION_DENIED", "MOBILE_SPEECH_PERMISSION_REQUIRED"), errors)
    assertEquals(0, starts)
  }

  @Test fun secondPendingStartDoesNotReplaceTheFirstPermissionRequest() = onMain {
    val gate = NativeSpeechPermissionGate()
    val errors = mutableListOf<String>()
    var starts = 0
    val token = requireNotNull(gate.begin { errors += it })
    assertNull(gate.begin { errors += it })
    gate.resolve(token, true, { true }) { starts++ }
    assertEquals(listOf("MOBILE_SPEECH_ALREADY_ACTIVE"), errors)
    assertEquals(1, starts)
  }

  private fun onMain(check: () -> Unit) = InstrumentationRegistry.getInstrumentation().runOnMainSync(check)
}
