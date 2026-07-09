import { supabase } from "@/integrations/supabase/client";

/** Christian-Wolf-Starter-Pack: kuratierte Themen + typische Falschaussagen. */
export const STARTER_PACK: Array<{
  name: string;
  description: string;
  color: string;
  claims: Array<{
    text: string;
    why_problematic: string;
    correct_statement: string;
  }>;
}> = [
  {
    name: "Kreatin",
    description: "Mythen rund um Kreatin-Monohydrat und Muskelaufbau",
    color: "amber",
    claims: [
      {
        text: "Kreatin schädigt die Nieren.",
        why_problematic:
          "Widerspricht der Studienlage. Bei gesunden Menschen zeigen Langzeitstudien keine Nierenschädigung.",
        correct_statement:
          "Kreatin ist eines der bestuntersuchten Supplemente und für gesunde Erwachsene sicher.",
      },
      {
        text: "Man muss Kreatin zyklisch absetzen.",
        why_problematic: "Es gibt keinen physiologischen Grund für Ladephasen oder Off-Zyklen.",
        correct_statement: "Dauerhafte Einnahme von 3–5 g/Tag ist sicher und effektiv.",
      },
    ],
  },
  {
    name: "Süßstoffe",
    description: "Aspartam, Sucralose, Stevia — Krebs- und Insulin-Behauptungen",
    color: "amber",
    claims: [
      {
        text: "Süßstoffe verursachen Krebs.",
        why_problematic:
          "Behördliche Bewertungen (EFSA, BfR) zeigen keine krebserregende Wirkung in üblichen Mengen.",
        correct_statement:
          "Zugelassene Süßstoffe gelten in ADI-Mengen als sicher.",
      },
      {
        text: "Süßstoffe treiben den Insulinspiegel hoch.",
        why_problematic:
          "Kalorienfreie Süßstoffe lösen bei gesunden Menschen keine relevante Insulinausschüttung aus.",
        correct_statement:
          "Der Insulineffekt ist minimal und klinisch nicht relevant.",
      },
    ],
  },
  {
    name: "Abnehmen",
    description: "Diäten, Kalorienbilanz, „Wundermittel“",
    color: "amber",
    claims: [
      {
        text: "Man kann gezielt an bestimmten Stellen abnehmen (Spot Reduction).",
        why_problematic: "Fettverlust ist systemisch — lokale Übungen verbrennen kaum Fett an der trainierten Stelle.",
        correct_statement:
          "Fett wird global durch Kaloriendefizit reduziert, nicht lokal.",
      },
      {
        text: "Kohlenhydrate am Abend machen dick.",
        why_problematic: "Nicht die Uhrzeit, sondern die Gesamtenergiebilanz ist entscheidend.",
        correct_statement:
          "Entscheidend ist die tägliche Kalorienbilanz, nicht der Verzehrszeitpunkt.",
      },
    ],
  },
  {
    name: "Muskelaufbau",
    description: "Trainings- und Ernährungsmythen",
    color: "amber",
    claims: [
      {
        text: "Man braucht mindestens 2 g Protein pro kg Körpergewicht.",
        why_problematic:
          "Für die meisten Sportler reichen 1,4–1,8 g/kg. Mehr bringt keinen zusätzlichen Muskelaufbau.",
        correct_statement:
          "1,6 g/kg sind für die meisten optimal (Metaanalyse Morton et al. 2018).",
      },
      {
        text: "Das anabole Fenster nach dem Training ist entscheidend.",
        why_problematic:
          "Der Proteinintake über den Tag ist wichtiger als das Timing direkt nach dem Training.",
        correct_statement:
          "Tagesgesamtprotein ist der Haupttreiber, nicht das Timing.",
      },
    ],
  },
  {
    name: "Darmgesundheit",
    description: "Detox, Reinigungen, Mikrobiom-Behauptungen",
    color: "amber",
    claims: [
      {
        text: "Man muss den Darm regelmäßig „entgiften“.",
        why_problematic: "Leber und Nieren übernehmen die Entgiftung — der Darm braucht keine externen Kuren.",
        correct_statement:
          "Es gibt keine wissenschaftliche Grundlage für Detox-Kuren.",
      },
    ],
  },
  {
    name: "Supplements",
    description: "Fatburner, „Immunbooster“, überteuerte Kombiprodukte",
    color: "amber",
    claims: [
      {
        text: "Fatburner-Supplements verbrennen zusätzlich Fett.",
        why_problematic:
          "Der Effekt ist marginal und klinisch irrelevant im Vergleich zum Kaloriendefizit.",
        correct_statement:
          "Es gibt keine Abkürzung zum Kaloriendefizit über Supplements.",
      },
    ],
  },
];

export async function seedStarterPack(userId: string): Promise<{ topics: number; claims: number }> {
  const insertedTopics = await supabase
    .from("topics")
    .insert(
      STARTER_PACK.map((t) => ({
        user_id: userId,
        name: t.name,
        description: t.description,
        color: t.color,
      })),
    )
    .select("id, name");

  if (insertedTopics.error) throw insertedTopics.error;

  const byName = new Map(insertedTopics.data.map((t) => [t.name, t.id]));

  const claimsRows = STARTER_PACK.flatMap((t) =>
    t.claims.map((c) => ({
      user_id: userId,
      topic_id: byName.get(t.name)!,
      text: c.text,
      why_problematic: c.why_problematic,
      correct_statement: c.correct_statement,
    })),
  );

  const insertedClaims = await supabase.from("claims").insert(claimsRows).select("id");
  if (insertedClaims.error) throw insertedClaims.error;

  return { topics: insertedTopics.data.length, claims: insertedClaims.data.length };
}
