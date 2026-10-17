import { LegalDoc } from '../../components/site/LegalDoc';
import { TERMS, TERMS_INTRO } from '../../components/site/legalContent';
import { SitePage } from '../../components/site/SitePage';
import { APP_NAME } from '../../lib/config';

export default function Terms() {
  return (
    <SitePage title="Terms of Service" description={`The terms that govern your use of ${APP_NAME}, including subscriptions, the free trial, payments and the platform fee.`}>
      <LegalDoc eyebrow="Legal" title="Terms of Service" intro={TERMS_INTRO} sections={TERMS} />
    </SitePage>
  );
}
