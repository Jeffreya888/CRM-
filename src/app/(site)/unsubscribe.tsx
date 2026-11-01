// Unsubscribe link from early access emails: /unsubscribe?t=<token>
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SitePage } from '../../components/site/SitePage';
import { Container, Glass, Heading, P, site } from '../../components/site/primitives';
import { SUPPORT_EMAIL } from '../../lib/config';
import { callFunction } from '../../lib/supabase';

export default function Unsubscribe() {
  const { t } = useLocalSearchParams<{ t?: string }>();
  const token = typeof t === 'string' ? t : '';
  const [result, setResult] = useState<'done' | 'failed' | null>(null);
  const state = !token ? 'failed' : result ?? 'busy';

  useEffect(() => {
    if (!token) return;
    callFunction('early-access', { unsubscribe: token }).then(() => setResult('done'), () => setResult('failed'));
  }, [token]);

  return (
    <SitePage title="Unsubscribe" description="Stop Tarmo early access emails.">
      <Container style={{ paddingVertical: 96, alignItems: 'center' }}>
        <Glass padding={32} style={{ maxWidth: 520, width: '100%', alignItems: 'center' }}>
          {state === 'busy' ? <ActivityIndicator color={site.blueText} /> : (
            <View style={{ alignItems: 'center' }}>
              <Heading level={3} center>{state === 'done' ? 'You’re unsubscribed' : 'That link didn’t work'}</Heading>
              <P center style={{ marginTop: 8 }}>
                {state === 'done'
                  ? 'You won’t get any more early access emails from Tarmo.'
                  : `Email ${SUPPORT_EMAIL} and we’ll take you off the list.`}
              </P>
            </View>
          )}
        </Glass>
      </Container>
    </SitePage>
  );
}
