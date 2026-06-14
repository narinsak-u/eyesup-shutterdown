/** A gallery photo entry, mapped from Contentful `gallery` entries. */
export interface Photo {
  id: string;
  thumbSrc: string;
  src: string;
  alt: string;
  location: string;
  date: string;
  type: "portrait" | "landscape" | "square";
  category: string;
}
