/** Ambient module declaration for the `diff` package — exposes only the subset of the API used by this project. */
declare module "diff" {
  export interface PatchOptions {
    context?: number;
  }
  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: PatchOptions,
  ): string;
}
