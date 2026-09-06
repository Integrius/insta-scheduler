import { describe, it, expect } from 'vitest';
import { validateScheduleForm } from './formValidation.js';

const validValues = {
  videoSelected: true,
  accountId: 'acc-1',
  date: '2099-01-01',
  caption: 'Hello world',
  password: 'secret',
};

describe('validateScheduleForm', () => {
  it('returns no errors for valid input', () => {
    expect(validateScheduleForm(validValues)).toEqual([]);
  });

  it('requires a video to be selected', () => {
    const errors = validateScheduleForm({ ...validValues, videoSelected: false });
    expect(errors).toContain('Selecione um vídeo.');
  });

  it('requires an account to be chosen', () => {
    const errors = validateScheduleForm({ ...validValues, accountId: '' });
    expect(errors).toContain('Escolha uma conta do Instagram.');
  });

  it('requires a date', () => {
    const errors = validateScheduleForm({ ...validValues, date: '' });
    expect(errors).toContain('Escolha uma data de publicação.');
  });

  it('rejects a date in the past', () => {
    const errors = validateScheduleForm({ ...validValues, date: '2020-01-01' });
    expect(errors).toContain('A data precisa ser hoje ou uma data futura.');
  });

  it('requires a non-empty caption', () => {
    const errors = validateScheduleForm({ ...validValues, caption: '   ' });
    expect(errors).toContain('A legenda não pode ficar vazia.');
  });

  it('requires the password field', () => {
    const errors = validateScheduleForm({ ...validValues, password: '' });
    expect(errors).toContain('Digite a senha.');
  });

  it('accumulates multiple errors at once', () => {
    const errors = validateScheduleForm({ videoSelected: false, accountId: '', date: '', caption: '', password: '' });
    expect(errors.length).toBe(5);
  });
});
