/** beta.5: vibração — desligada não chama nada; ligada usa o plugin do feedback tátil do sistema. */
const perform = vi.fn(async (_opts: { strong: boolean }) => ({ performed: true }));
const registerPlugin = vi.fn(() => ({ perform }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin,
  SystemBars: {}, SystemBarsStyle: {}, SystemBarType: {},
}));

describe('hapticSuccess', () => {
  beforeEach(() => { perform.mockClear(); registerPlugin.mockClear(); });

  it('desligada (padrão): nenhuma chamada ao Android', async () => {
    const { hapticSuccess } = await import('./native');
    await hapticSuccess(false, true);
    expect(registerPlugin).not.toHaveBeenCalled();
    expect(perform).not.toHaveBeenCalled();
  });

  it('ligada: um toque pelo plugin OficioHaptics (que segue o ajuste do Android), forte só nas conquistas', async () => {
    const { hapticSuccess } = await import('./native');
    await hapticSuccess(true);
    await hapticSuccess(true, true);
    expect(registerPlugin).toHaveBeenCalledWith('OficioHaptics');
    expect(perform.mock.calls.map((c) => c[0])).toEqual([{ strong: false }, { strong: true }]);
  });

  it('se o aparelho recusar, o app segue sem erro', async () => {
    perform.mockRejectedValueOnce(new Error('sem vibrador'));
    const { hapticSuccess } = await import('./native');
    await expect(hapticSuccess(true)).resolves.toBeUndefined();
  });
});
