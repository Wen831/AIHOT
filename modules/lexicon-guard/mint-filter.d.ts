// The package ships no types of its own (dist/main/index.d.ts exists but package.json has no "types").
declare module "mint-filter" {
  export interface FilterData {
    words: string[];
    text: string;
  }
  export declare class Mint {
    constructor(keys: string[], ops?: { customCharacter?: string });
    filter(text: string, options?: { replace?: boolean }): FilterData;
    verify(text: string): boolean;
    add(key: string, build?: boolean): boolean;
    delete(key: string): "update" | "delete";
  }
  export default Mint;
}
