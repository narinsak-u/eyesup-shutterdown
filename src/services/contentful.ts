import * as contentful from "contentful";
import type { Photo } from "@/types/gallery";

const client = contentful.createClient({
  space: import.meta.env.VITE_CONTENTFUL_SPACE as string,
  accessToken: import.meta.env.VITE_CONTENTFUL_ACCESS_TOKEN as string,
});

const VALID_TYPES = new Set(["portrait", "landscape", "square"]);

/** Validates and normalizes the photo type, falling back to "square" for unknown values. */
function validateType(value: string): Photo["type"] {
  if (VALID_TYPES.has(value)) return value as Photo["type"];
  return "square";
}

/** Recursively extracts plain text from a Contentful Rich Text document tree. */
function extractTextFromRichText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";

  const node = doc as Record<string, unknown>;
  const content = node.content as Array<Record<string, unknown>> | undefined;

  if (!content) {
    const value = node.value;
    return typeof value === "string" ? value : "";
  }

  return content
    .map((child) => extractTextFromRichText(child))
    .join(" ")
    .trim();
}

/** Extracts alt text from either a plain string or a Contentful Rich Text document. */
function getAltText(alt: unknown): string {
  if (!alt) return "";
  if (typeof alt === "string") return alt;
  return extractTextFromRichText(alt);
}

/** Formats an ISO date string to "Month, Year" (e.g. "May, 2026"). Passes through invalid values. */
function formatDate(raw: string): string {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;
  const month = date.toLocaleDateString("en-US", { month: "long" });
  return `${month}, ${date.getFullYear()}`;
}

/** Result of a paginated Contentful fetch. */
export interface FetchPhotosResult {
  photos: Photo[];
  total: number;
}

/** Fetches a page of gallery entries from Contentful, ordered by date descending. */
export async function fetchPhotos(skip = 0, limit = 9): Promise<FetchPhotosResult> {
  const response = await client.getEntries({
    content_type: "gallery",
    limit,
    skip,
    order: ["-fields.date"],
  });

  const photos = response.items.map((entry) => {
    const fields = entry.fields as Record<string, unknown>;
    const srcField = fields.src as
      | { fields?: { file?: { url?: string } } }
      | undefined;
    const imageUrl = srcField?.fields?.file?.url ?? "";
    const thumbSrc = imageUrl ? `https:${imageUrl}?w=600&fit=thumb&fm=webp` : "";
    const lightboxSrc = imageUrl ? `https:${imageUrl}?w=1600&fm=webp` : "";

    return {
      id: entry.sys.id,
      src: lightboxSrc,
      thumbSrc,
      alt: getAltText(fields.alt),
      location: fields.location as string,
      date: formatDate(fields.date as string),
      type: validateType(fields.type as string),
      category: fields.category as string,
    };
  });

  return { photos, total: response.total };
}
