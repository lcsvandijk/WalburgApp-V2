import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { MagisterTokenSet } from '../types/magister';

WebBrowser.maybeCompleteAuthSession();

const MAGISTER_CLIENT_ID = 'M6LOAPP';
const MAGISTER_AUTH_ENDPOINT = 'https://accounts.magister.net/connect/authorize';
const MAGISTER_TOKEN_ENDPOINT = 'https://accounts.magister.net/connect/token';
const MAGISTER_REDIRECT_URI = 'm6loapp://oauth2redirect/';
const MAGISTER_SCOPE = 'openid profile offline_access magister.mobile magister.ecs';
const MAGISTER_TENANT = 'ozhw.magister.net';

function generateRandomString(length: number) {
  let output = '';

  while (output.length < length) {
    output += Crypto.randomUUID().replace(/-/g, '');
  }

  return output.slice(0, length);
}

function toBase64Url(value: string) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toFormBody(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

async function createPkcePair() {
  const verifier = generateRandomString(64);
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });

  return {
    verifier,
    challenge: toBase64Url(challenge),
  };
}

function buildAuthorizationUrl({
  codeChallenge,
  nonce,
  state,
  usernameHint,
}: {
  codeChallenge: string;
  nonce: string;
  state: string;
  usernameHint?: string;
}) {
  const params = new URLSearchParams({
    client_id: MAGISTER_CLIENT_ID,
    redirect_uri: MAGISTER_REDIRECT_URI,
    scope: MAGISTER_SCOPE,
    response_type: 'code id_token',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    acr_values: `tenant:${MAGISTER_TENANT}`,
    prompt: 'select_account',
  });

  if (usernameHint?.trim()) {
    params.set('login_hint', usernameHint.trim());
  }

  return `${MAGISTER_AUTH_ENDPOINT}?${params.toString()}`;
}

function parseAuthCallback(callbackUrl: string) {
  const parsed = new URL(callbackUrl.replace('#', '?'));

  return {
    code: parsed.searchParams.get('code'),
    state: parsed.searchParams.get('state'),
    idToken: parsed.searchParams.get('id_token') ?? undefined,
  };
}

async function readTokenResponse(response: Response, fallbackMessage: string) {
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(raw || fallbackMessage);
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

function mapTokenSet(tokenSet: Record<string, unknown>, fallbackIdToken?: string): MagisterTokenSet {
  const expiresIn = Number(tokenSet.expires_in ?? 3600);

  return {
    accessToken: String(tokenSet.access_token ?? ''),
    refreshToken: tokenSet.refresh_token ? String(tokenSet.refresh_token) : undefined,
    idToken: tokenSet.id_token ? String(tokenSet.id_token) : fallbackIdToken,
    xsrfToken: tokenSet.access_token ? String(tokenSet.access_token) : undefined,
    tokenExpiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function loginWithMagisterOAuth(usernameHint?: string) {
  if (Platform.OS === 'web') {
    throw new Error('Deze Magister OAuth-flow werkt alleen in een native build op iPhone of Android.');
  }

  const state = generateRandomString(50);
  const nonce = generateRandomString(32);
  const { verifier, challenge } = await createPkcePair();
  const authorizationUrl = buildAuthorizationUrl({
    codeChallenge: challenge,
    nonce,
    state,
    usernameHint,
  });

  const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, MAGISTER_REDIRECT_URI);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('De Magister-login is geannuleerd.');
  }

  if (result.type !== 'success' || !result.url) {
    throw new Error('Geen geldige redirect ontvangen van Magister.');
  }

  const callback = parseAuthCallback(result.url);

  if (!callback.code) {
    throw new Error('De autorisatiecode ontbreekt in de redirect van Magister.');
  }

  if (callback.state !== state) {
    throw new Error('De Magister-login response heeft een ongeldige state.');
  }

  const response = await fetch(MAGISTER_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormBody({
      code: callback.code,
      redirect_uri: MAGISTER_REDIRECT_URI,
      client_id: MAGISTER_CLIENT_ID,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });

  const tokenSet = await readTokenResponse(response, 'Tokenuitwisseling met Magister mislukte.');
  return mapTokenSet(tokenSet, callback.idToken);
}

export async function refreshMagisterAccessToken(refreshToken: string) {
  const response = await fetch(MAGISTER_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormBody({
      refresh_token: refreshToken,
      client_id: MAGISTER_CLIENT_ID,
      grant_type: 'refresh_token',
    }),
  });

  const tokenSet = await readTokenResponse(response, 'Vernieuwen van het Magister-token mislukte.');
  return mapTokenSet(tokenSet);
}
