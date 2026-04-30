import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HT } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

export default function TabLayout() {
  const { user } = useAuth();
  const isManager = user?.role === "Manager Approver";
  const showInbox = isManager;
  const showReports = !isManager || user?.isAlsoEmployee === true;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: HT.navy,
        tabBarInactiveTintColor: HT.ink4,
        tabBarLabelStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 11,
          letterSpacing: 0.2,
        },
        tabBarStyle: {
          backgroundColor: HT.surface,
          borderTopColor: HT.border,
          borderTopWidth: Platform.OS === "web" ? 1 : 0.5,
          height: Platform.OS === "web" ? 84 : undefined,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Reports",
          href: showReports ? "/(tabs)" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="file-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Approvals",
          href: showInbox ? "/(tabs)/inbox" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="check-square" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: "Receipts",
          href: showReports ? "/(tabs)/receipts" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="image" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
