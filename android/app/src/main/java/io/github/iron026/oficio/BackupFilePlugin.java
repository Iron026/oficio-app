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
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Salva arquivos (backup, extrato CSV/PDF) com o Storage Access Framework (janela "Salvar como" do Android).
 *
 * O usuário escolhe o local (Documentos, Downloads, Drive...). Não exige nenhuma
 * permissão de armazenamento: o app só recebe acesso ao documento escolhido.
 * Substitui a gravação por caminho direto em Documents/, que falha (EACCES)
 * quando a pasta/arquivo foi criado por uma instalação anterior do app.
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
        if ("base64".equals(encoding)) {
            try {
                Base64.decode(content, Base64.DEFAULT); // valida antes de abrir a janela
            } catch (IllegalArgumentException e) {
                call.reject("Arquivo inválido para salvar.", "INVALID_INPUT", e);
                return;
            }
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(call, intent, "onDocumentCreated");
        } catch (Exception e) {
            call.reject("Este aparelho não oferece a janela de salvar arquivos.", "UNAVAILABLE", e);
        }
    }

    @ActivityCallback
    private void onDocumentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data != null ? data.getData() : null;
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        // Texto (backup, CSV) em UTF-8; arquivos binários (PDF) chegam em base64.
        String content = call.getString("content", "");
        byte[] bytes = "base64".equals(call.getString("encoding", "utf8"))
            ? Base64.decode(content, Base64.DEFAULT)
            : content.getBytes(StandardCharsets.UTF_8);
        try {
            write(resolver, uri, bytes);
        } catch (SecurityException e) {
            deleteQuietly(resolver, uri);
            call.reject("O local escolhido não permitiu gravar o arquivo.", "PERMISSION_DENIED", e);
            return;
        } catch (Exception e) {
            deleteQuietly(resolver, uri);
            call.reject("Não foi possível gravar o arquivo no local escolhido.", "WRITE_FAILED", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", false);
        ret.put("uri", uri.toString());
        ret.put("name", displayName(resolver, uri));
        ret.put("bytes", bytes.length);
        call.resolve(ret);
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
