package io.github.iron026.oficio;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Salva arquivos (backup, extrato CSV/PDF) com o Storage Access Framework (janela "Salvar como" do Android).
 *
 * O usuário escolhe o local (Documentos, Downloads, Drive...). Não exige nenhuma
 * permissão de armazenamento: o app só recebe acesso ao documento escolhido.
 * Substitui a gravação por caminho direto em Documents/, que falha (EACCES)
 * quando a pasta/arquivo foi criado por uma instalação anterior do app.
 *
 * Estabilização da 0.5.0: o conteúdo não fica nos parâmetros da chamada enquanto a janela está aberta. O Capacitor
 * guarda esses parâmetros no estado salvo da atividade (duas vezes) quando ela para; um backup de ~1 ano (≈ 1,9 MB)
 * passava do limite do Android (~1 MB) e o app era encerrado com a janela aberta, perdendo a exportação. Agora o
 * conteúdo vai para um arquivo privado em cache/exportacao-pendente (fora do FileProvider) e a chamada guarda só o
 * caminho; se o Android recriar a atividade, a gravação ainda acontece a partir desse arquivo.
 */
@CapacitorPlugin(name = "OficioFiles")
public class BackupFilePlugin extends Plugin {

    @PluginMethod
    public void saveDocument(PluginCall call) {
        String filename = call.getString("filename");
        String content = call.getString("content");
        String mimeType = call.getString("mimeType", "application/json");
        String encoding = call.getString("encoding", "utf8");
        if (filename == null || filename.isEmpty() || content == null || !("utf8".equals(encoding) || "base64".equals(encoding))) {
            call.reject("Parâmetros inválidos para salvar o arquivo.", "INVALID_INPUT");
            return;
        }
        byte[] bytes;
        if ("base64".equals(encoding)) {
            try {
                bytes = Base64.decode(content, Base64.DEFAULT); // valida antes de abrir a janela
            } catch (IllegalArgumentException e) {
                call.reject("Arquivo inválido para salvar.", "INVALID_INPUT", e);
                return;
            }
        } else {
            bytes = content.getBytes(StandardCharsets.UTF_8);
        }
        File pending;
        try {
            pending = writePending(bytes);
        } catch (IOException e) {
            call.reject("Não foi possível preparar o arquivo para salvar.", "WRITE_FAILED", e);
            return;
        }
        // Só o caminho fica na chamada (e, portanto, no estado salvo da atividade).
        call.getData().remove("content");
        call.getData().put(PENDING_KEY, pending.getAbsolutePath());
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(call, intent, "onDocumentCreated");
        } catch (Exception e) {
            deletePending(pending);
            call.reject("Este aparelho não oferece a janela de salvar arquivos.", "UNAVAILABLE", e);
        }
    }

    @ActivityCallback
    private void onDocumentCreated(PluginCall call, ActivityResult result) {
        if (call == null) {
            // Processo recriado sem a chamada restaurada: ainda grava o conteúdo preparado (não deixa documento vazio).
            completeWithoutCall(result);
            return;
        }
        File pending = pendingFileOf(call);
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            deletePending(pending);
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        byte[] bytes;
        try {
            if (pending == null) throw new FileNotFoundException("Arquivo preparado não encontrado.");
            bytes = readAll(pending);
        } catch (IOException e) {
            // Sem o conteúdo preparado não há o que gravar: não deixa um documento vazio no local escolhido.
            deleteQuietly(resolver, uri);
            call.reject("Não foi possível gravar o arquivo no local escolhido.", "WRITE_FAILED", e);
            return;
        }
        try {
            write(resolver, uri, bytes);
        } catch (SecurityException e) {
            deleteQuietly(resolver, uri);
            deletePending(pending);
            call.reject("O local escolhido não permitiu gravar o arquivo.", "PERMISSION_DENIED", e);
            return;
        } catch (Exception e) {
            deleteQuietly(resolver, uri);
            deletePending(pending);
            call.reject("Não foi possível gravar o arquivo no local escolhido.", "WRITE_FAILED", e);
            return;
        }
        deletePending(pending);
        JSObject ret = new JSObject();
        ret.put("cancelled", false);
        ret.put("uri", uri.toString());
        ret.put("name", displayName(resolver, uri));
        ret.put("bytes", bytes.length);
        call.resolve(ret);
    }

    private static final String PENDING_KEY = "pendingFile";
    private static final String PENDING_DIR = "exportacao-pendente";

    private File pendingDir() {
        return new File(getContext().getCacheDir(), PENDING_DIR);
    }

    /** Grava o conteúdo num arquivo privado; apaga sobras de exportações anteriores (só há uma janela por vez). */
    private File writePending(byte[] bytes) throws IOException {
        File dir = pendingDir();
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Pasta temporária indisponível.");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) deletePending(f);
        File file = new File(dir, UUID.randomUUID().toString() + ".bin");
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
            out.flush();
        }
        return file;
    }

    /** Arquivo preparado desta chamada, só se estiver na pasta temporária do app. */
    private File pendingFileOf(PluginCall call) {
        String path = call.getString(PENDING_KEY);
        if (path == null) return null;
        File file = new File(path);
        File parent = file.getParentFile();
        try {
            if (parent == null || !parent.getCanonicalPath().equals(pendingDir().getCanonicalPath())) return null;
        } catch (IOException e) {
            return null;
        }
        return file.isFile() ? file : null;
    }

    /** O único arquivo preparado na pasta temporária (só há uma janela "Salvar como" por vez). */
    private File singlePending() {
        File[] files = pendingDir().listFiles();
        return files != null && files.length == 1 && files[0].isFile() ? files[0] : null;
    }

    private void completeWithoutCall(ActivityResult result) {
        File pending = singlePending();
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (result.getResultCode() == Activity.RESULT_OK && uri != null) {
            ContentResolver resolver = getContext().getContentResolver();
            try {
                if (pending == null) throw new FileNotFoundException("Arquivo preparado não encontrado.");
                write(resolver, uri, readAll(pending));
            } catch (Exception e) {
                deleteQuietly(resolver, uri);
            }
        }
        deletePending(pending);
    }

    private static void deletePending(File file) {
        if (file != null && !file.delete() && file.exists()) file.deleteOnExit();
    }

    private static byte[] readAll(File file) throws IOException {
        try (InputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.max(32, file.length()))) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /** "wt" (truncar) evita sobras de um arquivo maior; alguns provedores só aceitam "w". */
    private static void write(ContentResolver resolver, Uri uri, byte[] bytes) throws IOException {
        OutputStream out;
        try {
            out = resolver.openOutputStream(uri, "wt");
        } catch (FileNotFoundException | IllegalArgumentException e) {
            out = resolver.openOutputStream(uri, "w");
        }
        if (out == null) throw new IOException("Fluxo de gravação indisponível.");
        try (OutputStream o = out) {
            o.write(bytes);
            o.flush();
        }
    }

    /** Remove o documento vazio criado pela janela quando a gravação falha. */
    private static void deleteQuietly(ContentResolver resolver, Uri uri) {
        try {
            DocumentsContract.deleteDocument(resolver, uri);
        } catch (Exception ignored) {
            // sem permissão para excluir ou provedor não suporta: nada a fazer
        }
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // nome indisponível em alguns provedores
        }
        return null;
    }
}
