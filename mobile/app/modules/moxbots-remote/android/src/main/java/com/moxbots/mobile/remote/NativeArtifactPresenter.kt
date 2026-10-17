package com.moxbots.mobile.remote

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider

internal object NativeArtifactPresenter {
  fun present(activity: Activity, authority: String, resolver: android.content.ContentResolver,
    artifact: ReadyArtifactFile, share: Boolean) {
    val uri: Uri = FileProvider.getUriForFile(activity, authority, artifact.file)
    val action = if (share) Intent.ACTION_SEND else Intent.ACTION_VIEW
    val intent = Intent(action).apply {
      if (share) {
        type = artifact.mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
      } else setDataAndType(uri, artifact.mimeType)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      clipData = ClipData.newUri(resolver, artifact.name, uri)
    }
    activity.startActivity(Intent.createChooser(intent, artifact.name))
  }
}
