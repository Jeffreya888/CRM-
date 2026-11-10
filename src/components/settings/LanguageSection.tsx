// Language: English or Español, per person. Changes the technician screens, SOP steps and Ask Tarmo.
import { useState } from 'react';
import { notify } from '../FormSheet';
import { Card, ErrorBanner, Section, Segmented, T } from '../ui';
import { type Lang, useLang } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';

export function LanguageSection() {
  const lang = useLang();
  const { refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const change = async (next: Lang) => {
    if (next === lang) return;
    setError(null);
    try {
      await must(supabase.rpc('set_my_language', { p_language: next }));
      await refresh();
      notify(next === 'es' ? 'Idioma: Español' : 'Language: English',
        next === 'es' ? 'Tus trabajos, pasos de SOP y Ask Tarmo ahora están en español.' : 'Your screens, SOP steps and Ask Tarmo are in English.');
    } catch (e: any) { setError(friendlyError(e.message)); }
  };
  return (
    <Section title={lang === 'es' ? 'Idioma' : 'Language'} icon="language-outline">
      <Card>
        <T variant="muted" style={{ marginBottom: space.md }}>
          {lang === 'es'
            ? 'Solo cambia el idioma para ti. Tus trabajos, pasos de SOP y Ask Tarmo (también por voz) aparecen en español.'
            : 'Only changes the language for you. Spanish shows your jobs, SOP steps and Ask Tarmo (voice too) in Spanish.'}
        </T>
        <Segmented value={lang} onChange={change} options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} />
        <ErrorBanner message={error} />
      </Card>
    </Section>
  );
}
