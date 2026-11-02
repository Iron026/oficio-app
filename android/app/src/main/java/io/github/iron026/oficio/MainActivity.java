package io.github.iron026.oficio;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Desenha atrás das barras de status e navegação (padrão do Android 15+).
        // As áreas seguras são tratadas no CSS via --safe-area-inset-* (SystemBars).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
