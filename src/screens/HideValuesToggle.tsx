import { Eye, EyeOff } from 'lucide-react';
import { useApp, useErrorHandler, usePrefs } from '../state/AppContext';
import { IconButton } from '../ui/Button';
import { cx } from '../ui/cx';

/**
 * Atalho de "Ocultar valores" no cabeçalho do Painel e de Finanças (beta.7). É a mesma
 * preferência de Ajustes › Privacidade e acessibilidade, gravada só neste aparelho e aplicada na
 * hora em todas as telas. Botão alternável: o TalkBack lê "Ocultar valores, ativado/desativado".
 */
export function HideValuesToggle() {
  const { service } = useApp();
  const prefs = usePrefs();
  const onError = useErrorHandler();
  const hidden = prefs.hideValues;
  return (
    <IconButton
      label="Ocultar valores"
      aria-pressed={hidden}
      title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      data-hide-values={hidden ? 'on' : 'off'}
      onClick={() => service.updateDevicePrefs({ hideValues: !hidden }).catch(onError)}
      className={cx('text-white hover:bg-white/15 hover:text-white', hidden && 'bg-white/15')}
    >
      {hidden ? <EyeOff size={22} /> : <Eye size={22} />}
    </IconButton>
  );
}
