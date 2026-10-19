import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;
import java.awt.Desktop;
import java.awt.Image;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import javax.imageio.ImageIO;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public class LughFilmServer {
  static final Path ROOT=Paths.get("").toAbsolutePath().normalize(), DOWNLOADS=downloadRoot();
  static final Path LAST_DOWNLOAD_LOG=DOWNLOADS.resolve("last-download.log");
  static final Object YT_DLP_LOCK=new Object();
  static final Map<String,DownloadState> DOWNLOAD_STATES=new ConcurrentHashMap<>();

  static Path downloadRoot(){return Paths.get(System.getProperty("java.io.tmpdir"),"LughFilm","downloads");}

  public static void main(String[] args)throws Exception{
    int port=Integer.getInteger("lughfilm.port",8765);
    URI home=URI.create("http://127.0.0.1:"+port);
    HttpServer server;
    try{server=HttpServer.create(new InetSocketAddress("127.0.0.1",port),0);}
    catch(BindException used){open(home);return;}
    server.createContext("/api/download",LughFilmServer::download);
    server.createContext("/api/download-info",LughFilmServer::downloadInfo);
    server.createContext("/api/download-progress",LughFilmServer::downloadProgress);
    server.createContext("/api/downloader-update",LughFilmServer::updateDownloader);
    server.createContext("/",LughFilmServer::file);
    server.setExecutor(Executors.newCachedThreadPool());
    server.start();
    installTray(home,server);
    open(home);
  }

  static void open(URI home){try{if(Desktop.isDesktopSupported())Desktop.getDesktop().browse(home);}catch(Exception ignored){}}

  static void installTray(URI home,HttpServer server){
    if(!SystemTray.isSupported())return;
    try(InputStream in=LughFilmServer.class.getResourceAsStream("/lughfilm-icon.png")){
      Image image=ImageIO.read(in);
      PopupMenu menu=new PopupMenu();
      MenuItem show=new MenuItem("Open LughFilm"),exit=new MenuItem("Exit LughFilm");
      TrayIcon tray=new TrayIcon(image,"LughFilm Video Tool",menu);
      tray.setImageAutoSize(true);
      show.addActionListener(e->open(home));
      tray.addActionListener(e->open(home));
      exit.addActionListener(e->{server.stop(0);SystemTray.getSystemTray().remove(tray);System.exit(0);});
      menu.add(show);menu.addSeparator();menu.add(exit);
      SystemTray.getSystemTray().add(tray);
    }catch(Exception ignored){}
  }

  static void file(HttpExchange exchange)throws IOException{
    String path=exchange.getRequestURI().getPath();
    if(path.equals("/"))path="/lughfilm.html";
    if(path.equals("/lughfilm.html")){
      try(InputStream in=LughFilmServer.class.getResourceAsStream("/lughfilm.html")){
        if(in!=null){
          byte[] data=in.readAllBytes();
          exchange.getResponseHeaders().set("Content-Type","text/html; charset=utf-8");
          exchange.getResponseHeaders().set("Cache-Control","no-store");
          exchange.sendResponseHeaders(200,data.length);
          try(var out=exchange.getResponseBody()){out.write(data);}
          return;
        }
      }
    }
    Path target=ROOT.resolve(path.substring(1)).normalize();
    if(!target.startsWith(ROOT)||!Files.isRegularFile(target)){reply(exchange,404,"Not found","text/plain");return;}
    String type=Files.probeContentType(target);
    exchange.getResponseHeaders().set("Content-Type",type==null?"application/octet-stream":type);
    exchange.sendResponseHeaders(200,Files.size(target));
    try(var out=exchange.getResponseBody()){Files.copy(target,out);}
  }

  static void download(HttpExchange exchange)throws IOException{
    Path dir=null;
    DownloadState state=null;
    try{
      if(!exchange.getRequestMethod().equals("POST"))throw new IllegalArgumentException("POST required.");
      String body=new String(exchange.getRequestBody().readNBytes(16384),StandardCharsets.UTF_8);
      String url=jsonValue(body,"url",true),jobId=jsonValue(body,"jobId",false),requestedName=jsonValue(body,"filename",false);
      boolean review="review".equals(jsonValue(body,"mode",false));
      boolean compress=!review&&"true".equals(jsonValue(body,"compress",false));
      URI uri=URI.create(url);
      if(uri.getHost()==null||!("http".equals(uri.getScheme())||"https".equals(uri.getScheme())))throw new IllegalArgumentException("Enter a valid http or https video URL.");
      if(!jobId.matches("[A-Za-z0-9-]{1,80}"))jobId=UUID.randomUUID().toString();
      cleanupDownloadStates();
      state=new DownloadState();
      DOWNLOAD_STATES.put(jobId,state);
      state.set("Checking downloader",0,"",false,false);

      String app=ytDlp();
      if(app==null)throw new IllegalStateException("yt-dlp is not installed or could not be found.");
      Files.createDirectories(DOWNLOADS);
      dir=Files.createTempDirectory(DOWNLOADS,"lughfilm-");
      String output=dir.resolve("%(title).180B-[%(id)s].%(ext)s").toString(),ffmpeg=ffmpeg();
      var command=new ArrayList<String>(List.of(
        app,"--no-playlist","--restrict-filenames","--newline","--no-color",
        "--retries","5","--fragment-retries","5","--retry-sleep","fragment:exp=1:10",
        "--socket-timeout","30",
        "--progress-template","download:LUGH_PROGRESS|%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s"
      ));
      if(review)command.addAll(List.of("--max-filesize","4294967296"));
      Path deno=Paths.get(app).toAbsolutePath().getParent().resolve("deno.exe");
      if(Files.isRegularFile(deno))command.addAll(List.of("--js-runtimes","deno:"+deno));
      if(ffmpeg!=null){
        command.addAll(List.of(
          "--ffmpeg-location",ffmpeg,
          "-f","bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
          "--merge-output-format","mp4","--recode-video","mp4"
        ));
      }else command.addAll(List.of("-f","b[ext=mp4]/b"));
      command.addAll(List.of("--print","after_move:filepath","-o",output,url));

      DownloadState current=state;
      state.set("Waiting for downloader",0,"",false,false);
      RunResult result=run(command,DOWNLOADS,line->updateDownloadProgress(current,line),()->current.set("Starting download",0,"",false,false));
      String log=result.log;
      if(result.exitCode!=0){writeFailureLog(log);throw new IllegalStateException(friendlyError(log));}

      Path video=null;
      for(String line:log.split("\\R")){
        try{Path candidate=Paths.get(line.trim());if(Files.isRegularFile(candidate))video=candidate;}
        catch(Exception ignored){}
      }
      if(video==null)try(var files=Files.list(dir)){video=files.filter(Files::isRegularFile).findFirst().orElse(null);}
      if(video==null){writeFailureLog(log);throw new IllegalStateException(friendlyError(log));}
      if(!video.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".mp4")){
        writeFailureLog(log);
        throw new IllegalStateException("This site did not provide a compatible MP4 and FFmpeg could not convert it. Details were saved to "+LAST_DOWNLOAD_LOG+".");
      }
      String sourceName=video.getFileName().toString();
      if(compress){
        if(ffmpeg==null)throw new IllegalStateException("Compression requires FFmpeg, but FFmpeg could not be found.");
        video=compressVideo(video,ffmpeg,state);
      }

      state.set("Preparing file",100,"",false,false);
      String name=sourceName;
      if(!review){
        Path downloads=localDownloadsRoot();
        Files.createDirectories(downloads);
        Path saved=availableDownloadTarget(downloads,safeMp4Name(requestedName,name));
        try{Files.move(video,saved);}
        catch(FileSystemException moveError){Files.copy(video,saved);Files.delete(video);}
        state.set("Complete",100,saved.toString(),true,false);
        reply(exchange,200,"{\"saved\":true,\"filename\":\""+escapeJson(saved.getFileName().toString())+"\",\"path\":\""+escapeJson(saved.toString())+"\"}","application/json; charset=utf-8");
        return;
      }
      exchange.getResponseHeaders().set("Content-Type","video/mp4");
      exchange.getResponseHeaders().set("X-LughFilm-Filename",name);
      exchange.getResponseHeaders().set("Cache-Control","no-store");
      exchange.sendResponseHeaders(200,Files.size(video));
      try(var out=exchange.getResponseBody()){Files.copy(video,out);}
      state.set("Complete",100,"",true,false);
    }catch(IllegalArgumentException|IllegalStateException error){
      if(state!=null)state.set("Download failed",state.percent,error.getMessage(),true,true);
      jsonError(exchange,400,error.getMessage());
    }catch(InterruptedException error){
      Thread.currentThread().interrupt();
      if(state!=null)state.set("Download interrupted",state.percent,"",true,true);
      jsonError(exchange,500,"Download was interrupted.");
    }catch(Exception error){
      if(state!=null)state.set("Download failed",state.percent,error.getMessage(),true,true);
      jsonError(exchange,500,"Download failed: "+error.getMessage());
    }finally{if(dir!=null)remove(dir);}
  }

  static void downloadProgress(HttpExchange exchange)throws IOException{
    if(!exchange.getRequestMethod().equals("GET")){jsonError(exchange,405,"GET required.");return;}
    String id=queryValue(exchange.getRequestURI().getRawQuery(),"id");
    DownloadState state=DOWNLOAD_STATES.get(id);
    if(state==null){jsonError(exchange,404,"Download progress is not available yet.");return;}
    exchange.getResponseHeaders().set("Cache-Control","no-store");
    reply(exchange,200,state.json(),"application/json; charset=utf-8");
  }

  static void downloadInfo(HttpExchange exchange)throws IOException{
    try{
      if(!exchange.getRequestMethod().equals("POST"))throw new IllegalArgumentException("POST required.");
      String body=new String(exchange.getRequestBody().readNBytes(16384),StandardCharsets.UTF_8);
      String url=jsonValue(body,"url",true);
      URI uri=URI.create(url);
      if(uri.getHost()==null||!("http".equals(uri.getScheme())||"https".equals(uri.getScheme())))throw new IllegalArgumentException("Enter a valid http or https video URL.");
      String app=ytDlp();
      if(app==null)throw new IllegalStateException("yt-dlp is not installed or could not be found.");
      Files.createDirectories(DOWNLOADS);
      var command=new ArrayList<String>(List.of(app,"--no-playlist","--simulate","--no-warnings","--no-color","--socket-timeout","20","-f","bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b"));
      Path deno=Paths.get(app).toAbsolutePath().getParent().resolve("deno.exe");
      if(Files.isRegularFile(deno))command.addAll(List.of("--js-runtimes","deno:"+deno));
      String ffmpeg=ffmpeg();
      if(ffmpeg!=null)command.addAll(List.of("--ffmpeg-location",ffmpeg));
      command.addAll(List.of("--print","LUGH_INFO|%(duration)s|%(filesize)s|%(filesize_approx)s|%(height)s",url));
      RunResult result=run(command,DOWNLOADS);
      if(result.exitCode!=0)throw new IllegalStateException(friendlyError(result.log));
      long duration=0,size=0,height=0;
      for(String line:result.log.split("\\R"))if(line.startsWith("LUGH_INFO|")){
        String[] fields=line.split("\\|",-1);
        duration=fields.length>1?parseLong(fields[1]):0;
        long exact=fields.length>2?parseLong(fields[2]):0,approx=fields.length>3?parseLong(fields[3]):0;
        size=exact>0?exact:approx;
        height=fields.length>4?parseLong(fields[4]):0;
      }
      if(size<=0)size=directContentLength(uri);
      long compressed=size>0?Math.max(1,Math.round(size*.60)):0;
      reply(exchange,200,"{\"estimatedBytes\":"+size+",\"compressedEstimatedBytes\":"+compressed+",\"durationSeconds\":"+duration+",\"height\":"+height+"}","application/json; charset=utf-8");
    }catch(IllegalArgumentException|IllegalStateException error){jsonError(exchange,400,error.getMessage());}
    catch(InterruptedException error){Thread.currentThread().interrupt();jsonError(exchange,500,"Size estimation was interrupted.");}
    catch(Exception error){jsonError(exchange,500,"Could not estimate this download: "+error.getMessage());}
  }

  static void updateDownloadProgress(DownloadState state,String line){
    if(line.startsWith("LUGH_PROGRESS|")){
      String[] fields=line.split("\\|",-1);
      int percent=fields.length>1?parsePercent(fields[1]):state.percent;
      String downloaded=fields.length>2?cleanProgressField(fields[2]):"";
      String total=fields.length>3?cleanProgressField(fields[3]):"";
      String speed=fields.length>4?cleanProgressField(fields[4]):"";
      String eta=fields.length>5?cleanProgressField(fields[5]):"";
      StringBuilder detail=new StringBuilder();
      if(!downloaded.isBlank())detail.append(downloaded);
      if(!total.isBlank())detail.append(" / ").append(total);
      if(!speed.isBlank())detail.append(" · ").append(speed);
      if(!eta.isBlank())detail.append(" · ETA ").append(eta);
      state.set("Downloading",percent,detail.toString(),false,false);
    }else if(line.contains("[Merger]")||line.contains("[VideoRemuxer]")||line.contains("[VideoConvertor]")){
      state.set("Converting to MP4",Math.max(99,state.percent),"",false,false);
    }else if(line.contains("[ExtractAudio]")||line.contains("[Fixup")){
      state.set("Processing media",Math.max(99,state.percent),"",false,false);
    }else if(line.contains("[download] Destination:")){
      state.set("Downloading",Math.max(1,state.percent),"",false,false);
    }
  }

  static int parsePercent(String value){
    try{return Math.max(0,Math.min(100,(int)Math.round(Double.parseDouble(value.replace("%","").trim()))));}
    catch(Exception ignored){return 0;}
  }

  static String cleanProgressField(String value){
    String cleaned=value.trim();
    return cleaned.equalsIgnoreCase("N/A")||cleaned.equalsIgnoreCase("Unknown")?"":cleaned;
  }

  static long parseLong(String value){try{return Math.max(0,Math.round(Double.parseDouble(value.trim())));}catch(Exception ignored){return 0;}}

  static long directContentLength(URI uri){
    String path=uri.getPath()==null?"":uri.getPath().toLowerCase(Locale.ROOT);
    if(!(path.endsWith(".mp4")||path.endsWith(".mov")||path.endsWith(".webm")||path.endsWith(".mkv")))return 0;
    try{
      HttpURLConnection connection=(HttpURLConnection)uri.toURL().openConnection();
      connection.setRequestMethod("HEAD");connection.setInstanceFollowRedirects(true);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
      long length=connection.getContentLengthLong();connection.disconnect();
      if(length>0)return length;
      connection=(HttpURLConnection)uri.toURL().openConnection();
      connection.setRequestMethod("GET");connection.setInstanceFollowRedirects(true);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
      length=connection.getContentLengthLong();connection.disconnect();return Math.max(0,length);
    }catch(Exception ignored){return 0;}
  }

  static Path compressVideo(Path source,String ffmpeg,DownloadState state)throws IOException,InterruptedException{
    Path compressed=source.getParent().resolve("compressed-"+UUID.randomUUID()+".mp4");
    state.set("Compressing MP4",99,"Re-encoding video and audio",false,false);
    RunResult result=run(List.of(ffmpeg,"-y","-i",source.toString(),"-map","0:v:0","-map","0:a?","-c:v","libx264","-preset","medium","-crf","28","-c:a","aac","-b:a","128k","-movflags","+faststart",compressed.toString()),source.getParent());
    if(result.exitCode!=0||!Files.isRegularFile(compressed)){writeFailureLog(result.log);throw new IllegalStateException("FFmpeg could not compress this video. Details were saved to "+LAST_DOWNLOAD_LOG+".");}
    if(Files.size(compressed)>=Files.size(source)){Files.deleteIfExists(compressed);state.set("Compression skipped",99,"The original was already smaller",false,false);return source;}
    Files.delete(source);
    state.set("Compression complete",99,"Smaller MP4 created",false,false);
    return compressed;
  }

  static Path localDownloadsRoot(){return Paths.get(System.getProperty("user.home"),"Downloads").toAbsolutePath().normalize();}

  static String safeMp4Name(String requested,String fallback){
    String name=requested==null||requested.isBlank()?fallback:requested.trim();
    name=name.replaceAll("[<>:\"/\\\\|?*\\p{Cntrl}]","_").replaceAll("[ .]+$","");
    if(name.toLowerCase(Locale.ROOT).endsWith(".mp4"))name=name.substring(0,name.length()-4);
    name=name.replaceAll("[ .]+$","");
    if(name.isBlank())name="lughfilm-video";
    if(name.matches("(?i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$"))name="_"+name;
    if(name.length()>176)name=name.substring(0,176).replaceAll("[ .]+$","");
    return name+".mp4";
  }

  static Path availableDownloadTarget(Path downloads,String name)throws IOException{
    Path root=downloads.toAbsolutePath().normalize(),target=root.resolve(name).normalize();
    if(!target.startsWith(root))throw new IOException("Invalid download filename.");
    if(!Files.exists(target))return target;
    String stem=name.substring(0,name.length()-4);
    for(int copy=1;copy<10000;copy++){
      target=root.resolve(stem+" ("+copy+").mp4").normalize();
      if(!Files.exists(target))return target;
    }
    throw new IOException("Could not choose an available filename in Downloads.");
  }

  static void writeFailureLog(String log){
    try{Files.createDirectories(DOWNLOADS);Files.writeString(LAST_DOWNLOAD_LOG,log,StandardCharsets.UTF_8);}
    catch(IOException ignored){}
  }

  static String friendlyError(String log){
    String lower=log.toLowerCase(Locale.ROOT),reason;
    if(lower.contains("drm"))reason="This video is DRM-protected and cannot be downloaded.";
    else if(lower.contains("sign in")||lower.contains("login required")||lower.contains("cookies"))reason="This video requires an authenticated account or browser cookies, which LughFilm does not import.";
    else if(lower.contains("private video"))reason="This video is private and the downloader is not authenticated to view it.";
    else if(lower.contains("age-restricted")||lower.contains("age restricted"))reason="This video is age-restricted and requires an authenticated account.";
    else if(lower.contains("geo")&&lower.contains("restrict"))reason="This video is not available in your region.";
    else if(lower.contains("unsupported url"))reason="This website or URL is not supported by the installed downloader.";
    else if(lower.contains("video unavailable")||lower.contains("not available"))reason="The source reports that this video is unavailable.";
    else if(lower.contains("http error 403")||lower.contains("forbidden"))reason="The website denied the media request (HTTP 403). The video may require sign-in or a fresh site extractor.";
    else if(lower.contains("requested format is not available"))reason="The site did not offer a compatible downloadable video format.";
    else if(lower.contains("larger than max-filesize")||lower.contains("max-filesize"))reason="This video is too large to open directly as a Review project. Use Download MP4 instead.";
    else{String message=last(log);reason=message.isBlank()?"yt-dlp could not download this video.":message;}
    return reason+" Details were saved to "+LAST_DOWNLOAD_LOG+".";
  }

  static void updateDownloader(HttpExchange exchange)throws IOException{
    try{
      if(!exchange.getRequestMethod().equals("POST"))throw new IllegalArgumentException("POST required.");
      String app=ytDlp();
      if(app==null)throw new IllegalStateException("yt-dlp is not installed or could not be found.");
      String before=version(app);
      RunResult result=run(List.of(app,"--update-to","stable"),Paths.get(app).toAbsolutePath().getParent());
      if(result.exitCode!=0)throw new IllegalStateException(last(result.log));
      String after=version(app),message=before.equals(after)?"yt-dlp is already up to date ("+after+").":"yt-dlp updated from "+before+" to "+after+".";
      jsonMessage(exchange,200,message);
    }catch(IllegalArgumentException|IllegalStateException error){jsonError(exchange,400,error.getMessage());}
    catch(InterruptedException error){Thread.currentThread().interrupt();jsonError(exchange,500,"The yt-dlp update was interrupted.");}
    catch(Exception error){jsonError(exchange,500,"Could not update yt-dlp: "+error.getMessage());}
  }

  static String version(String app)throws IOException,InterruptedException{
    RunResult result=run(List.of(app,"--version"),Paths.get(app).toAbsolutePath().getParent());
    if(result.exitCode!=0)throw new IllegalStateException("Could not read the yt-dlp version.");
    return last(result.log);
  }

  static RunResult run(List<String> command,Path directory)throws IOException,InterruptedException{return run(command,directory,null,null);}

  static RunResult run(List<String> command,Path directory,Consumer<String> onLine,Runnable onStart)throws IOException,InterruptedException{
    synchronized(YT_DLP_LOCK){
      if(onStart!=null)onStart.run();
      Process process=new ProcessBuilder(command).directory(directory.toFile()).redirectErrorStream(true).start();
      StringBuilder log=new StringBuilder();
      try(var reader=new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8))){
        String line;
        while((line=reader.readLine())!=null){log.append(line).append(System.lineSeparator());if(onLine!=null)onLine.accept(line);}
      }
      return new RunResult(process.waitFor(),log.toString());
    }
  }

  static final class RunResult{
    final int exitCode;final String log;
    RunResult(int exitCode,String log){this.exitCode=exitCode;this.log=log;}
  }

  static final class DownloadState{
    volatile String phase="Starting",detail="";
    volatile int percent=0;
    volatile boolean done=false,error=false;
    volatile long touched=System.currentTimeMillis();
    synchronized void set(String phase,int percent,String detail,boolean done,boolean error){
      this.phase=phase;this.percent=Math.max(0,Math.min(100,percent));this.detail=detail==null?"":detail;this.done=done;this.error=error;this.touched=System.currentTimeMillis();
    }
    String json(){return "{\"phase\":\""+escapeJson(phase)+"\",\"percent\":"+percent+",\"detail\":\""+escapeJson(detail)+"\",\"done\":"+done+",\"error\":"+error+"}";}
  }

  static void cleanupDownloadStates(){long cutoff=System.currentTimeMillis()-3600000;DOWNLOAD_STATES.entrySet().removeIf(entry->entry.getValue().touched<cutoff);}

  static String ytDlp(){
    String local=System.getenv("LOCALAPPDATA"),app=System.getProperty("jpackage.app-path","");
    Path appDir=app.isBlank()?ROOT:Paths.get(app).toAbsolutePath().getParent();
    var choices=List.of(appDir.resolve("app/yt-dlp.exe").toString(),ROOT.resolve("vendor/yt-dlp.exe").toString(),local+"/Microsoft/WinGet/Packages/yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe/yt-dlp.exe",local+"/Programs/Krunker Police Client/resources/yt-dlp/yt-dlp.exe","yt-dlp");
    for(String choice:choices)try{if(new ProcessBuilder(choice,"--version").redirectErrorStream(true).start().waitFor()==0)return choice;}catch(Exception ignored){}
    return null;
  }

  static String ffmpeg(){
    String app=System.getProperty("jpackage.app-path","");
    Path appDir=app.isBlank()?ROOT:Paths.get(app).toAbsolutePath().getParent();
    var choices=List.of(appDir.resolve("app/ffmpeg.exe").toString(),ROOT.resolve("vendor/ffmpeg.exe").toString(),"ffmpeg");
    for(String choice:choices)try{if(new ProcessBuilder(choice,"-version").redirectErrorStream(true).start().waitFor()==0)return choice;}catch(Exception ignored){}
    return null;
  }

  static String jsonValue(String json,String key,boolean required){
    int keyAt=json.indexOf("\""+key+"\"");
    if(keyAt<0){if(required)throw new IllegalArgumentException("Missing "+key+".");return "";}
    int colon=json.indexOf(':',keyAt),quote=colon<0?-1:json.indexOf('"',colon+1);
    if(quote<0){if(required)throw new IllegalArgumentException("Invalid "+key+".");return "";}
    StringBuilder value=new StringBuilder();
    for(int i=quote+1;i<json.length();i++){
      char c=json.charAt(i);
      if(c=='"')return value.toString();
      if(c!='\\'){value.append(c);continue;}
      if(++i>=json.length())break;
      char escaped=json.charAt(i);
      if(escaped=='u'&&i+4<json.length()){
        try{value.append((char)Integer.parseInt(json.substring(i+1,i+5),16));i+=4;}catch(NumberFormatException error){value.append('u');}
      }else value.append(switch(escaped){case 'n'->'\n';case 'r'->'\r';case 't'->'\t';case 'b'->'\b';case 'f'->'\f';default->escaped;});
    }
    if(required)throw new IllegalArgumentException("Invalid "+key+".");
    return "";
  }

  static String queryValue(String query,String key){
    if(query==null)return "";
    for(String pair:query.split("&",-1)){
      int equals=pair.indexOf('=');
      String name=equals<0?pair:pair.substring(0,equals);
      if(URLDecoder.decode(name,StandardCharsets.UTF_8).equals(key))return URLDecoder.decode(equals<0?"":pair.substring(equals+1),StandardCharsets.UTF_8);
    }
    return "";
  }

  static String last(String text){
    String[] lines=text.strip().split("\\R");
    for(int i=lines.length-1;i>=0;i--){String line=lines[i].strip();if(!line.isBlank()&&!line.startsWith("LUGH_PROGRESS|"))return line;}
    return "yt-dlp could not download this video.";
  }

  static String escapeJson(String value){return (value==null?"":value).replace("\\","\\\\").replace("\"","\\\"").replace("\r"," ").replace("\n"," ");}
  static void jsonError(HttpExchange exchange,int code,String message)throws IOException{reply(exchange,code,"{\"error\":\""+escapeJson(message==null?"Unknown error":message)+"\"}","application/json; charset=utf-8");}
  static void jsonMessage(HttpExchange exchange,int code,String message)throws IOException{reply(exchange,code,"{\"message\":\""+escapeJson(message)+"\"}","application/json; charset=utf-8");}
  static void reply(HttpExchange exchange,int code,String text,String type)throws IOException{byte[] data=text.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type",type);exchange.sendResponseHeaders(code,data.length);try(var out=exchange.getResponseBody()){out.write(data);}}
  static void remove(Path root){try(var paths=Files.walk(root)){paths.sorted(Comparator.reverseOrder()).forEach(path->{try{Files.deleteIfExists(path);}catch(IOException ignored){}});}catch(IOException ignored){}}
}
