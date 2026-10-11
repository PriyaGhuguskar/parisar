// PhotoGrid — 1–4 post-photo thumbnails with a tap-to-lightbox modal.
//
// Visual contract per 06-UI-SPEC.md Screen 4 §PostCard PhotoGrid (MyGate feed convention):
//   - 1 photo  → full-width 4:3
//   - 2 photos → two 1:1 halves (gap-1)
//   - 3–4      → 2×2 grid of 1:1 squares (gap-1, rounded-lg; 3 leaves the last cell blank)
//   - expo-image with a signed URL transform width 400 q80 (Phase 4 thumbnail pattern)
//   - tap any thumbnail → full-screen Modal lightbox (resizeMode contain)
//
// Reusable on PostCard, post detail, and ModerationCard. Photos are passed as an
// array of attachment rows ({ id, storage_key }) plus the supabase client + bucket;
// the grid resolves a signed (transformed) thumbnail URL per photo and a full signed
// URL for the lightbox.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { COMMUNITY_BUCKET } from "@parisar/api-client";
import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, Modal, Pressable, View } from "react-native";

const GAP = 4;

/**
 * Resolve signed URLs for a list of attachments. Returns a map of
 * { [storageKey]: { thumb, full } }. Thumbnails are transformed to width 400 q80;
 * the lightbox uses an untransformed signed URL.
 */
const SIGNED_URL_TTL_S = 3600;

async function signThumb(bucket, key) {
  try {
    const { data } = await bucket.createSignedUrl(key, SIGNED_URL_TTL_S, {
      transform: { width: 400, quality: 80 },
    });
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function signFullBatch(bucket, keys) {
  try {
    const { data } = await bucket.createSignedUrls(keys, SIGNED_URL_TTL_S);
    return new Map((data ?? []).map((row) => [row.path, row.signedUrl ?? null]));
  } catch {
    return new Map();
  }
}

function useSignedPhotoUrls(supabase, attachments) {
  const [urls, setUrls] = useState({});
  // Re-sign only when the set of keys changes, not on every new array identity
  // (feeds re-render rows on each realtime refresh).
  const keysSig = (attachments ?? [])
    .map((a) => a?.storage_key)
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    let active = true;
    const keys = keysSig ? keysSig.split("|") : [];
    if (!supabase || keys.length === 0) {
      setUrls({});
      return undefined;
    }
    (async () => {
      const bucket = supabase.storage.from(COMMUNITY_BUCKET);
      // Thumbnails need a per-file transform; full-size URLs go in one batch.
      const [thumbs, fulls] = await Promise.all([
        Promise.all(keys.map((key) => signThumb(bucket, key))),
        signFullBatch(bucket, keys),
      ]);
      const next = {};
      keys.forEach((key, i) => {
        next[key] = { thumb: thumbs[i], full: fulls.get(key) ?? null };
      });
      if (active) setUrls(next);
    })();
    return () => {
      active = false;
    };
  }, [supabase, keysSig]);

  return urls;
}

/**
 * @param {{
 *   attachments: Array<{ id?: string, storage_key: string }>,
 *   supabase: object,
 * }} props
 */
export function PhotoGrid({ attachments = [], supabase }) {
  const { t } = useTranslation(["community", "auth"]);
  const urls = useSignedPhotoUrls(supabase, attachments);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const photos = (attachments ?? []).slice(0, 4);
  if (photos.length === 0) return null;

  const openLightbox = (key) => {
    const full = urls[key]?.full;
    if (full) setLightboxUrl(full);
  };

  return (
    <>
      {renderLayout(photos, urls, openLightbox)}

      {/* Lightbox modal — resizeMode contain (full-screen) */}
      <Modal
        visible={!!lightboxUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUrl(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
          onPress={() => setLightboxUrl(null)}
          accessibilityRole="button"
          accessibilityLabel={t("auth:common.closePhoto")}
        >
          {lightboxUrl ? (
            <Image
              source={{ uri: lightboxUrl }}
              style={{
                width: Dimensions.get("window").width,
                height: Dimensions.get("window").height * 0.8,
              }}
              contentFit="contain"
            />
          ) : null}
          <View
            style={{
              position: "absolute",
              top: 48,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(23,23,23,0.6)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={22} color="#ffffff" />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function PhotoThumb({ attachment, urls, onPress, aspectRatio = 1 }) {
  const { t } = useTranslation(["community", "auth"]);
  const key = attachment?.storage_key;
  const url = urls[key]?.thumb ?? null;
  return (
    <Pressable
      onPress={() => onPress(key)}
      accessibilityRole="button"
      accessibilityLabel={t("auth:common.openPhoto")}
      style={{
        flex: 1,
        aspectRatio,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#F1F5F9",
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
    </Pressable>
  );
}

function renderLayout(photos, urls, onPress) {
  // 1 photo → full-width 4:3
  if (photos.length === 1) {
    return (
      <View>
        <PhotoThumb attachment={photos[0]} urls={urls} onPress={onPress} aspectRatio={4 / 3} />
      </View>
    );
  }

  // 2 photos → two 1:1 halves
  if (photos.length === 2) {
    return (
      <View style={{ flexDirection: "row", gap: GAP }}>
        <PhotoThumb attachment={photos[0]} urls={urls} onPress={onPress} />
        <PhotoThumb attachment={photos[1]} urls={urls} onPress={onPress} />
      </View>
    );
  }

  // 3–4 photos → 2×2 grid (3 leaves the last cell blank for stable height)
  const row1 = photos.slice(0, 2);
  const row2 = photos.slice(2, 4);
  return (
    <View style={{ gap: GAP }}>
      <View style={{ flexDirection: "row", gap: GAP }}>
        {row1.map((p) => (
          <PhotoThumb key={p.id ?? p.storage_key} attachment={p} urls={urls} onPress={onPress} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: GAP }}>
        {row2.map((p) => (
          <PhotoThumb key={p.id ?? p.storage_key} attachment={p} urls={urls} onPress={onPress} />
        ))}
        {row2.length === 1 ? <View style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}
