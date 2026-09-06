export function validateScheduleForm(values) {
  const errors = [];
  const { videoSelected, accountId, date, caption, password } = values;

  if (!videoSelected) errors.push('Selecione um vídeo.');
  if (!accountId) errors.push('Escolha uma conta do Instagram.');

  if (!date) {
    errors.push('Escolha uma data de publicação.');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) errors.push('A data precisa ser hoje ou uma data futura.');
  }

  if (!caption || caption.trim().length === 0) errors.push('A legenda não pode ficar vazia.');
  if (!password) errors.push('Digite a senha.');

  return errors;
}
