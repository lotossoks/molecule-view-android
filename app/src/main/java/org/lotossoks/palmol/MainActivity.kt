package org.lotossoks.palmol

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
 private val io = Executors.newSingleThreadExecutor()
 private var viewer: WebView? = null
 private var status by mutableStateOf("Подготовка…")
 private var fileBytes: ByteArray? = null
 private fun command(js: String) { viewer?.evaluateJavascript("window.palmol && $js", null) }
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  setContent {
   MaterialTheme {
    var pdb by remember { mutableStateOf("1CRN") }
    var format by remember { mutableStateOf("pdb") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
     if (uri != null) {
      status = "Чтение файла…"
      val chosenFormat = format
      io.execute {
       try {
        val bytes = contentResolver.openInputStream(uri)!!.use { stream ->
         val output = java.io.ByteArrayOutputStream()
         val buffer = ByteArray(65536)
         while (true) {
          val n = stream.read(buffer)
          if (n < 0) break
          require(output.size() + n <= 64 * 1024 * 1024) { "Лимит прототипа: 64 MB" }
          output.write(buffer, 0, n)
         }
         val data = output.toByteArray()
         require(data.size <= 64 * 1024 * 1024) { "Лимит прототипа: 64 MB" }
         data
        }
        fileBytes = bytes
        runOnUiThread { command("palmol.open('https://appassets.androidplatform.net/input/current', ${JSONObject.quote(chosenFormat)}, false)") }
       } catch(e: Exception) { runOnUiThread { status = "Ошибка: ${e.message}" } }
      }
     }
    }
    Scaffold { padding ->
     Column(Modifier.fillMaxSize().padding(padding)) {
      Text("Palmol · молекула в ладони", style = MaterialTheme.typography.titleLarge)
      Row {
       OutlinedTextField(pdb, { pdb = it }, label = { Text("PDB ID") }, modifier = Modifier.weight(1f), singleLine = true)
       Button(onClick = {
        val id = pdb.trim().lowercase()
        if (id.matches(Regex("[a-z0-9_]{4,16}"))) command("palmol.open('https://files.rcsb.org/download/$id.cif', 'mmcif')")
        else status = "Некорректный PDB ID"
       }) { Text("Загрузить") }
      }
      Row {
       var expanded by remember { mutableStateOf(false) }
       Box {
        TextButton(onClick = { expanded = true }) { Text(format.uppercase()) }
        DropdownMenu(expanded, { expanded = false }) {
         listOf("pdb", "mmcif", "mol2", "gro", "sdf", "mol", "xyz").forEach { f ->
          DropdownMenuItem(text = { Text(f.uppercase()) }, onClick = { format = f; expanded = false })
         }
        }
       }
       Button(onClick = { picker.launch(arrayOf("*/*")) }) { Text("Открыть файл") }
       TextButton(onClick = { command("palmol.reset()") }) { Text("Весь вид") }
      }
      AndroidView(modifier = Modifier.weight(1f).fillMaxWidth(), factory = { context ->
       val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context)).build()
       WebView(context).apply {
        viewer = this
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        webViewClient = object : WebViewClient() {
         override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
         override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
          if (request.url.toString() == "https://appassets.androidplatform.net/input/current")
           return WebResourceResponse("application/octet-stream", null, ByteArrayInputStream(fileBytes ?: byteArrayOf()))
          return loader.shouldInterceptRequest(request.url)
         }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
         WebViewCompat.addWebMessageListener(this, "PalmolStatus", setOf("https://appassets.androidplatform.net")) { _, message, _, main, _ ->
          if(main) runOnUiThread { status = message.data ?: "" }
         }
         loadUrl("https://appassets.androidplatform.net/assets/viewer/index.html")
        } else status = "Обновите Android System WebView"
       }
      })
      Text(status)
      Row {
       Button(onClick = { command("palmol.step(-1)") }) { Text("← Состояние") }
       Button(onClick = { command("palmol.step(1)") }) { Text("Состояние →") }
      }
     }
    }
   }
  }
 }
 override fun onDestroy() { viewer?.destroy(); viewer = null; io.shutdownNow(); super.onDestroy() }
}
