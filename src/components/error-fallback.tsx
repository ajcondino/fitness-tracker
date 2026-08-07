import { Pressable, StyleSheet, Text, View } from 'react-native';

type ErrorFallbackProps = {
  error: Error;
  retry: () => void;
};

export function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  return (
    <View style={styles.container} testID="error-fallback">
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error.message}</Text>
      <Pressable style={styles.button} onPress={retry} testID="error-fallback-retry">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  message: {
    textAlign: 'center',
    opacity: 0.7,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1e1e1e',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
