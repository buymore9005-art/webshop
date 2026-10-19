import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeLocale } from '../i18n/preference';

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const id = useId();
  return <div className="language-selector">
    <select id={id} aria-label={t('language.label')} value={normalizeLocale(i18n.resolvedLanguage)} onChange={event => void i18n.changeLanguage(normalizeLocale(event.target.value))}>
      <option value="id" lang="id">ID</option>
      <option value="en" lang="en">ENG</option>
    </select>
  </div>;
}