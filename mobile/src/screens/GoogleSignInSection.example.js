// INTEGRATION EXAMPLE — no existing mobile screens were found in this
// project to edit directly, so this file shows exactly how to drop
// Google Sign-In into your existing SignInScreen / SignUpScreen without
// touching their email/password form or styling. Copy the
// <GoogleSignInSection /> component below into your existing screen
// files (next to your existing "Sign in" / "Create account" button),
// using your app's existing button/loading/error components in place of
// the plain <Text>/<TouchableOpacity> placeholders used here — swap
// those two lines for whatever your app's design system already uses.

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useGoogleSignIn } from '../services/googleAuth';

export default function GoogleSignInSection() {
  const navigation = useNavigation();
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const { googleRequestReady, promptGoogleSignIn } = useGoogleSignIn({
    onSuccess: () => {
      setLoading(false);
      // Match whatever your existing email/password success flow
      // navigates to after login/registration.
      navigation.replace('Marketplace');
    },
    onError: (message) => {
      setLoading(false);
      setError(message);
    }
  });

  const handlePress = () => {
    setError('');
    setLoading(true);
    promptGoogleSignIn();
  };

  return (
    <View style={{ marginVertical: 12 }}>
      {error ? <Text style={{ color: '#8A2E10', marginBottom: 8 }}>{error}</Text> : null}

      <TouchableOpacity
        onPress={handlePress}
        disabled={!googleRequestReady || loading}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#DADCE0',
          borderRadius: 24,
          paddingVertical: 12,
          opacity: !googleRequestReady || loading ? 0.6 : 1
        }}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ fontWeight: '600', color: '#3C4043' }}>Continue with Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
