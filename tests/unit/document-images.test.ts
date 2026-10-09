import { describe, expect, it } from "vitest";
import { descriptionStoragePaths, documentToJSON } from "@/editor/document";
import { editorSchema } from "@/editor/schema";

function image(storagePath: string | null) {
  return editorSchema.nodes.image.create({ src: "https://media.test/x.png", storagePath, alt: "", title: null });
}

describe("description image references", () => {
  it("lists the R2 keys of uploaded images only", () => {
    const { doc, paragraph } = editorSchema.nodes;
    const description = documentToJSON(doc.create(null, [
      paragraph.create(null, editorSchema.text("Intro")),
      paragraph.create(null, [image("user/card/a.webp"), image(null), image("user/card/b.png")]),
    ]));
    expect(descriptionStoragePaths(description)).toEqual(["user/card/a.webp", "user/card/b.png"]);
  });

  it("tolerates legacy or invalid descriptions", () => {
    expect(descriptionStoragePaths(null)).toEqual([]);
    expect(descriptionStoragePaths("texte brut")).toEqual([]);
  });
});
