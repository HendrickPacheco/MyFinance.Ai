import { describe, it, expect } from 'vitest';
import { overrideParaEnviar } from './override-verba';

const desp = { tipo: 'DESPESA', ehParcela: false, override: 'DIA_A_DIA' } as const;

describe('overrideParaEnviar', () => {
  it('sem verba: não envia', () => {
    expect(overrideParaEnviar(undefined, { grupo: 'VARIAVEL', tipoVerba: 'EXTRA' }, 'EXTRA')).toBeUndefined();
  });
  it('seletor escondido pela categoria: limpa (null)', () => {
    expect(overrideParaEnviar(desp, { grupo: 'FIXO', tipoVerba: 'EXTRA' }, 'DIA_A_DIA')).toBeNull();
    expect(overrideParaEnviar(desp, undefined, 'DIA_A_DIA')).toBeNull();
    expect(overrideParaEnviar(desp, { grupo: 'VARIAVEL' }, 'DIA_A_DIA')).toBeNull();
  });
  it('visível: envia a seleção, vazio vira null', () => {
    const cat = { grupo: 'VARIAVEL', tipoVerba: 'EXTRA' } as const;
    expect(overrideParaEnviar(desp, cat, 'DIA_A_DIA')).toBe('DIA_A_DIA');
    expect(overrideParaEnviar(desp, cat, '')).toBeNull();
  });
});
