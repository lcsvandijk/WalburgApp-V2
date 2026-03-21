import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking } from 'react-native';

import { appConfig } from '../constants/appConfig';

function isWebUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function openExternalUrl(url: string, fallbackMessage?: string) {
  const target = url.trim();

  if (!target) {
    return false;
  }

  if (isWebUrl(target)) {
    try {
      await WebBrowser.openBrowserAsync(target);
      return true;
    } catch {
      // Fall back to the native Linking API when the in-app browser is unavailable.
    }
  }

  try {
    const supported = await Linking.canOpenURL(target);

    if (!supported) {
      throw new Error('Deze link wordt niet ondersteund.');
    }

    await Linking.openURL(target);
    return true;
  } catch {
    Alert.alert(
      appConfig.school.shortName,
      fallbackMessage ?? 'Deze link kon niet worden geopend op dit apparaat.',
    );
    return false;
  }
}
