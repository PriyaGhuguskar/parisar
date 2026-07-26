import { useFocusEffect, useRouter } from "expo-router";
import { Search, Users } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { MemberRow } from "../../../components/directory/MemberRow";
import { RecentJoinersSection } from "../../../components/directory/RecentJoinersSection";
import { useAuthStore } from "../../../lib/auth-store";
import { getSupabase } from "../../../lib/supabase";

// ---------------------------------------------------------------------------
// DirectoryScreen
// ---------------------------------------------------------------------------
export default function DirectoryScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const session = useAuthStore((s) => s.session);
  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const currentUserRole = jwtMeta.role ?? "member";

  const [members, setMembers] = useState([]);
  const [wings, setWings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWing, setSelectedWing] = useState(null); // null = All

  // ---------------------------------------------------------------------------
  // Fetch active members + wing list on focus
  // ---------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        if (!societyId) return;
        setLoading(true);
        setError(null);
        try {
          const supabase = getSupabase();

          const { data, error: fetchError } = await supabase
            .from("society_memberships")
            .select(`
              id, user_id, flat_id, residency, joined_at, role, status,
              profiles:user_id (full_name),
              flats:flat_id (number, wings:wing_id (id, name))
            `)
            .eq("society_id", societyId)
            .eq("status", "active")
            .order("joined_at", { ascending: false });

          if (fetchError) throw fetchError;
          if (!active) return;

          const rows = data ?? [];
          setMembers(rows);

          // Derive unique wings for filter chips
          const wingMap = new Map();
          for (const row of rows) {
            const w = row?.flats?.wings;
            if (w?.id && w?.name) wingMap.set(w.id, w.name);
          }
          setWings(Array.from(wingMap.entries()).map(([id, name]) => ({ id, name })));
        } catch (err) {
          if (active) setError(err.message ?? "Failed to load members.");
        } finally {
          if (active) setLoading(false);
        }
      }

      load();
      return () => {
        active = false;
      };
    }, [societyId]),
  );

  // ---------------------------------------------------------------------------
  // Filter by wing + search query
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    let rows = members;

    if (selectedWing) {
      rows = rows.filter((m) => m?.flats?.wings?.id === selectedWing);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter((m) => {
        const name = (m?.profiles?.full_name ?? "").toLowerCase();
        const flat = (m?.flats?.number ?? "").toLowerCase();
        const wing = (m?.flats?.wings?.name ?? "").toLowerCase();
        return name.includes(q) || flat.includes(q) || wing.includes(q);
      });
    }

    return rows;
  }, [members, selectedWing, searchQuery]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100">
        <View className="flex-row items-center gap-3 mb-3">
          <Pressable
            onPress={() => router.back()}
            className="p-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text className="text-base text-brand-500">{"←"}</Text>
          </Pressable>
          <Text className="text-xl font-semibold text-neutral-900 flex-1">
            {t("directory.title")}
          </Text>
          {/* Member count badge */}
          <View className="bg-neutral-200 rounded-full px-2 py-0.5">
            <Text className="text-xs text-neutral-600">{members.length}</Text>
          </View>
        </View>

        {/* Search input */}
        <View className="flex-row items-center bg-neutral-100 rounded-xl px-3 h-10 gap-2">
          <Search size={16} color="#6e6e6e" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("directory.search")}
            placeholderTextColor="#6e6e6e"
            className="flex-1 text-base text-neutral-900"
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* Wing filter chips */}
      {wings.length > 0 && (
        <View className="bg-white border-b border-neutral-100">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-4 py-2 gap-2"
          >
            {/* "All" chip */}
            <Pressable
              onPress={() => setSelectedWing(null)}
              className={`rounded-full px-3 py-1 border ${
                selectedWing === null
                  ? "bg-brand-50 border-brand-500"
                  : "bg-neutral-100 border-transparent"
              }`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedWing === null }}
            >
              <Text
                className={`text-sm ${
                  selectedWing === null ? "text-brand-500" : "text-neutral-400"
                }`}
              >
                {t("directory.filterAll")}
              </Text>
            </Pressable>

            {wings.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => setSelectedWing(w.id)}
                className={`rounded-full px-3 py-1 border ${
                  selectedWing === w.id
                    ? "bg-brand-50 border-brand-500"
                    : "bg-neutral-100 border-transparent"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedWing === w.id }}
              >
                <Text
                  className={`text-sm ${
                    selectedWing === w.id ? "text-brand-500" : "text-neutral-400"
                  }`}
                >
                  {w.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Error */}
      {error ? (
        <View className="mx-4 mt-3 bg-danger-50 border border-danger-200 rounded-xl p-3">
          <Text className="text-sm text-danger-700">{error}</Text>
        </View>
      ) : null}

      {/* Loading */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#12715A" />
        </View>
      ) : filtered.length === 0 ? (
        /* Empty state */
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Users size={48} color="#d4d4d4" />
          <Text className="text-xl text-neutral-600 text-center">{t("directory.noResults")}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MemberRow membership={item} currentUserRole={currentUserRole} />
          )}
          ListHeaderComponent={
            <View className="pt-3">
              <RecentJoinersSection societyId={societyId} />
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
