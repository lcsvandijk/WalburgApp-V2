import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

interface LoginScreenProps {
  navigation: any;
}

// Endpoint
const discovery = {
  authorizationEndpoint: 'https://accounts.magister.net/connect/authorize',
  tokenEndpoint: 'https://accounts.magister.net/connect/token',
};

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: 'M6LOAPP', // Placeholder, may need to be correct
      scopes: ['openid', 'profile', 'magister.ecs.legacy'],
      redirectUri: makeRedirectUri({
        scheme: 'walburgapp',
      }),
    },
    discovery
  );

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      SecureStore.setItemAsync('access_token', access_token);
      navigation.goBack();
    }
  }, [response]);

  const handleLogin = () => {
    promptAsync();
  };

  return (
    <LinearGradient
      colors={['#008000', '#ADD8E6']}
      style={styles.container}
    >
      <Text style={styles.title}>Inloggen met Magister</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={!request}
      >
        <Text style={styles.buttonText}>Inloggen</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 50,
  },
  button: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'white',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
  },
});

export default LoginScreen;