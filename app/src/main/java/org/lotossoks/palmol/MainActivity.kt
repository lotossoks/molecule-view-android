package org.lotossoks.palmol

import android.os.Bundle
import android.net.Uri
import android.content.Intent
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.*
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.*
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.net.URL

class MainActivity : ComponentActivity() {
 private val io = Executors.newSingleThreadExecutor()
 private var viewer: WebView? = null
 private var status by mutableStateOf("Loading viewer…")
 private var ready by mutableStateOf(false)
 private var busy by mutableStateOf(false)
 private var frame by mutableIntStateOf(0)
 private var frames by mutableIntStateOf(0)
 private var selected by mutableIntStateOf(0)
 private var title by mutableStateOf("Palmol")
 private var panel by mutableStateOf("")
 private var history by mutableStateOf("")
 private var pending: String? = null
 private var exportBytes: ByteArray? = null
 private var requestSave: ((String) -> Unit)? = null
 private fun js(code: String) { if(ready) viewer?.evaluateJavascript("window.palmol && $code", null) else pending=code }
 private fun quoted(s: String)=JSONObject.quote(s)
 private fun cmd(s: String) {
  if(s.trim().startsWith("fetch ")) fetchPdb(s.trim().substringAfter(' ')) else js("palmol.command(${quoted(s)})")
 }
 private fun openFile(file: File, name: String) {
  val ext=name.substringAfterLast('.', "").lowercase()
  val format=when(ext) {"pdb","ent","pdbqt"->"pdb";"cif","mmcif","bcif"->"mmcif";"mol2","gro","sdf","mol","xyz"->ext;"sd"->"sdf";"palmol"->"session";else->throw IllegalArgumentException("Unsupported extension: $ext")}
  getSharedPreferences("recent",MODE_PRIVATE).edit().putString(file.name,name).apply()
  runOnUiThread { title=name;panel="";val url="https://appassets.androidplatform.net/documents/${file.name}";js(if(format=="session") "palmol.restore(${quoted(url)})" else "palmol.open(${quoted(url)},${quoted(format)},${ext=="bcif"})") }
 }
 private fun importUri(uri: Uri) {
  status="Reading…"
  io.execute {
   try {
    var name=uri.lastPathSegment ?: "structure.pdb"
    contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { if(it.moveToFirst())name=it.getString(0) }
    val file=File(filesDir,"documents/${System.nanoTime()}")
    file.parentFile!!.mkdirs()
    contentResolver.openInputStream(uri)!!.use { input -> file.outputStream().use { out ->
     val buffer=ByteArray(65536);var total=0L
     while(true) {val n=input.read(buffer);if(n<0)break;total+=n;require(total<=128L*1024*1024){"File limit: 128 MB"};out.write(buffer,0,n)}
    } }
    openFile(file,name)
   }catch(e:Exception){runOnUiThread{status="Error: ${e.message}"}}
  }
 }
 private fun fetchPdb(id: String) {
  val code=id.trim().lowercase()
  if(!code.matches(Regex("[a-z0-9_]{4,16}"))) {status="Invalid PDB ID";return}
  status="Downloading $code…";panel=""
  io.execute {
   try {
    val file=File(filesDir,"documents/$code.cif");file.parentFile!!.mkdirs()
    val connection=URL("https://files.rcsb.org/download/$code.cif").openConnection().apply {connectTimeout=20000;readTimeout=30000}
    connection.getInputStream().use {input->file.outputStream().use {output->input.copyTo(output)}}
    openFile(file,"$code.cif")
   }catch(e:Exception){runOnUiThread{status="Download failed: ${e.message}"}}
  }
 }
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  setContent { MaterialTheme(colorScheme=darkColorScheme()) {
   val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){it?.let(::importUri)}
   val saver=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")){uri->
    val bytes=exportBytes
    if(uri!=null && bytes!=null)io.execute {try{contentResolver.openOutputStream(uri)!!.use{it.write(bytes)};runOnUiThread{status="Saved"}}catch(e:Exception){runOnUiThread{status="Save failed: ${e.message}"}}}
   }
   requestSave={saver.launch(it)}
   Scaffold {padding-> Column(Modifier.fillMaxSize().padding(padding)) {
    Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.SpaceBetween) {
     Text(title,modifier=Modifier.weight(1f),maxLines=1,style=MaterialTheme.typography.titleLarge)
     TextButton(onClick={js("palmol.reset()")},enabled=ready){Text("⤢")}
     TextButton(onClick={panel="More"}){Text("•••")}
    }
    AndroidView(modifier=Modifier.weight(1f).fillMaxWidth(),factory={context->
     val loader=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(context))
      .addPathHandler("/documents/",WebViewAssetLoader.InternalStoragePathHandler(context,File(filesDir,"documents").apply{mkdirs()})).build()
     WebView(context).apply {
      viewer=this;settings.javaScriptEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false
      webViewClient=object:WebViewClient(){
       override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true
       override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?=loader.shouldInterceptRequest(request.url)
      }
      if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
       WebViewCompat.addWebMessageListener(this,"PalmolStatus",setOf("https://appassets.androidplatform.net")){_,message,_,main,_->
        if(main)runOnUiThread{try{
         val data=JSONObject(message.data ?: "{}")
         when(data.optString("type")){
          "ready"->{ready=true;pending?.let{js(it)};pending=null}
          "state"->{status=data.optString("message");busy=data.optBoolean("busy");frame=data.optInt("index");frames=data.optInt("count");selected=data.optInt("selected")}
          "session"->{exportBytes=data.getString("data").toByteArray();requestSave?.invoke("Palmol-session.palmol")}
          "image"->{exportBytes=Base64.decode(data.getString("data").substringAfter(','),Base64.DEFAULT);requestSave?.invoke("Palmol.png")}
          "history"->{history=data.getString("data");panel="Console"}
         }
        }catch(e:Exception){status="Viewer error: ${e.message}"}}
       }
       loadUrl("https://appassets.androidplatform.net/assets/viewer/index.html")
      }else status="Update Android System WebView"
     }
    })
    if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
    if(status.isNotBlank())Text(status,Modifier.padding(horizontal=12.dp),maxLines=3,style=MaterialTheme.typography.bodySmall)
    if(frames>1)Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceEvenly){
     TextButton(onClick={js("palmol.step(-1)")},enabled=!busy&&frame>0){Text("◀")}
     Text("${frame+1} / $frames",Modifier.padding(12.dp))
     TextButton(onClick={js("palmol.step(1)")},enabled=!busy&&frame<frames-1){Text("▶")}
    }
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceEvenly){
     listOf("Open","Style","Select","Console").forEach{label->TextButton(onClick={panel=label},enabled=ready&&!busy){Text(label)}}
    }
   } }
   if(panel.isNotEmpty()) {
    var input by remember(panel){mutableStateOf(if(panel=="Select")"chain A and resi 10-25" else "")}
    var radius by remember {mutableStateOf(5f)}
    var whole by remember {mutableStateOf(true)}
    var selectionOnly by remember {mutableStateOf(false)}
    AlertDialog(onDismissRequest={panel=""},title={Text(panel)},confirmButton={TextButton(onClick={panel=""}){Text("Close")}},text={
     Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)){
      when(panel){
       "Open"->{
        Button(onClick={picker.launch(arrayOf("*/*"))}){Text("Local file / session")}
        TextButton(onClick={val file=File(filesDir,"documents/demo.pdb");file.parentFile!!.mkdirs();assets.open("demo.pdb").use{input->file.outputStream().use{input.copyTo(it)}};openFile(file,"demo.pdb")}){Text("Demo: two states")}
        OutlinedTextField(input,{input=it},label={Text("PDB ID")},singleLine=true)
        Button(onClick={fetchPdb(input)}){Text("Download PDB")}
        Text("PDB · CIF · BCIF · MOL2 · GRO · SDF · MOL · XYZ")
        Text("Recent files (offline)")
        getSharedPreferences("recent",MODE_PRIVATE).all.entries.toList().takeLast(8).forEach { entry ->
         TextButton(onClick={try {openFile(File(filesDir,"documents/${entry.key}"),entry.value.toString())}catch(e:Exception){status=e.message ?: "Error"}}){Text(entry.value.toString(),maxLines=1)}
        }
       }
       "Style"->{
        Row{Checkbox(selectionOnly,{selectionOnly=it});Text("Selected atoms only")}
        listOf("cartoon","sticks","ball-and-stick","spheres","surface","lines").forEach{style->
         TextButton(onClick={js("palmol.style(${quoted(style)},$selectionOnly)");panel=""}){Text(style)}
        }
        Row{listOf("element","chain").forEach{color->TextButton(onClick={cmd("color $color, ${if(selectionOnly)"selection" else "all"}")}){Text(color)}}}
       }
       "Select"->{
        Text("$selected atoms selected · tap the structure to select")
        TextButton(onClick={js("palmol.clearSelection()")}){Text("Clear selection")}
        Row{listOf("atom","residue","chain").forEach{g->TextButton(onClick={js("palmol.granularity(${quoted(g)})")}){Text(g)}}}
        OutlinedTextField(input,{input=it},label={Text("PyMOL selection")})
        Button(onClick={js("palmol.select(${quoted(input)})")}){Text("Select")}
        Text("Neighborhood: ${"%.1f".format(radius)} Å")
        Slider(radius,{radius=it},valueRange=1f..15f)
        Row{Checkbox(whole,{whole=it});Text("Whole residues")}
        Button(onClick={js("palmol.neighborhood($radius,$whole)");panel=""}){Text("Show neighborhood")}
        Row{
         TextButton(onClick={cmd("zoom sele");panel=""}){Text("Focus")}
         TextButton(onClick={js("palmol.isolate()");panel=""}){Text("Isolate")}
        }
       }
       "Console"->{
        Text("select site, chain A and resi 10-25\nshow sticks, site\ncolor yellow, site\nzoom site\nframe 2\ndistance d1, id 1, id 2",style=MaterialTheme.typography.bodySmall)
        OutlinedTextField(input,{input=it},label={Text("Command")})
        Button(onClick={cmd(input);history+=(if(history.isEmpty())"" else "\n")+input;input=""}){Text("Run")}
        TextButton(onClick={exportBytes=history.toByteArray();requestSave?.invoke("Palmol-commands.pml")}){Text("Save command history")}
        Text(history,style=MaterialTheme.typography.bodySmall)
       }
       "More"->{
        TextButton(onClick={js("palmol.export()");panel=""}){Text("Save session")}
        TextButton(onClick={js("palmol.screenshot()");panel=""}){Text("Export PNG")}
        TextButton(onClick={js("palmol.history()")}){Text("Command history")}
        TextButton(onClick={exportBytes=assets.open("third-party-notices.txt").use{it.readBytes()};requestSave?.invoke("Palmol-third-party-notices.txt")}){Text("Third-party licenses")}
        Text("Palmol 0.1 · Mol* 4.18.0\nOffline local rendering. Android 12+.\nMD/XTC and SFTP/ProxyJump are planned for a later release.")
       }
      }
     }
    })
   }
  } }
  intent?.data?.let(::importUri)
 }
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);intent.data?.let(::importUri)}
 override fun onDestroy(){ready=false;viewer?.destroy();viewer=null;io.shutdownNow();super.onDestroy()}
}
