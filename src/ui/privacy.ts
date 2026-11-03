import { createContext, useContext } from 'react';

/**
 * Ocultar valores (Ajustes › Privacidade, por aparelho). Só a apresentação muda:
 * os dados e os cálculos continuam iguais. Fora do provedor, os valores aparecem.
 */
export const HideValuesContext = createContext(false);
export const useHideValues = () => useContext(HideValuesContext);
