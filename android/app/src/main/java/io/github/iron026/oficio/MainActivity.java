package io.github.iron026.oficio;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Primeiro o Capacitor aplica o tema sem barra de título e monta o WebView.
        super.onCreate(savedInstanceState);
        // Depois: desenha atrás das barras de status e navegação (padrão do
        // Android 15+). Chamar antes criaria a janela com o tema da tela de
        // abertura, que tem barra de título. Áreas seguras: --safe-area-inset-*.
        EdgeToEdge.enable(this);
    }
}
