import {describe,expect,test} from "bun:test";
import {skins} from "../src/lib/trainCatalog";
import * as catalog from "../src/lib/trainCatalog";

describe("train catalog",()=>{
  test("includes the complete set of visible skins in catalog order",()=>{
    expect(skins.map(skin=>skin.label)).toEqual([
      "Error","Aurora","Pastel Rainbow","Blue Checkers","Galaxy","Chocolate","Cheetah","Aurora Rainbow","Cheese","Abstract",
      "Space Aurora","Green Crystal","Purple Crystal","Diamond","Static","Lightning","Sparkle Time Yellow","Matrix","Sparkle Time Blue","Vantablack",
      "Sparkle Time Red","Leaves","Night Stars","Giraffe","Purple Foil","Bright Sky","Aqua","Yellow","Red","White","Teal","Black","Orange","Brown",
      "Gray","Pink","Purple","Green","Blue","Rainbow",
    ]);
  });

  test("uses unique slugs and valid preview colors",()=>{
    expect(new Set(skins.map(skin=>skin.id)).size).toBe(skins.length);
    for(const skin of skins) {
      expect(skin.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(skin.colors).toHaveLength(2);
      for(const color of skin.colors)expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("exports skins without powers or tools",()=>{
    expect(Object.keys(catalog)).toEqual(["skins"]);
  });
});
