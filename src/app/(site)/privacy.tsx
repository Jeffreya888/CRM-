import { LegalDoc } from '../../components/site/LegalDoc';
import { PRIVACY, PRIVACY_INTRO } from '../../components/site/legalContent';
import { SitePage } from '../../components/site/SitePage';
import { APP_NAME } from '../../lib/config';

export default function Privacy() {
  return (
    <SitePage title="Privacy Policy" description={`How ${APP_NAME} collects, uses, shares and protects personal information, and the choices and rights you have.`}>
      <LegalDoc eyebrow="Legal" title="Privacy Policy" intro={PRIVACY_INTRO} sections={PRIVACY} />
    </SitePage>
  );
}
