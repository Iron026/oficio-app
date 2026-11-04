import { ExternalLink, ShieldCheck, Type } from 'lucide-react';
import { isNative } from '../../platform/native';
import { useApp, useErrorHandler, usePrefs } from '../../state/AppContext';
import { useCloud } from '../../state/CloudContext';
import { sealsPhotoSyncEnabled } from '../../sync/features';
import { Card, Segmented, Switch } from '../../ui/Misc';
import { PRIVACY_POLICY_URL } from './pages';
import { Group, SettingsSubpage } from './shared';

export function PrivacyPage() {
  const { service } = useApp();
  const prefs = usePrefs();
  const onError = useErrorHandler();
  return (
    <SettingsSubpage id="privacidade">
      <Card className="!py-1">
        <Switch checked={prefs.hideValues} onChange={(v) => service.updateDevicePrefs({ hideValues: v }).catch(onError)} label="Ocultar valores" description="Mostra R$ ••••• no lugar dos valores, só neste aparelho" />
      </Card>
      <Group title="Animações" hint="“Reduzir” mostra comemorações, transições e a troca de paleta sem movimento neste aparelho.">
        <Segmented label="Animações" value={prefs.motion} onChange={(v) => service.updateDevicePrefs({ motion: v }).catch(onError)} options={[{ value: 'sistema', label: 'Seguir o sistema' }, { value: 'reduzir', label: 'Reduzir' }]} />
      </Group>
      <p className="text-sm text-muted">
        <Type size={15} className="mr-1 inline align-[-2px]" aria-hidden="true" />
        O tamanho do texto acompanha o ajuste de fonte do aparelho{isNative() ? ' (Configurações do Android › Tela › Tamanho da fonte)' : ''}.
      </p>
      <Group title="Privacidade">
        <PrivacyCard />
      </Group>
    </SettingsSubpage>
  );
}

export function PrivacyCard() {
  const { linked } = useCloud();
  return (
    <Card className="space-y-2 text-sm leading-relaxed">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-brand-600 dark:text-brand-300" aria-hidden="true" /> Seus dados são seus</p>
      {linked ? (
        <>
          <p className="text-muted">
            <strong>Com conta conectada:</strong> seus dados ficam neste aparelho e uma cópia é guardada na nuvem (Google Cloud Firestore, via Firebase), vinculada à sua conta
            Google. Regras de acesso permitem que somente a sua conta leia e grave esses dados. Do Google, o Ofício usa apenas nome, e-mail, foto e um identificador da conta.
          </p>
          {!sealsPhotoSyncEnabled() && <p className="text-muted">Nesta versão, a foto de perfil e os selos ficam só neste aparelho e no arquivo de backup; não vão para a nuvem.</p>}
          <p className="text-muted">Você pode exportar seus dados, desconectar ou excluir a conta e os dados da nuvem a qualquer momento em “Conta e sincronização”.</p>
        </>
      ) : (
        <p className="text-muted">
          <strong>Sem conta conectada:</strong> seus registros ficam salvos apenas neste aparelho e não são enviados para a internet. {isNative() ? 'O backup automático do Android está desativado.' : ''} Faça
          backups periódicos — desinstalar o app ou limpar os dados do navegador apaga as informações.
        </p>
      )}
      <p className="text-muted">Não vendemos dados nem os usamos para publicidade. O app não inclui SDKs de anúncios nem de análise de uso.</p>
      <p className="text-muted">
        <a
          className="inline-flex items-center gap-1.5 font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300"
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} aria-hidden="true" /> Ler Política de Privacidade
        </a>
      </p>
    </Card>
  );
}
