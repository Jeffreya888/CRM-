import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import { Button, T } from '../ui';
import { space } from '../../lib/theme';
import type { SquarePayFormProps } from './SquarePayForm.types';

/**
 * In the app, Square's card form runs on the web page (it is a browser SDK), so
 * open this same page in the browser. Customers normally pay on the web.
 */
export function SquarePayForm({ pageUrl, buttonLabel }: SquarePayFormProps) {
  return (
    <View style={{ gap: space.sm }}>
      <Button icon="card-outline" title={buttonLabel} onPress={() => WebBrowser.openBrowserAsync(pageUrl)} />
      <T variant="small">Opens the secure Square payment page.</T>
    </View>
  );
}
