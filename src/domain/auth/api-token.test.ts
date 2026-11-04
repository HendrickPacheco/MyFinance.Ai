import { describe, expect, it } from 'vitest';
import { escopoSatisfaz, estadoToken } from './api-token';

describe('escopoSatisfaz', () => {
  it('um escopo satisfaz a si mesmo', () => {
    expect(escopoSatisfaz(['read'], 'read')).toBe(true);
    expect(escopoSatisfaz(['write'], 'write')).toBe(true);
    expect(escopoSatisfaz(['admin'], 'admin')).toBe(true);
  });

  it('hierarquia: admin satisfaz write e read', () => {
    expect(escopoSatisfaz(['admin'], 'write')).toBe(true);
    expect(escopoSatisfaz(['admin'], 'read')).toBe(true);
  });

  it('hierarquia: write satisfaz read, mas não admin', () => {
    expect(escopoSatisfaz(['write'], 'read')).toBe(true);
    expect(escopoSatisfaz(['write'], 'admin')).toBe(false);
  });

  it('read não satisfaz write nem admin', () => {
    expect(escopoSatisfaz(['read'], 'write')).toBe(false);
    expect(escopoSatisfaz(['read'], 'admin')).toBe(false);
  });

  it('token com vários escopos: basta um cobrir', () => {
    expect(escopoSatisfaz(['read', 'write'], 'write')).toBe(true);
  });

  it('token sem escopo nenhum não satisfaz nada', () => {
    expect(escopoSatisfaz([], 'read')).toBe(false);
  });
});

describe('estadoToken', () => {
  const agora = new Date('2026-11-04T12:00:00Z');

  it('válido: sem revogação e sem expiração', () => {
    expect(estadoToken({ revogadoEm: null, expiraEm: null }, agora)).toBe('valido');
  });

  it('válido: expiração no futuro', () => {
    const futuro = new Date('2026-12-01T00:00:00Z');
    expect(estadoToken({ revogadoEm: null, expiraEm: futuro }, agora)).toBe('valido');
  });

  it('revogado tem precedência sobre expirado', () => {
    const passado = new Date('2026-01-01T00:00:00Z');
    expect(estadoToken({ revogadoEm: agora, expiraEm: passado }, agora)).toBe('revogado');
  });

  it('expirado: expiraEm no passado, sem revogação', () => {
    const passado = new Date('2026-01-01T00:00:00Z');
    expect(estadoToken({ revogadoEm: null, expiraEm: passado }, agora)).toBe('expirado');
  });

  it('expiraEm exatamente agora conta como expirado (<=)', () => {
    expect(estadoToken({ revogadoEm: null, expiraEm: agora }, agora)).toBe('expirado');
  });
});
