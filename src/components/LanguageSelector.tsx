import { useTranslation } from 'react-i18next';
import { normalizeLocale } from '../i18n/preference';

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage);
  return <div className="language-selector" role="group" aria-label={t('language.label')}>
    <button type="button" lang="id" aria-label="Bahasa Indonesia" aria-pressed={locale === 'id'} onClick={() => void i18n.changeLanguage('id')}>ID</button>
    <span className="language-divider" aria-hidden="true">/</span>
    <button type="button" lang="en" aria-label="English" aria-pressed={locale === 'en'} onClick={() => void i18n.changeLanguage('en')}>ENG</button>
  </div>;
}