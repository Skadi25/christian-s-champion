import { chatJson, AIGatewayError } from "@/lib/ai/gateway.server";

/**
 * Query generation — for each claim we produce multiple search queries so
 * the discovery pool covers rephrasings, synonyms, and hashtag variants.
 * Results are cached per claim in `claims.query_variants` (jsonb) so we
 * only spend AI budget the first time.
 */

export type ClaimForQueries = {
  id: string;
  text: string;
  why_problematic: string | null;
  topic_name: string | null;
  query_variants: string[] | null;
};

const MAX_VARIANTS = 6;

export async function ensureQueryVariants(
  claim: ClaimForQueries,
  save: (variants: string[]) => Promise<void>,
): Promise<string[]> {
  if (Array.isArray(claim.query_variants) && claim.query_variants.length > 0) {
    return dedupeQueries([claim.text, ...claim.query_variants]).slice(0, MAX_VARIANTS + 1);
  }

  let ai: string[] = [];
  try {
    const res = await chatJson<{ variants?: string[] }>({
      system:
        "Du bist SEO-Analyst für YouTube-Suche. Erzeuge deutschsprachige Suchanfragen, die Videos finden, welche die genannte Falschaussage vertreten, erwähnen ODER widerlegen. Antworte STRICT als JSON: { \"variants\": string[] }. Genau 5 kurze, unterschiedliche Suchanfragen (2–6 Wörter). Nutze Synonyme, alltägliche Formulierungen und Hashtag-artige Begriffe. Keine Anführungszeichen um Wörter, keine Operatoren.",
      user: JSON.stringify({
        falschaussage: claim.text,
        thema: claim.topic_name ?? undefined,
        kontext: claim.why_problematic ?? undefined,
      }),
      temperature: 0.6,
    });
    ai = (res.variants ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, MAX_VARIANTS);
  } catch (e) {
    if (e instanceof AIGatewayError && e.status === 402) throw e;
    ai = [];
  }

  const all = dedupeQueries([claim.text, ...ai]).slice(0, MAX_VARIANTS + 1);
  // Persist the AI-generated variants (without the original claim text)
  await save(all.slice(1)).catch(() => undefined);
  return all;
}

function dedupeQueries(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of list) {
    const key = q.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q.trim());
  }
  return out;
}
