import { useState } from 'react';
import { useCloud } from '../../state/CloudContext';
import { Card } from '../../ui/Misc';
import { AccountSection, StatusIcon, SyncSheet } from '../Account';
import { Group, OptionRow, SettingsSubpage } from './shared';

export function AccountPage() {
  const { linked, status } = useCloud();
  const [syncOpen, setSyncOpen] = useState(false);
  const shown = linked ? status : ({ state: 'desativado' } as const);
  return (
    <SettingsSubpage id="conta">
      <Group title="Conta Google">
        <AccountSection />
      </Group>
      <Card className="!p-0">
        <OptionRow
          label="Sincronização e nuvem"
          detail="Estado, pendências e o que vai para a nuvem"
          icon={<StatusIcon status={shown} size={18} />}
          onClick={() => setSyncOpen(true)}
        />
      </Card>
      <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
    </SettingsSubpage>
  );
}
