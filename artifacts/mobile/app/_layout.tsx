import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  setAuthTokenGetter,
  setBaseUrl,
  setRequestInterceptor,
  setResponseInterceptor,
} from "@workspace/api-client-react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HT } from "@/constants/colors";
import {
  AuthProvider,
  getStoredToken,
  handleRotatedToken,
  useAuth,
} from "@/contexts/AuthContext";

SplashScreen.preventAutoHideAsync();

// --- Wire generated API client to the remote API server ----------------------
// EXPO_PUBLIC_DOMAIN is injected at build time and points at the proxy.
const apiHost = process.env.EXPO_PUBLIC_DOMAIN;
if (apiHost) {
  setBaseUrl(`https://${apiHost}`);
}
setAuthTokenGetter(() => getStoredToken());
setRequestInterceptor(({ headers }) => {
  // Tell the backend we're an iOS / native client so it skips CSRF and
  // returns a session token in the login response.
  headers.set("x-healthtrix-client", "ios");
});
setResponseInterceptor(({ response }) => handleRotatedToken(response));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
    },
  },
});

function AuthGate() {
  const { status } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (status === "loading") return;
    const inLogin = segments[0] === "login";
    if (status === "signed-out" && !inLogin) {
      router.replace("/login");
    } else if (status === "signed-in" && inLogin) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: HT.canvas },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="report/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="report/[id]/index" />
      <Stack.Screen
        name="report/[id]/add-line"
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="report/[id]/capture"
        options={{ presentation: "fullScreenModal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <StatusBar style="dark" />
                <AuthGate />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
