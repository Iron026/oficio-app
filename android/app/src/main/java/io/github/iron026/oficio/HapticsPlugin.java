package io.github.iron026.oficio;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Toque de confirmação pelo feedback tátil do próprio Android.
 *
 * View.performHapticFeedback (sem FLAG_IGNORE_GLOBAL_SETTING) respeita o ajuste do sistema
 * "Vibração e tátil › Feedback tátil": se a pessoa desligou lá, nada vibra. Não precisa da
 * permissão VIBRATE. O app só chama quando a vibração está ligada em Ajustes (desligada por padrão).
 */
@CapacitorPlugin(name = "OficioHaptics")
public class HapticsPlugin extends Plugin {
    @PluginMethod
    public void perform(PluginCall call) {
        boolean strong = Boolean.TRUE.equals(call.getBoolean("strong", false));
        getActivity().runOnUiThread(() -> {
            View view = getBridge().getWebView();
            int effect;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                effect = strong ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.CLOCK_TICK;
            } else {
                effect = strong ? HapticFeedbackConstants.LONG_PRESS : HapticFeedbackConstants.VIRTUAL_KEY;
            }
            JSObject result = new JSObject();
            result.put("performed", view != null && view.performHapticFeedback(effect));
            call.resolve(result);
        });
    }
}
