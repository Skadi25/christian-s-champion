import { computeOpportunityScore, type Stance } from "./scoring";

/**
 * Hochwertige Demo-Daten für Christian Wolf.
 * Wird verwendet, wenn die App leer wirken würde (API-Limits, kein Discovery-Lauf).
 * Demo-Einträge sind über raw_metadata.demo = true erkennbar.
 */
type DemoClaim = {
  topic: string;
  text: string;
  why: string;
  videos: Array<{
    platform: "youtube" | "tiktok" | "instagram";
    creator: string;
    title: string;
    caption: string;
    views: number;
    likes: number;
    comments: number;
    stance: Stance;
    summary: string;
    reasoning: string;
    thumbnail: string;
    daysAgo: number;
  }>;
};

const DEMO_CLAIMS: DemoClaim[] = [
  {
    topic: "Ernährung",
    text: "Süßstoffe sind ungesund.",
    why: "Zugelassene Süßstoffe gelten in ADI-Mengen nach EFSA- und BfR-Bewertung als sicher.",
    videos: [
      {
        platform: "tiktok",
        creator: "@fitmitmarie",
        title: "Warum ich NIE wieder Süßstoff trinke 🚫",
        caption: "Aspartam macht dick und krank! Studien beweisen es. #diet #tiktokviral",
        views: 412_000,
        likes: 28_400,
        comments: 1_240,
        stance: "promotes",
        summary: "Behauptet pauschal, Aspartam sei giftig und mache dick — ohne Quellen.",
        reasoning: "Emotionales Fazit, keine Studienangaben, klassische Süßstoff-Panik.",
        thumbnail:
          "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&w=600&q=60",
        daysAgo: 1,
      },
      {
        platform: "youtube",
        creator: "GesundLeben Kanal",
        title: "Zero-Getränke: die stille Gefahr für dein Mikrobiom?",
        caption: "Wir schauen uns die Forschung zu Süßstoffen und Darmflora an.",
        views: 89_200,
        likes: 4_300,
        comments: 612,
        stance: "promotes",
        summary: "Verbreitet die These, Süßstoffe stören das Mikrobiom nachhaltig.",
        reasoning: "Zitiert eine einzelne Maus-Studie als Beweis für Menschen.",
        thumbnail:
          "https://images.unsplash.com/photo-1543362906-acfc16c67564?auto=format&fit=crop&w=600&q=60",
        daysAgo: 2,
      },
    ],
  },
  {
    topic: "Ernährung",
    text: "Kohlenhydrate am Abend machen dick.",
    why: "Entscheidend ist die tägliche Kalorienbilanz, nicht der Verzehrszeitpunkt.",
    videos: [
      {
        platform: "tiktok",
        creator: "@abnehmcoach_leo",
        title: "NIEMALS Carbs nach 18 Uhr! 😱",
        caption: "So habe ich 12 Kilo verloren — keine Kohlenhydrate am Abend.",
        views: 1_120_000,
        likes: 84_200,
        comments: 3_100,
        stance: "promotes",
        summary: "Verbreitet den Mythos, abendliche Kohlenhydrate machen automatisch dick.",
        reasoning: "Anekdote statt Evidenz, ignoriert Kaloriengesamtbilanz.",
        thumbnail:
          "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=60",
        daysAgo: 0,
      },
    ],
  },
  {
    topic: "Ernährung",
    text: "Datteln enthalten keinen Zucker.",
    why: "Datteln bestehen zu 60–70 % aus Fruchtzucker (Glukose, Fruktose).",
    videos: [
      {
        platform: "instagram",
        creator: "cleaneating.jana",
        title: "Datteln sind der perfekte Zuckerersatz — ganz ohne Zucker!",
        caption: "Datteln haben kaum Zucker und sind super gesund. #cleaneating",
        views: 240_000,
        likes: 18_900,
        comments: 890,
        stance: "promotes",
        summary: 'Nennt Datteln "zuckerfrei" — sachlich falsch.',
        reasoning: 'Verwechselt "kein zugesetzter Zucker" mit "kein Zucker".',
        thumbnail:
          "https://images.unsplash.com/photo-1601001435957-74f0958a93c5?auto=format&fit=crop&w=600&q=60",
        daysAgo: 3,
      },
    ],
  },
  {
    topic: "Ernährung",
    text: "Honig macht nicht dick.",
    why: "Honig ist überwiegend Zucker und liefert ca. 300 kcal pro 100 g.",
    videos: [
      {
        platform: "tiktok",
        creator: "@naturalhealing.de",
        title: "Warum Honig NICHT dick macht 🍯",
        caption: "Honig ist natürlich und wird anders verstoffwechselt als Zucker.",
        views: 356_000,
        likes: 22_100,
        comments: 1_450,
        stance: "promotes",
        summary: "Behauptet, Honig sei kalorisch harmlos — falsch.",
        reasoning: "Ignoriert, dass Honig zu ~80% aus Zucker besteht.",
        thumbnail:
          "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=600&q=60",
        daysAgo: 1,
      },
    ],
  },
  {
    topic: "Ernährung",
    text: "Frühstück ist die wichtigste Mahlzeit.",
    why: "Studien zeigen: Es kommt auf die Gesamternährung an — Frühstück ist optional.",
    videos: [
      {
        platform: "youtube",
        creator: "Familienküche TV",
        title: "Warum Kinder unbedingt frühstücken müssen",
        caption: "Ernährungsexpertin erklärt, warum das Frühstück so wichtig ist.",
        views: 145_000,
        likes: 6_100,
        comments: 420,
        stance: "promotes",
        summary: 'Wiederholt den Mythos "wichtigste Mahlzeit des Tages" pauschal.',
        reasoning: "Nutzt Autoritätsargument ohne aktuelle Studienlage.",
        thumbnail:
          "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=600&q=60",
        daysAgo: 5,
      },
    ],
  },
];

export async function seedDemoMatchesForUser(userId: string): Promise<{
  claims: number;
  videos: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Demo-Topic anlegen (idempotent per Name)
  const topicName = "Demo · Ernährungs-Mythen";
  let topicId: string;
  {
    const { data: existing } = await supabaseAdmin
      .from("topics")
      .select("id")
      .eq("user_id", userId)
      .eq("name", topicName)
      .maybeSingle();
    if (existing) {
      topicId = existing.id as string;
    } else {
      const { data, error } = await supabaseAdmin
        .from("topics")
        .insert({
          user_id: userId,
          name: topicName,
          description: "Beispiel-Daten für die Demo. Zeigt das Produktgefühl ohne API-Zugriff.",
          color: "purple",
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Demo-Topic fehlgeschlagen.");
      topicId = data.id as string;
    }
  }

  // 2. Claims (idempotent per text)
  const claimIds = new Map<string, string>();
  for (const dc of DEMO_CLAIMS) {
    const { data: existing } = await supabaseAdmin
      .from("claims")
      .select("id")
      .eq("user_id", userId)
      .eq("text", dc.text)
      .maybeSingle();
    if (existing) {
      claimIds.set(dc.text, existing.id as string);
      continue;
    }
    const { data, error } = await supabaseAdmin
      .from("claims")
      .insert({
        user_id: userId,
        topic_id: topicId,
        text: dc.text,
        why_problematic: dc.why,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Demo-Claim fehlgeschlagen.");
    claimIds.set(dc.text, data.id as string);
  }

  // 3. Videos + Matches
  let videoCount = 0;
  for (const dc of DEMO_CLAIMS) {
    const claimId = claimIds.get(dc.text)!;
    for (const dv of dc.videos) {
      const externalId = `demo_${dv.platform}_${hashLite(dv.title)}`;
      const publishedAt = new Date(Date.now() - dv.daysAgo * 86_400_000).toISOString();
      const { data: video, error: vErr } = await supabaseAdmin
        .from("videos")
        .upsert(
          {
            platform: dv.platform,
            external_id: externalId,
            url: `https://demo.local/${dv.platform}/${externalId}`,
            title: dv.title,
            description: dv.caption,
            channel_name: dv.creator,
            channel_id: `demo_${dv.creator}`,
            thumbnail_url: dv.thumbnail,
            published_at: publishedAt,
            view_count: dv.views,
            like_count: dv.likes,
            comment_count: dv.comments,
            duration_seconds: dv.platform === "tiktok" ? 42 : 480,
            language: "de",
            raw_metadata: { demo: true } as never,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "platform,external_id" },
        )
        .select("id")
        .single();
      if (vErr || !video) continue;

      const r = computeOpportunityScore({
        view_count: dv.views,
        like_count: dv.likes,
        comment_count: dv.comments,
        published_at: publishedAt,
        ai_confidence: 0.9,
        language: "de",
        stance: dv.stance,
      });

      await supabaseAdmin.from("video_matches").upsert(
        {
          user_id: userId,
          video_id: video.id,
          claim_id: claimId,
          topic_id: topicId,
          detected_claim: dc.text,
          opportunity_score: r.score,
          score_breakdown: { ...r.breakdown, _demo: true } as never,
          ai_confidence: 0.9,
          ai_summary: dv.summary,
          ai_reasoning: dv.reasoning,
          stance: dv.stance,
          matched_at: new Date().toISOString(),
          status: "new",
        },
        { onConflict: "user_id,video_id,claim_id" },
      );
      videoCount++;
    }
  }

  return { claims: claimIds.size, videos: videoCount };
}

function hashLite(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
