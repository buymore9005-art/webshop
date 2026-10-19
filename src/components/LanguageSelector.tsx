import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeLocale } from '../i18n/preference';

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const id = useId();
  return <div className="language-selector">
    <label htmlFor={id}>{t('language.label')}</label>
    <select id={id} value={normalizeLocale(i18n.resolvedLanguage)} onChange={event => void i18n.changeLanguage(normalizeLocale(event.target.value))}>
      <option value="id" lang="id">{t('language.id')}</option>
      <option value="en" lang="en">{t('language.en')}</option>
    </select>
  </div>;
}